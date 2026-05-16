import { useCallback, useEffect } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import { useAuthStore } from '../store/authStore';
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

// ── MODULE-LEVEL SINGLETONS — shared across ALL hook instances ───────────────
const S = {
  pc: null,
  localStream: null,
  screenStream: null,
  remoteStream: null,
  iceQueue: [],
  remoteDescReady: false,
};

const socket$ = () => getSocket();

const getMedia = async () => {
  try { return await getUserMedia({ video: true, audio: true }); }
  catch { 
    try { return await getUserMedia({ video: false, audio: true }); }
    catch (e) { console.error('[DC] getMedia failed:', e); return null; }
  }
};

const flushIce = async (pc) => {
  const q = S.iceQueue.splice(0);
  for (const c of q) {
    try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
  }
};

const cleanupAll = () => {
  if (S.pc) { try { S.pc.close(); } catch {} S.pc = null; }
  if (S.localStream) { stopStream(S.localStream); S.localStream = null; }
  if (S.screenStream) { stopStream(S.screenStream); S.screenStream = null; }
  S.remoteStream = null;
  S.iceQueue = [];
  S.remoteDescReady = false;
};

// Creates PC, wires ontrack/ICE — called with peerUid for ICE routing
const buildPC = (peerUid, localStream) => {
  if (S.pc) { try { S.pc.close(); } catch {} }
  S.remoteDescReady = false;
  S.iceQueue = [];

  const pc = createPeerConnection();
  S.pc = pc;

  const rs = new MediaStream();
  S.remoteStream = rs;

  // Add local tracks immediately
  if (localStream) {
    localStream.getTracks().forEach(t => {
      try { pc.addTrack(t, localStream); } catch {}
    });
  }

  pc.ontrack = ({ track }) => {
    console.log('[DC] ontrack:', track.kind, track.readyState);
    track.enabled = true;
    if (!rs.getTracks().find(t => t.id === track.id)) rs.addTrack(track);
    // Force re-render — spread to new object so React sees change
    useOnlineStore.setState(s => ({
      activeDirectCall: s.activeDirectCall
        ? { ...s.activeDirectCall, remoteStream: rs, _t: Date.now() }
        : s.activeDirectCall,
    }));
    track.onunmute = () => {
      useOnlineStore.setState(s => ({
        activeDirectCall: s.activeDirectCall
          ? { ...s.activeDirectCall, _t: Date.now() }
          : s.activeDirectCall,
      }));
    };
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket$().emit('direct_ice_candidate', { targetUid: peerUid, candidate });
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[DC] ICE:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') pc.restartIce();
  };

  pc.onconnectionstatechange = () => {
    console.log('[DC] Conn:', pc.connectionState);
  };

  return { pc, remoteStream: rs };
};

