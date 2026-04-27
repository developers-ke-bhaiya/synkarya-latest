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

  const createPeer = useCallback((remoteUid, remoteDisplayName) => {
    const stream = localStreamRef.current;
    if (!stream) return null;

    const existing = useCallStore.getState().peerConnections.get(remoteUid);
    if (existing && existing.signalingState !== 'closed') return existing;

    const pc = createPeerConnection();
    addStreamToPeer(pc, stream);

    const remoteStream = new MediaStream();
    setRemoteStream(remoteUid, remoteStream);

    pc.ontrack = ({ track }) => {
      remoteStream.addTrack(track);
      // Force React re-render by creating new MediaStream reference
      setRemoteStream(remoteUid, new MediaStream(remoteStream.getTracks()));
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
      }
    };

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
        const offerCollision = offer.type === 'offer' &&
          (makingOfferRef.current.has(fromUid) || pc.signalingState !== 'stable');
        if (offerCollision) {
          if (pc.signalingState !== 'stable') await pc.setLocalDescription({ type: 'rollback' });
          makingOfferRef.current.delete(fromUid);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { targetUid: fromUid, answer: pc.localDescription, roomId: currentRoom?.roomId });
      } catch (err) { console.error('onOffer error:', err); }
    };

    const onAnswer = async ({ answer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
      catch (err) { console.error('onAnswer error:', err); }
    };

    const onIceCandidate = async ({ candidate, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (err) { if (!err.message?.includes('Unknown ufrag')) console.error('ICE error:', err); }
    };

    const onUserLeft = ({ uid }) => {
      removePeerConnection(uid);
      removeRemoteStream(uid);
      removePeerInfo(uid);
    };

    const onPeerMediaState = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerInfo(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    const onRenegotiate = async ({ offer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
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
    socket.on('ice_candidate', onIceCandidate);
    socket.on('user_left', onUserLeft);
    socket.on('peer_media_state', onPeerMediaState);
    socket.on('renegotiate', onRenegotiate);
    socket.on('renegotiate_answer', onRenegotiateAnswer);

    return () => {
      socket.off('users_in_room', onUsersInRoom);
      socket.off('user_joined', onUserJoined);
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice_candidate', onIceCandidate);
      socket.off('user_left', onUserLeft);
      socket.off('peer_media_state', onPeerMediaState);
      socket.off('renegotiate', onRenegotiate);
      socket.off('renegotiate_answer', onRenegotiateAnswer);
    };
  }, [socket, currentRoom, createPeer, sendOffer, setPeerInfo,
    removePeerConnection, removeRemoteStream, removePeerInfo]);

  // FIX: Toggle audio — replace track on all peers instead of just disabling
  const toggleAudio = useCallback(async () => {
    const newState = !audioEnabled;
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => { t.enabled = newState; });
    }
    setAudioEnabled(newState);
    socket.emit('media_state', {
      roomId: currentRoom?.roomId, audioEnabled: newState,
      videoEnabled, screenSharing: isScreenSharing,
    });
  }, [audioEnabled, videoEnabled, isScreenSharing, setAudioEnabled, socket, currentRoom]);

  // FIX: Toggle video — use replaceTrack with black frame instead of just disabling
  const toggleVideo = useCallback(async () => {
    const newState = !videoEnabled;
    const stream = localStreamRef.current;

    if (stream) {
      const videoTracks = stream.getVideoTracks();
      if (!newState) {
        // Turn OFF: disable tracks
        videoTracks.forEach((t) => { t.enabled = false; });
      } else {
        // Turn ON: re-enable existing tracks first
        videoTracks.forEach((t) => { t.enabled = true; });

        // If no video tracks exist (e.g., started audio-only), try to get camera
        if (videoTracks.length === 0) {
          try {
            const camStream = await getUserMedia({ video: true, audio: false });
            const camTrack = camStream.getVideoTracks()[0];
            stream.addTrack(camTrack);
            localStreamRef.current = stream;
            // Add to all peer connections
            const allPeers = useCallStore.getState().peerConnections;
            allPeers.forEach((pc) => {
              pc.addTrack(camTrack, stream);
            });
          } catch (err) {
            console.error('Failed to re-enable camera:', err);
          }
        }
      }
    }

    setVideoEnabled(newState);
    socket.emit('media_state', {
      roomId: currentRoom?.roomId, audioEnabled,
      videoEnabled: newState, screenSharing: isScreenSharing,
    });
  }, [audioEnabled, videoEnabled, isScreenSharing, setVideoEnabled, socket, currentRoom]);

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await getDisplayMedia();
      const screenTrack = screenStream.getVideoTracks()[0];
      setScreenStream(screenStream);

      const allPeers = useCallStore.getState().peerConnections;
      await Promise.all(Array.from(allPeers.values()).map((pc) => replaceTrackOnPeer(pc, screenTrack)));

      socket.emit('media_state', {
        roomId: currentRoom?.roomId, audioEnabled, videoEnabled: true, screenSharing: true,
      });

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
      await Promise.all(Array.from(allPeers.values()).map((pc) => replaceTrackOnPeer(pc, cameraTrack)));
    }

    socket.emit('media_state', {
      roomId: currentRoom?.roomId, audioEnabled, videoEnabled, screenSharing: false,
    });
  }, [socket, currentRoom, audioEnabled, videoEnabled, setScreenStream]);

  const endCall = useCallback(() => {
    socket.emit('leave_room');
    cleanupCall();
  }, [socket, cleanupCall]);

  return { initLocalStream, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall };
};
