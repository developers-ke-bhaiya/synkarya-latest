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

  // ALL mutable state in refs — prevents stale closures AND prevents effect re-runs
  const localStreamRef = useRef(null);
  const makingOfferRef = useRef(new Set());
  const iceQueues = useRef(new Map());     // uid → RTCIceCandidate[]
  const remoteDescReady = useRef(new Map()); // uid → bool

  // ── helpers ───────────────────────────────────────────────────────────────
  const getRoomId = () => useCallStore.getState().currentRoom?.roomId;
  const getSocket$ = () => getSocket();

  const flushIce = async (uid, pc) => {
    const q = iceQueues.current.get(uid) || [];
    iceQueues.current.set(uid, []);
    for (const c of q) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  };

  const createPeer = (remoteUid, remoteDisplayName) => {
    const stream = localStreamRef.current;
    if (!stream) { console.warn('[WebRTC] createPeer called before localStream'); return null; }

    const existing = useCallStore.getState().peerConnections.get(remoteUid);
    if (existing && existing.signalingState !== 'closed') return existing;

    const pc = createPeerConnection();
    addStreamToPeer(pc, stream);

    // One stable MediaStream per peer — never replaced, only tracks added
    const remoteStream = new MediaStream();
    setRemoteStream(remoteUid, remoteStream);

    pc.ontrack = ({ track }) => {
      const current = useCallStore.getState().remoteStreams.get(remoteUid) || remoteStream;
      if (!current.getTracks().find(t => t.id === track.id)) current.addTrack(track);
      // Same object reference — Zustand sees Map mutation, trigger re-render
      setRemoteStream(remoteUid, current);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const roomId = getRoomId();
      if (roomId) getSocket$().emit('ice_candidate', { targetUid: remoteUid, candidate, roomId });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeerConnection(remoteUid);
        removeRemoteStream(remoteUid);
        removePeerInfo(remoteUid);
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
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const roomId = getRoomId();
      if (roomId) getSocket$().emit('offer', { targetUid: remoteUid, offer: pc.localDescription, roomId });
    } catch (err) {
      console.error('[WebRTC] sendOffer error:', err);
    } finally {
      makingOfferRef.current.delete(remoteUid);
    }
  };

  // ── initLocalStream ───────────────────────────────────────────────────────
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

  // ── Socket listeners — registered ONCE on mount, never re-registered ──────
  useEffect(() => {
    const socket = getSocket$();

    const onUsersInRoom = ({ users }) => {
      users.forEach(({ uid, displayName }) => sendOffer(uid, displayName));
    };

    const onUserJoined = ({ uid, displayName }) => {
      // New user joined after us — they will send us an offer; just register info
      setPeerInfo(uid, { displayName });
    };

    const onOffer = async ({ offer, fromUid, fromDisplayName }) => {
      let pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') {
        pc = createPeer(fromUid, fromDisplayName);
        if (!pc) return;
      }
      try {
        // Handle offer collision (glare)
        if (makingOfferRef.current.has(fromUid) || pc.signalingState !== 'stable') {
          if (pc.signalingState !== 'stable') {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription(new RTCSessionDescription(offer)),
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
          }
          makingOfferRef.current.delete(fromUid);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }
        remoteDescReady.current.set(fromUid, true);
        await flushIce(fromUid, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const roomId = getRoomId();
        if (roomId) socket.emit('answer', { targetUid: fromUid, answer: pc.localDescription, roomId });
      } catch (err) { console.error('[WebRTC] onOffer error:', err); }
    };

    const onAnswer = async ({ answer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState !== 'have-local-offer') return;
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
      if (remoteDescReady.current.get(fromUid)) {
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
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); } catch (err) { console.error(err); }
    };

    // Remove any stale listeners first (important after HMR / strict mode double-mount)
    const events = [
      ['users_in_room', onUsersInRoom], ['user_joined', onUserJoined],
      ['offer', onOffer], ['answer', onAnswer], ['ice_candidate', onIce],
      ['user_left', onUserLeft], ['peer_media_state', onPeerMedia],
      ['renegotiate', onRenegotiate], ['renegotiate_answer', onRenegotiateAnswer],
    ];
    events.forEach(([e]) => socket.off(e));
    events.forEach(([e, fn]) => socket.on(e, fn));

    return () => events.forEach(([e, fn]) => socket.off(e, fn));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // MOUNT ONCE — all state via store.getState() and refs

  // ── Controls ──────────────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    const { audioEnabled, videoEnabled, isScreenSharing, currentRoom } = useCallStore.getState();
    const newVal = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = newVal; });
    setAudioEnabled(newVal);
    getSocket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled: newVal, videoEnabled, screenSharing: isScreenSharing });
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
    getSocket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled: newVal, screenSharing: isScreenSharing });
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
          getSocket$().emit('renegotiate', { targetUid: uid, offer: pc.localDescription, roomId: currentRoom?.roomId });
        } catch {}
      }
      getSocket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled: true, screenSharing: true });
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
          getSocket$().emit('renegotiate', { targetUid: uid, offer: pc.localDescription, roomId: currentRoom?.roomId });
        } catch {}
      }
    }
    getSocket$().emit('media_state', { roomId: currentRoom?.roomId, audioEnabled, videoEnabled, screenSharing: false });
  }, [setScreenStream]);

  const endCall = useCallback(() => {
    getSocket$().emit('leave_room');
    cleanupCall();
  }, [cleanupCall]);

  return { initLocalStream, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall };
};
