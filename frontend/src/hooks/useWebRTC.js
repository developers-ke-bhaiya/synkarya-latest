import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../store/callStore';
import { getSocket } from '../services/socket';
import {
  createPeerConnection, addStreamToPeer, replaceTrackOnPeer,
  getUserMedia, getDisplayMedia, stopStream,
} from '../services/webrtc';

export const useWebRTC = () => {
  const {
    setLocalStream, setRemoteStream, removeRemoteStream,
    addPeerConnection, removePeerConnection, setPeerInfo, removePeerInfo,
    currentRoom, audioEnabled, videoEnabled, isScreenSharing,
    setAudioEnabled, setVideoEnabled, setScreenStream, cleanupCall,
  } = useCallStore();

  const localStreamRef = useRef(null);
  const makingOfferRef = useRef(new Set());
  // FIX: per-peer ICE candidate queues & remoteDesc flags
  const iceCandidateQueues = useRef(new Map()); // uid → candidate[]
  const remoteDescSet = useRef(new Map()); // uid → bool
  const socket = getSocket();

  const initLocalStream = useCallback(async () => {
    try {
      const stream = await getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch {
      try {
        const audioOnly = await getUserMedia({ video: false, audio: true });
        localStreamRef.current = audioOnly;
        setLocalStream(audioOnly);
        setVideoEnabled(false);
        return audioOnly;
      } catch (err) { throw err; }
    }
  }, [setLocalStream, setVideoEnabled]);

  // FIX: flush queued ICE candidates for a peer
  const flushIce = useCallback(async (uid, pc) => {
    const queue = iceCandidateQueues.current.get(uid) || [];
    iceCandidateQueues.current.set(uid, []);
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }, []);

  const createPeer = useCallback((remoteUid, remoteDisplayName) => {
    const stream = localStreamRef.current;
    if (!stream) return null;

    const existing = useCallStore.getState().peerConnections.get(remoteUid);
    if (existing && existing.signalingState !== 'closed') return existing;

    const pc = createPeerConnection();
    addStreamToPeer(pc, stream);

    // FIX: use a STABLE remoteStream ref per peer — never create new MediaStream on each track
    const remoteStream = new MediaStream();
    setRemoteStream(remoteUid, remoteStream);

    pc.ontrack = ({ track }) => {
      // Add track to the same stream object — this keeps VideoTile's srcObject valid
      const existingStream = useCallStore.getState().remoteStreams.get(remoteUid);
      const target = existingStream || remoteStream;
      if (!target.getTracks().find(t => t.id === track.id)) {
        target.addTrack(track);
      }
      // Trigger re-render by updating store with SAME stream reference
      setRemoteStream(remoteUid, target);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && currentRoom?.roomId) {
        socket.emit('ice_candidate', { targetUid: remoteUid, candidate, roomId: currentRoom.roomId });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeerConnection(remoteUid);
        removeRemoteStream(remoteUid);
        removePeerInfo(remoteUid);
        iceCandidateQueues.current.delete(remoteUid);
        remoteDescSet.current.delete(remoteUid);
      }
    };

    // Init ICE queue for this peer
    if (!iceCandidateQueues.current.has(remoteUid)) iceCandidateQueues.current.set(remoteUid, []);
    remoteDescSet.current.set(remoteUid, false);

    addPeerConnection(remoteUid, pc);
    setPeerInfo(remoteUid, { displayName: remoteDisplayName });
    return pc;
  }, [addPeerConnection, setRemoteStream, removeRemoteStream, removePeerConnection,
      removePeerInfo, setPeerInfo, socket, currentRoom]);

  const sendOffer = useCallback(async (remoteUid, remoteDisplayName) => {
    const pc = createPeer(remoteUid, remoteDisplayName);
    if (!pc || makingOfferRef.current.has(remoteUid)) return;
    makingOfferRef.current.add(remoteUid);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { targetUid: remoteUid, offer: pc.localDescription, roomId: currentRoom?.roomId });
    } catch (err) {
      console.error('sendOffer error:', err);
    } finally {
      makingOfferRef.current.delete(remoteUid);
    }
  }, [createPeer, socket, currentRoom]);

  useEffect(() => {
    if (!socket) return;

    const onUsersInRoom = ({ users }) => users.forEach(({ uid, displayName }) => sendOffer(uid, displayName));
    const onUserJoined = ({ uid, displayName }) => setPeerInfo(uid, { displayName });

    const onOffer = async ({ offer, fromUid, fromDisplayName }) => {
      let pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') {
        pc = createPeer(fromUid, fromDisplayName);
        if (!pc) return;
      }
      try {
        const collision = offer.type === 'offer' &&
          (makingOfferRef.current.has(fromUid) || pc.signalingState !== 'stable');
        if (collision) {
          if (pc.signalingState !== 'stable') await pc.setLocalDescription({ type: 'rollback' });
          makingOfferRef.current.delete(fromUid);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescSet.current.set(fromUid, true);
        await flushIce(fromUid, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { targetUid: fromUid, answer: pc.localDescription, roomId: currentRoom?.roomId });
      } catch (err) { console.error('onOffer error:', err); }
    };

    const onAnswer = async ({ answer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescSet.current.set(fromUid, true);
        await flushIce(fromUid, pc);
      } catch (err) { console.error('onAnswer error:', err); }
    };

    // FIX: queue ICE if remoteDescription not set yet
    const onIce = async ({ candidate, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') return;
      if (remoteDescSet.current.get(fromUid)) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (err) { if (!err.message?.includes('Unknown ufrag')) console.error('ICE error:', err); }
      } else {
        const q = iceCandidateQueues.current.get(fromUid) || [];
        q.push(candidate);
        iceCandidateQueues.current.set(fromUid, q);
      }
    };

    const onUserLeft = ({ uid }) => {
      removePeerConnection(uid);
      removeRemoteStream(uid);
      removePeerInfo(uid);
      iceCandidateQueues.current.delete(uid);
      remoteDescSet.current.delete(uid);
    };

    const onPeerMedia = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerInfo(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    // FIX: renegotiate for screen share — properly flush ICE after remoteDesc
    const onRenegotiate = async ({ offer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescSet.current.set(fromUid, true);
        await flushIce(fromUid, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('renegotiate_answer', { targetUid: fromUid, answer: pc.localDescription, roomId: currentRoom?.roomId });
      } catch (err) { console.error('renegotiate error:', err); }
    };

    const onRenegotiateAnswer = async ({ answer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) return;
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
      catch (err) { console.error('renegotiateAnswer error:', err); }
    };

    socket.on('users_in_room', onUsersInRoom);
    socket.on('user_joined', onUserJoined);
    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('ice_candidate', onIce);
    socket.on('user_left', onUserLeft);
    socket.on('peer_media_state', onPeerMedia);
    socket.on('renegotiate', onRenegotiate);
    socket.on('renegotiate_answer', onRenegotiateAnswer);

    return () => {
      socket.off('users_in_room', onUsersInRoom);
      socket.off('user_joined', onUserJoined);
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice_candidate', onIce);
      socket.off('user_left', onUserLeft);
      socket.off('peer_media_state', onPeerMedia);
      socket.off('renegotiate', onRenegotiate);
      socket.off('renegotiate_answer', onRenegotiateAnswer);
    };
  }, [socket, currentRoom, createPeer, sendOffer, setPeerInfo,
      removePeerConnection, removeRemoteStream, removePeerInfo, flushIce]);

  const toggleAudio = useCallback(() => {
    const newState = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = newState; });
    setAudioEnabled(newState);
    socket.emit('media_state', { roomId: currentRoom?.roomId, audioEnabled: newState, videoEnabled, screenSharing: isScreenSharing });
  }, [audioEnabled, videoEnabled, isScreenSharing, setAudioEnabled, socket, currentRoom]);

  const toggleVideo = useCallback(async () => {
    const newState = !videoEnabled;
    const stream = localStreamRef.current;
    if (!stream) return;

    if (!newState) {
      stream.getVideoTracks().forEach(t => { t.enabled = false; });
    } else {
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        tracks.forEach(t => { t.enabled = true; });
      } else {
        try {
          const camStream = await getUserMedia({ video: true, audio: false });
          const camTrack = camStream.getVideoTracks()[0];
          stream.addTrack(camTrack);
          localStreamRef.current = stream;
          setLocalStream(stream);
          const allPeers = useCallStore.getState().peerConnections;
          for (const [, pc] of allPeers) { try { pc.addTrack(camTrack, stream); } catch {} }
        } catch (err) { console.error('Failed to get camera:', err); return; }
      }
    }
    setVideoEnabled(newState);
    setLocalStream(new MediaStream(stream.getTracks()));
    socket.emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled: newState, screenSharing: isScreenSharing });
  }, [audioEnabled, videoEnabled, isScreenSharing, setVideoEnabled, setLocalStream, socket, currentRoom]);

  // FIX: screen share — use renegotiate signal so receiver gets new track properly
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await getDisplayMedia();
      const screenTrack = screenStream.getVideoTracks()[0];
      setScreenStream(screenStream);

      const allPeers = useCallStore.getState().peerConnections;
      for (const [peerUid, pc] of allPeers) {
        await replaceTrackOnPeer(pc, screenTrack);
        // FIX: renegotiate after replacing track so remote side updates
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('renegotiate', { targetUid: peerUid, offer: pc.localDescription, roomId: currentRoom?.roomId });
        } catch {}
      }

      socket.emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled: true, screenSharing: true });
      screenTrack.onended = () => stopScreenShare();
      return true;
    } catch (err) {
      console.error('startScreenShare error:', err);
      return false;
    }
  }, [socket, currentRoom, audioEnabled, setScreenStream]);

  const stopScreenShare = useCallback(async () => {
    const { screenStream } = useCallStore.getState();
    if (screenStream) { stopStream(screenStream); setScreenStream(null); }

    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      cameraTrack.enabled = true;
      const allPeers = useCallStore.getState().peerConnections;
      for (const [peerUid, pc] of allPeers) {
        await replaceTrackOnPeer(pc, cameraTrack);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('renegotiate', { targetUid: peerUid, offer: pc.localDescription, roomId: currentRoom?.roomId });
        } catch {}
      }
    }
    socket.emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled, screenSharing: false });
  }, [socket, currentRoom, audioEnabled, videoEnabled, setScreenStream]);

  const endCall = useCallback(() => {
    socket.emit('leave_room');
    cleanupCall();
  }, [socket, cleanupCall]);

  return { initLocalStream, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall };
};
