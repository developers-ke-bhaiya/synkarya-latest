import { useCallback, useEffect, useRef } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import { getSocket } from '../services/socket';
import {
  createPeerConnection, getUserMedia, getDisplayMedia,
  stopStream, replaceTrackOnPeer,
} from '../services/webrtc';

export const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, start, dur, gain = 0.25) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
    };
    play(659.25, 0, 0.35); play(830.61, 0.18, 0.35); play(987.77, 0.36, 0.5);
  } catch {}
};

export const useDirectCall = () => {
  const {
    setIncomingCall, clearIncomingCall,
    setActiveDirectCall, clearActiveDirectCall,
    setDirectCallStatus, setDirectAudioEnabled,
    setDirectVideoEnabled, setDirectScreenSharing,
    setPeerMediaState, addDirectMessage,
    directAudioEnabled, directVideoEnabled, directScreenSharing,
  } = useOnlineStore();

  const socket = getSocket();

  // ── All mutable call state lives in refs — no stale closures ──────────────
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  // ── ICE candidate queue — buffer candidates until remoteDescription is set ─
  // This is the #1 real-world cause of one-way audio/video in WebRTC
  const iceCandidateQueueRef = useRef([]);
  const remoteDescSetRef = useRef(false);

  const flushIceCandidates = async (pc) => {
    while (iceCandidateQueueRef.current.length > 0) {
      const c = iceCandidateQueueRef.current.shift();
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  };

  // ── Create peer connection ─────────────────────────────────────────────────
  const setupPC = useCallback((peerUid) => {
    // Cleanup any old connection first
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    remoteDescSetRef.current = false;
    iceCandidateQueueRef.current = [];

    const pc = createPeerConnection();
    pcRef.current = pc;

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    pc.ontrack = ({ track, streams }) => {
      const rs = remoteStreamRef.current;
      if (!rs) return;
      // Add track only if not already present
      if (!rs.getTracks().find(t => t.id === track.id)) {
        rs.addTrack(track);
      }
      // Force Zustand re-render with SAME stream object
      useOnlineStore.setState(s => ({
        activeDirectCall: s.activeDirectCall
          ? { ...s.activeDirectCall, remoteStream: rs }
          : s.activeDirectCall,
      }));
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('direct_ice_candidate', { targetUid: peerUid, candidate });
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[DirectCall] ICE:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    pc.onsignalingstatechange = () => {
      console.log('[DirectCall] Signaling:', pc.signalingState);
    };

    return { pc, remoteStream };
  }, [socket]);

  const getMedia = useCallback(async () => {
    try { return await getUserMedia({ video: true, audio: true }); }
    catch (e) {
      console.warn('camera+mic failed, trying audio only:', e.name);
      return await getUserMedia({ video: false, audio: true });
    }
  }, []);

  // ── Public actions ─────────────────────────────────────────────────────────
  const requestCall = useCallback((targetUid, targetName, targetAvatar) => {
    socket.emit('direct_call_request', { targetUid });
    setDirectCallStatus('calling');
    setActiveDirectCall({
      peerUid: targetUid, peerName: targetName,
      peerAvatar: targetAvatar, localStream: null, remoteStream: null, pc: null,
    });
  }, [socket, setDirectCallStatus, setActiveDirectCall]);

  const acceptCall = useCallback(async (fromUid, fromDisplayName, fromAvatar) => {
    clearIncomingCall();
    setDirectCallStatus('connected');
    try {
      const stream = await getMedia();
      localStreamRef.current = stream;
      const { pc, remoteStream } = setupPC(fromUid);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      setActiveDirectCall({
        peerUid: fromUid, peerName: fromDisplayName, peerAvatar: fromAvatar,
        localStream: stream, remoteStream, pc,
      });
      // Acceptor waits for offer — just confirm acceptance
      socket.emit('direct_call_accept', { targetUid: fromUid });
    } catch (err) {
      console.error('acceptCall error:', err);
      socket.emit('direct_call_reject', { targetUid: fromUid });
      clearIncomingCall();
      setDirectCallStatus(null);
    }
  }, [clearIncomingCall, setDirectCallStatus, setActiveDirectCall, setupPC, socket, getMedia]);

  const rejectCall = useCallback((fromUid) => {
    socket.emit('direct_call_reject', { targetUid: fromUid });
    clearIncomingCall();
    setDirectCallStatus(null);
  }, [socket, clearIncomingCall, setDirectCallStatus]);

  const endDirectCall = useCallback(() => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) socket.emit('direct_call_end', { targetUid: activeDirectCall.peerUid });
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    if (localStreamRef.current) { stopStream(localStreamRef.current); localStreamRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    remoteStreamRef.current = null;
    clearActiveDirectCall();
  }, [socket, clearActiveDirectCall]);

  const toggleDirectAudio = useCallback(() => {
    const newState = !directAudioEnabled;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = newState; });
    setDirectAudioEnabled(newState);
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: newState, videoEnabled: directVideoEnabled, screenSharing: directScreenSharing,
      });
    }
  }, [directAudioEnabled, directVideoEnabled, directScreenSharing, setDirectAudioEnabled, socket]);

  const toggleDirectVideo = useCallback(() => {
    const newState = !directVideoEnabled;
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newState; });
    setDirectVideoEnabled(newState);
    useOnlineStore.setState(s => ({
      activeDirectCall: s.activeDirectCall
        ? { ...s.activeDirectCall, _videoToggle: newState }
        : s.activeDirectCall,
    }));
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: directAudioEnabled, videoEnabled: newState, screenSharing: directScreenSharing,
      });
    }
  }, [directAudioEnabled, directVideoEnabled, directScreenSharing, setDirectVideoEnabled, socket]);

  const startDirectScreenShare = useCallback(async () => {
    try {
      const screenStream = await getDisplayMedia();
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      if (pcRef.current) await replaceTrackOnPeer(pcRef.current, screenTrack);
      setDirectScreenSharing(true);
      const { activeDirectCall } = useOnlineStore.getState();
      if (activeDirectCall?.peerUid) {
        socket.emit('direct_media_state', {
          targetUid: activeDirectCall.peerUid,
          audioEnabled: directAudioEnabled, videoEnabled: true, screenSharing: true,
        });
      }
      screenTrack.onended = () => stopDirectScreenShare();
    } catch (err) { console.error('startDirectScreenShare:', err); }
  }, [directAudioEnabled, setDirectScreenSharing, socket]);

  const stopDirectScreenShare = useCallback(async () => {
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (camTrack && pcRef.current) { camTrack.enabled = true; await replaceTrackOnPeer(pcRef.current, camTrack); }
    setDirectScreenSharing(false);
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: directAudioEnabled, videoEnabled: directVideoEnabled, screenSharing: false,
      });
    }
  }, [directAudioEnabled, directVideoEnabled, setDirectScreenSharing, socket]);

  const sendDirectMessage = useCallback((message) => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (!activeDirectCall?.peerUid || !message?.trim()) return;
    const { user } = require('../store/authStore').useAuthStore.getState();
    const msgData = {
      id: Date.now().toString(), uid: user?.uid, displayName: user?.displayName,
      message: message.trim(), timestamp: new Date().toISOString(),
    };
    addDirectMessage(msgData);
    socket.emit('direct_chat_message', { targetUid: activeDirectCall.peerUid, message: message.trim() });
  }, [socket, addDirectMessage]);

  // ── Socket event listeners ─────────────────────────────────────────────────
  // CRITICAL: use a single stable useEffect with no deps that change often.
  // All mutable state is read from refs — this prevents stale closure / duplicate listener bugs.
  useEffect(() => {
    const onIncoming = ({ fromUid, fromDisplayName, fromAvatar }) => {
      playNotificationSound();
      setIncomingCall({ fromUid, fromDisplayName, fromAvatar });
    };

    // Caller: remote accepted → caller gets media and sends offer
    const onAccepted = async ({ fromUid, fromDisplayName }) => {
      useOnlineStore.getState().setDirectCallStatus('connected');
      try {
        const stream = await getUserMedia({ video: true, audio: true }).catch(() =>
          getUserMedia({ video: false, audio: true })
        );
        localStreamRef.current = stream;

        const { pc, remoteStream } = setupPC(fromUid);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        // Update store with streams
        useOnlineStore.setState(s => ({
          activeDirectCall: s.activeDirectCall
            ? { ...s.activeDirectCall, localStream: stream, remoteStream, pc }
            : { peerUid: fromUid, peerName: fromDisplayName, peerAvatar: null, localStream: stream, remoteStream, pc },
        }));

        // Caller creates and sends offer
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        socket.emit('direct_offer', { targetUid: fromUid, offer: pc.localDescription });
      } catch (err) {
        console.error('[DirectCall] onAccepted error:', err);
        const { activeDirectCall } = useOnlineStore.getState();
        if (activeDirectCall?.peerUid) socket.emit('direct_call_end', { targetUid: activeDirectCall.peerUid });
        clearActiveDirectCall();
      }
    };

    const onRejected = () => {
      clearActiveDirectCall();
      useOnlineStore.getState().setDirectCallStatus(null);
    };

    // Acceptor: receives offer → sets remote desc → creates answer
    const onDirectOffer = async ({ offer, fromUid }) => {
      const pc = pcRef.current;
      if (!pc) { console.warn('[DirectCall] Got offer but no PC exists'); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescSetRef.current = true;
        await flushIceCandidates(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('direct_answer', { targetUid: fromUid, answer: pc.localDescription });
      } catch (err) { console.error('[DirectCall] onDirectOffer error:', err); }
    };

    // Caller: receives answer
    const onDirectAnswer = async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc) return;
      // FIX: don't check signalingState strictly — just guard against stable already having remote
      if (pc.remoteDescription) {
        console.warn('[DirectCall] Already have remoteDescription, ignoring duplicate answer');
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescSetRef.current = true;
        await flushIceCandidates(pc);
      } catch (err) { console.error('[DirectCall] onDirectAnswer error:', err); }
    };

    // FIX: queue ICE candidates until remoteDescription is set
    const onDirectIce = async ({ candidate }) => {
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc) return;
      if (remoteDescSetRef.current && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (err) { if (!err.message?.includes('Unknown ufrag')) console.error('ICE add error:', err); }
      } else {
        // Buffer until remoteDescription is ready
        iceCandidateQueueRef.current.push(candidate);
      }
    };

    const onCallEnded = () => {
      if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
      if (localStreamRef.current) { stopStream(localStreamRef.current); localStreamRef.current = null; }
      if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
      remoteStreamRef.current = null;
      clearActiveDirectCall();
    };

    const onPeerMedia = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerMediaState(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    const onDirectChat = (msg) => {
      const { user } = require('../store/authStore').useAuthStore.getState();
      if (msg.uid === user?.uid) return;
      addDirectMessage(msg);
    };

    // Remove all first to prevent duplicates
    const events = [
      'direct_call_incoming', 'direct_call_accepted', 'direct_call_rejected',
      'direct_offer', 'direct_answer', 'direct_ice_candidate',
      'direct_call_ended', 'direct_peer_media_state', 'direct_chat_message',
    ];
    events.forEach(e => socket.off(e));

    socket.on('direct_call_incoming', onIncoming);
    socket.on('direct_call_accepted', onAccepted);
    socket.on('direct_call_rejected', onRejected);
    socket.on('direct_offer', onDirectOffer);
    socket.on('direct_answer', onDirectAnswer);
    socket.on('direct_ice_candidate', onDirectIce);
    socket.on('direct_call_ended', onCallEnded);
    socket.on('direct_peer_media_state', onPeerMedia);
    socket.on('direct_chat_message', onDirectChat);

    return () => {
      socket.off('direct_call_incoming', onIncoming);
      socket.off('direct_call_accepted', onAccepted);
      socket.off('direct_call_rejected', onRejected);
      socket.off('direct_offer', onDirectOffer);
      socket.off('direct_answer', onDirectAnswer);
      socket.off('direct_ice_candidate', onDirectIce);
      socket.off('direct_call_ended', onCallEnded);
      socket.off('direct_peer_media_state', onPeerMedia);
      socket.off('direct_chat_message', onDirectChat);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]); // ONLY socket — all other state via refs/store

  return {
    requestCall, acceptCall, rejectCall, endDirectCall,
    toggleDirectAudio, toggleDirectVideo,
    startDirectScreenShare, stopDirectScreenShare,
    sendDirectMessage,
  };
};