export const useDirectCall = () => {
  const {
    setIncomingCall, clearIncomingCall,
    setActiveDirectCall, clearActiveDirectCall,
    setDirectCallStatus, setDirectAudioEnabled, setDirectVideoEnabled,
    setDirectScreenSharing, setPeerMediaState, addDirectMessage,
  } = useOnlineStore();

  const requestCall = useCallback((targetUid, targetName, targetAvatar) => {
    socket$().emit('direct_call_request', { targetUid });
    useOnlineStore.getState().setDirectCallStatus('calling');
    useOnlineStore.getState().setActiveDirectCall({
      peerUid: targetUid, peerName: targetName, peerAvatar: targetAvatar,
      localStream: null, remoteStream: null, pc: null,
    });
  }, []);

  // ACCEPTOR: get media → build PC with tracks → emit accept → wait for offer
  const acceptCall = useCallback(async (fromUid, fromDisplayName, fromAvatar) => {
    clearIncomingCall();
    setDirectCallStatus('connected');

    // Get media FIRST so tracks are ready
    const stream = await getMedia();
    S.localStream = stream;

    const { pc, remoteStream } = buildPC(fromUid, stream);

    setActiveDirectCall({
      peerUid: fromUid, peerName: fromDisplayName, peerAvatar: fromAvatar,
      localStream: stream, remoteStream, pc,
    });

    // NOW tell caller — they will send offer, PC + tracks are ready
    socket$().emit('direct_call_accept', { targetUid: fromUid });
  }, [clearIncomingCall, setDirectCallStatus, setActiveDirectCall]);

  const rejectCall = useCallback((fromUid) => {
    socket$().emit('direct_call_reject', { targetUid: fromUid });
    clearIncomingCall();
    setDirectCallStatus(null);
  }, [clearIncomingCall, setDirectCallStatus]);

  const endDirectCall = useCallback(() => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) socket$().emit('direct_call_end', { targetUid: activeDirectCall.peerUid });
    cleanupAll();
    clearActiveDirectCall();
  }, [clearActiveDirectCall]);

  const toggleDirectAudio = useCallback(() => {
    const { directAudioEnabled, directVideoEnabled, directScreenSharing, activeDirectCall } = useOnlineStore.getState();
    const newVal = !directAudioEnabled;
    S.localStream?.getAudioTracks().forEach(t => { t.enabled = newVal; });
    setDirectAudioEnabled(newVal);
    if (activeDirectCall?.peerUid) {
      socket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: newVal, videoEnabled: directVideoEnabled, screenSharing: directScreenSharing });
    }
  }, [setDirectAudioEnabled]);

  const toggleDirectVideo = useCallback(() => {
    const { directAudioEnabled, directVideoEnabled, directScreenSharing, activeDirectCall } = useOnlineStore.getState();
    const newVal = !directVideoEnabled;
    S.localStream?.getVideoTracks().forEach(t => { t.enabled = newVal; });
    setDirectVideoEnabled(newVal);
    useOnlineStore.setState(s => ({
      activeDirectCall: s.activeDirectCall ? { ...s.activeDirectCall, _vt: Date.now() } : s.activeDirectCall,
    }));
    if (activeDirectCall?.peerUid) {
      socket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: directAudioEnabled, videoEnabled: newVal, screenSharing: directScreenSharing });
    }
  }, [setDirectVideoEnabled]);

  const startDirectScreenShare = useCallback(async () => {
    const { directAudioEnabled, activeDirectCall } = useOnlineStore.getState();
    try {
      const ss = await getDisplayMedia();
      S.screenStream = ss;
      const track = ss.getVideoTracks()[0];
      if (S.pc) await replaceTrackOnPeer(S.pc, track);
      setDirectScreenSharing(true);
      if (activeDirectCall?.peerUid) {
        socket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: directAudioEnabled, videoEnabled: true, screenSharing: true });
      }
      track.onended = () => stopDirectScreenShare();
    } catch (err) { console.error('[DC] screenShare:', err); }
  }, [setDirectScreenSharing]);

  const stopDirectScreenShare = useCallback(async () => {
    const { directAudioEnabled, directVideoEnabled, activeDirectCall } = useOnlineStore.getState();
    if (S.screenStream) { stopStream(S.screenStream); S.screenStream = null; }
    const cam = S.localStream?.getVideoTracks()[0];
    if (cam && S.pc) { cam.enabled = true; await replaceTrackOnPeer(S.pc, cam); }
    setDirectScreenSharing(false);
    if (activeDirectCall?.peerUid) {
      socket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: directAudioEnabled, videoEnabled: directVideoEnabled, screenSharing: false });
    }
  }, [setDirectScreenSharing]);

  const sendDirectMessage = useCallback((message) => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (!activeDirectCall?.peerUid || !message?.trim()) return;
    const { user } = useAuthStore.getState();
    const msg = {
      id: Date.now().toString() + Math.random(),
      uid: user?.uid, displayName: user?.displayName,
      message: message.trim(), timestamp: new Date().toISOString(),
    };
    addDirectMessage(msg);
    socket$().emit('direct_chat_message', { targetUid: activeDirectCall.peerUid, message: message.trim() });
  }, [addDirectMessage]);

  // ── Socket listeners — ONE instance, mount once ──────────────────────────
  useEffect(() => {
    const socket = socket$();

    const onIncoming = ({ fromUid, fromDisplayName, fromAvatar }) => {
      playNotificationSound();
      setIncomingCall({ fromUid, fromDisplayName, fromAvatar });
    };

    // CALLER: acceptor accepted → get media → build PC with tracks → send offer
    const onAccepted = async ({ fromUid, fromDisplayName }) => {
      useOnlineStore.getState().setDirectCallStatus('connected');

      // Get media FIRST — tracks must be in offer SDP
      const stream = await getMedia();
      S.localStream = stream;

      const { pc, remoteStream } = buildPC(fromUid, stream);

      useOnlineStore.setState(s => ({
        activeDirectCall: s.activeDirectCall
          ? { ...s.activeDirectCall, localStream: stream, remoteStream, pc }
          : { peerUid: fromUid, peerName: fromDisplayName, peerAvatar: null, localStream: stream, remoteStream, pc },
      }));

      // Create offer WITH tracks
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        socket.emit('direct_offer', { targetUid: fromUid, offer: pc.localDescription });
        console.log('[DC] offer sent to', fromDisplayName, '| senders:', pc.getSenders().map(s => s.track?.kind).filter(Boolean));
      } catch (err) {
        console.error('[DC] onAccepted error:', err);
        clearActiveDirectCall();
      }
    };

    const onRejected = () => {
      clearActiveDirectCall();
      useOnlineStore.getState().setDirectCallStatus(null);
    };

    // ACCEPTOR: receives offer → set remote desc → create answer
    const onDirectOffer = async ({ offer, fromUid }) => {
      console.log('[DC] offer received from', fromUid, '| PC:', !!S.pc);
      const pc = S.pc;
      if (!pc) { console.error('[DC] No PC for offer!'); return; }
      if (pc.signalingState !== 'stable') { console.warn('[DC] Bad state:', pc.signalingState); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        S.remoteDescReady = true;
        await flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('direct_answer', { targetUid: fromUid, answer: pc.localDescription });
        console.log('[DC] answer sent | senders:', pc.getSenders().map(s => s.track?.kind).filter(Boolean));
      } catch (err) { console.error('[DC] onOffer error:', err); }
    };

    // CALLER: receives answer
    const onDirectAnswer = async ({ answer }) => {
      const pc = S.pc;
      if (!pc || pc.remoteDescription) { console.warn('[DC] Skipping answer, already have remoteDesc'); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        S.remoteDescReady = true;
        await flushIce(pc);
        console.log('[DC] answer set, ICE negotiating...');
      } catch (err) { console.error('[DC] onAnswer error:', err); }
    };

    const onDirectIce = async ({ candidate }) => {
      if (!candidate || !S.pc) return;
      if (S.remoteDescReady && S.pc.remoteDescription) {
        try { await S.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else {
        S.iceQueue.push(candidate);
      }
    };

    const onCallEnded = () => { cleanupAll(); clearActiveDirectCall(); };

    const onPeerMedia = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerMediaState(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    const onDirectChat = (msg) => {
      const { user } = useAuthStore.getState();
      if (msg.uid === user?.uid) return;
      addDirectMessage(msg);
    };

    const evts = [
      ['direct_call_incoming', onIncoming],
      ['direct_call_accepted', onAccepted],
      ['direct_call_rejected', onRejected],
      ['direct_offer', onDirectOffer],
      ['direct_answer', onDirectAnswer],
      ['direct_ice_candidate', onDirectIce],
      ['direct_call_ended', onCallEnded],
      ['direct_peer_media_state', onPeerMedia],
      ['direct_chat_message', onDirectChat],
    ];

    evts.forEach(([e]) => socket.off(e));
    evts.forEach(([e, fn]) => socket.on(e, fn));
    return () => evts.forEach(([e, fn]) => socket.off(e, fn));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    requestCall, acceptCall, rejectCall, endDirectCall,
    toggleDirectAudio, toggleDirectVideo,
    startDirectScreenShare, stopDirectScreenShare,
    sendDirectMessage,
  };
};
