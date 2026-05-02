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
    setAudioEnabled, setVideoEnabled, setScreenStream, cleanupCall,
  } = useCallStore();

  const localStreamRef = useRef(null);
  const makingOfferRef = useRef(new Set());
  const iceQueues = useRef(new Map());
  const remoteDescReady = useRef(new Map());
  // FIX: stable MediaStream refs per peer — never recreate, only add tracks
  const remoteStreamRefs = useRef(new Map());

  const getRoomId = () => useCallStore.getState().currentRoom?.roomId;
  const socket$ = () => getSocket();

  const flushIce = async (uid, pc) => {
    const q = iceQueues.current.get(uid) || [];
    iceQueues.current.set(uid, []);
    for (const c of q) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  };

  const createPeer = (remoteUid, remoteDisplayName) => {
    const stream = localStreamRef.current;
    if (!stream) { console.warn('[WebRTC] No local stream yet'); return null; }

    const existing = useCallStore.getState().peerConnections.get(remoteUid);
    if (existing && existing.signalingState !== 'closed') return existing;

    const pc = createPeerConnection();
    addStreamToPeer(pc, stream);

    // FIX: Create ONE stable MediaStream per peer, store in ref
    // Never create new MediaStream — only addTrack to the same one
    const remoteStream = new MediaStream();
    remoteStreamRefs.current.set(remoteUid, remoteStream);
    // Set in store so VideoGrid renders it
    setRemoteStream(remoteUid, remoteStream);

    pc.ontrack = ({ track }) => {
      // FIX: always use the SAME stream object from ref
      const rs = remoteStreamRefs.current.get(remoteUid);
      if (!rs) return;
      if (!rs.getTracks().find(t => t.id === track.id)) {
        rs.addTrack(track);
      }
      // FIX: force store update with new Map so React sees change
      setRemoteStream(remoteUid, rs);

      track.onmute = () => setRemoteStream(remoteUid, rs);
      track.onunmute = () => setRemoteStream(remoteUid, rs);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const roomId = getRoomId();
      if (roomId) socket$().emit('ice_candidate', { targetUid: remoteUid, candidate, roomId });
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE ${remoteUid}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Conn ${remoteUid}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeerConnection(remoteUid);
        removeRemoteStream(remoteUid);
        removePeerInfo(remoteUid);
        remoteStreamRefs.current.delete(remoteUid);
        iceQueues.current.delete(remoteUid);
        remoteDescReady.current.delete(remoteUid);
      }
    };

    iceQueues.current.set(remoteUid, []);
    remoteDescReady.current.set(remoteUid, false);
    addPeerConnection(remoteUid, pc);
    setPeerInfo(remoteUid, { displayName: remoteDisplayName });
    return pc;
  };

  const sendOffer = async (remoteUid, remoteDisplayName) => {
    if (makingOfferRef.current.has(remoteUid)) return;
    const pc = createPeer(remoteUid, remoteDisplayName);
    if (!pc) return;
    makingOfferRef.current.add(remoteUid);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      const roomId = getRoomId();
      if (roomId) socket$().emit('offer', { targetUid: remoteUid, offer: pc.localDescription, roomId });
    } catch (err) {
      console.error('[WebRTC] sendOffer error:', err);
    } finally {
      makingOfferRef.current.delete(remoteUid);
    }
  };

  const initLocalStream = useCallback(async () => {
    try {
      const stream = await getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch {
      try {
        const audio = await getUserMedia({ video: false, audio: true });
        localStreamRef.current = audio;
        setLocalStream(audio);
        setVideoEnabled(false);
        return audio;
      } catch (err) { throw err; }
    }
  }, [setLocalStream, setVideoEnabled]);

  // Mount once — all state via store.getState() / refs
  useEffect(() => {
    const socket = socket$();

    const onUsersInRoom = ({ users }) => {
      console.log('[WebRTC] users_in_room:', users.map(u => u.displayName));
      users.forEach(({ uid, displayName }) => sendOffer(uid, displayName));
    };

    const onUserJoined = ({ uid, displayName }) => {
      console.log('[WebRTC] user_joined:', displayName);
      setPeerInfo(uid, { displayName });
      // They will send us an offer — just register info for now
    };

    const onOffer = async ({ offer, fromUid, fromDisplayName }) => {
      console.log('[WebRTC] got offer from:', fromDisplayName);
      let pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') {
        pc = createPeer(fromUid, fromDisplayName);
        if (!pc) { console.error('[WebRTC] createPeer failed in onOffer'); return; }
      }
      try {
        if (pc.signalingState !== 'stable') {
          console.warn('[WebRTC] signalingState not stable:', pc.signalingState);
          if (makingOfferRef.current.has(fromUid)) {
            // Glare — both made offers simultaneously, abort ours
            await pc.setLocalDescription({ type: 'rollback' });
            makingOfferRef.current.delete(fromUid);
          } else {
            return; // Can't handle offer in this state
          }
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescReady.current.set(fromUid, true);
        await flushIce(fromUid, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const roomId = getRoomId();
        if (roomId) socket.emit('answer', { targetUid: fromUid, answer: pc.localDescription, roomId });
      } catch (err) { console.error('[WebRTC] onOffer error:', err); }
    };

    const onAnswer = async ({ answer, fromUid }) => {
      console.log('[WebRTC] got answer from:', fromUid);
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) { console.warn('[WebRTC] No PC for answer from', fromUid); return; }
      if (pc.signalingState !== 'have-local-offer') {
        console.warn('[WebRTC] Bad state for answer:', pc.signalingState);
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescReady.current.set(fromUid, true);
        await flushIce(fromUid, pc);
      } catch (err) { console.error('[WebRTC] onAnswer error:', err); }
    };

    const onIce = async ({ candidate, fromUid }) => {
      if (!candidate) return;
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') return;
      if (remoteDescReady.current.get(fromUid) && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else {
        const q = iceQueues.current.get(fromUid) || [];
        q.push(candidate);
        iceQueues.current.set(fromUid, q);
      }
    };

    const onUserLeft = ({ uid }) => {
      removePeerConnection(uid);
      removeRemoteStream(uid);
      removePeerInfo(uid);
      remoteStreamRefs.current.delete(uid);
      iceQueues.current.delete(uid);
      remoteDescReady.current.delete(uid);
    };

    const onPeerMedia = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerInfo(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    const onRenegotiate = async ({ offer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescReady.current.set(fromUid, true);
        await flushIce(fromUid, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const roomId = getRoomId();
        if (roomId) socket.emit('renegotiate_answer', { targetUid: fromUid, answer: pc.localDescription, roomId });
      } catch (err) { console.error('[WebRTC] renegotiate error:', err); }
    };

    const onRenegotiateAnswer = async ({ answer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) return;
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
      catch (err) { console.error('[WebRTC] renegotiateAnswer error:', err); }
    };

    const events = [
      ['users_in_room', onUsersInRoom],
      ['user_joined', onUserJoined],
      ['offer', onOffer],
      ['answer', onAnswer],
      ['ice_candidate', onIce],
      ['user_left', onUserLeft],
      ['peer_media_state', onPeerMedia],
      ['renegotiate', onRenegotiate],
      ['renegotiate_answer', onRenegotiateAnswer],
    ];

    events.forEach(([e]) => socket.off(e));
    events.forEach(([e, fn]) => socket.on(e, fn));
    return () => events.forEach(([e, fn]) => socket.off(e, fn));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAudio = useCallback(() => {
    const { audioEnabled, videoEnabled, isScreenSharing, currentRoom } = useCallStore.getState();
    const newVal = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = newVal; });
    setAudioEnabled(newVal);
    socket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled: newVal, videoEnabled, screenSharing: isScreenSharing });
  }, [setAudioEnabled]);

  const toggleVideo = useCallback(async () => {
    const { audioEnabled, videoEnabled, isScreenSharing, currentRoom } = useCallStore.getState();
    const newVal = !videoEnabled;
    const stream = localStreamRef.current;
    if (!stream) return;
    if (!newVal) {
      stream.getVideoTracks().forEach(t => { t.enabled = false; });
    } else {
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        tracks.forEach(t => { t.enabled = true; });
      } else {
        try {
          const cs = await getUserMedia({ video: true, audio: false });
          const ct = cs.getVideoTracks()[0];
          stream.addTrack(ct);
          const peers = useCallStore.getState().peerConnections;
          for (const [, pc] of peers) { try { pc.addTrack(ct, stream); } catch {} }
        } catch (err) { console.error('toggleVideo cam error:', err); return; }
      }
    }
    setVideoEnabled(newVal);
    setLocalStream(new MediaStream(stream.getTracks()));
    socket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled: newVal, screenSharing: isScreenSharing });
  }, [setVideoEnabled, setLocalStream]);

  const startScreenShare = useCallback(async () => {
    const { audioEnabled, currentRoom } = useCallStore.getState();
    try {
      const ss = await getDisplayMedia();
      const track = ss.getVideoTracks()[0];
      setScreenStream(ss);
      const peers = useCallStore.getState().peerConnections;
      for (const [uid, pc] of peers) {
        await replaceTrackOnPeer(pc, track);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket$().emit('renegotiate', { targetUid: uid, offer: pc.localDescription, roomId: currentRoom?.roomId });
        } catch {}
      }
      socket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled: true, screenSharing: true });
      track.onended = () => stopScreenShare();
    } catch (err) { console.error('startScreenShare:', err); }
  }, [setScreenStream]);

  const stopScreenShare = useCallback(async () => {
    const { audioEnabled, videoEnabled, currentRoom, screenStream } = useCallStore.getState();
    if (screenStream) { stopStream(screenStream); setScreenStream(null); }
    const cam = localStreamRef.current?.getVideoTracks()[0];
    if (cam) {
      cam.enabled = true;
      const peers = useCallStore.getState().peerConnections;
      for (const [uid, pc] of peers) {
        await replaceTrackOnPeer(pc, cam);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket$().emit('renegotiate', { targetUid: uid, offer: pc.localDescription, roomId: currentRoom?.roomId });
        } catch {}
      }
    }
    socket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled, screenSharing: false });
  }, [setScreenStream]);

  const endCall = useCallback(() => {
    socket$().emit('leave_room');
    cleanupCall();
  }, [cleanupCall]);

  return { initLocalStream, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall };
};
