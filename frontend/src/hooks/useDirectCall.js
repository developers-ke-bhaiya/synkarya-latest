import { useEffect, useRef, useCallback } from 'react';
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
    setDirectCallStatus, setDirectAudioEnabled, setDirectVideoEnabled,
    setDirectScreenSharing, setPeerMediaState, addDirectMessage,
  } = useOnlineStore();

  // All mutable state in refs — zero stale closure risk
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceQueueRef = useRef([]);
  const remoteDescReadyRef = useRef(false);
  const peerUidRef = useRef(null);

  // ── helpers (plain functions, not useCallback, so always fresh in useEffect) ──

  const flushIce = async (pc) => {
    const q = iceQueueRef.current.splice(0);
    for (const c of q) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  };

  const resetRefs = () => {
    remoteDescReadyRef.current = false;
    iceQueueRef.current = [];
    peerUidRef.current = null;
  };

  const cleanupPC = () => {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (localStreamRef.current) { stopStream(localStreamRef.current); localStreamRef.current = null; }
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    remoteStreamRef.current = null;
    resetRefs();
  };

  // Creates PC + wires ontrack/ICE — called from INSIDE useEffect so always has fresh socket ref
  const makePC = (peerUid, socketRef) => {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} }
    resetRefs();

    const pc = createPeerConnection();
    pcRef.current = pc;
    peerUidRef.current = peerUid;

    const rs = new MediaStream();
    remoteStreamRef.current = rs;

    pc.ontrack = ({ track }) => {
      const stream = remoteStreamRef.current;
      if (!stream) return;
      if (!stream.getTracks().find(t => t.id === track.id)) stream.addTrack(track);
      // Spread to trigger Zustand re-render with same MediaStream object
      useOnlineStore.setState(s => ({
        activeDirectCall: s.activeDirectCall ? { ...s.activeDirectCall, remoteStream: stream } : s.activeDirectCall,
      }));
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current.emit('direct_ice_candidate', { targetUid: peerUid, candidate });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    return { pc, remoteStream: rs };
  };

  const getMedia = async () => {
    try { return await getUserMedia({ video: true, audio: true }); }
    catch { return await getUserMedia({ video: false, audio: true }); }
  };

  // ── Public API (useCallback ok here since they read refs, not closed-over state) ──

  const requestCall = useCallback((targetUid, targetName, targetAvatar) => {
    const socket = getSocket();
    socket.emit('direct_call_request', { targetUid });
    useOnlineStore.getState().setDirectCallStatus('calling');
    useOnlineStore.getState().setActiveDirectCall({
      peerUid: targetUid, peerName: targetName, peerAvatar: targetAvatar,
      localStream: null, remoteStream: null, pc: null,
    });
  }, []);

  const acceptCall = useCallback(async (fromUid, fromDisplayName, fromAvatar) => {
    clearIncomingCall();
    setDirectCallStatus('connected');
    const socket = getSocket();
    try {
      const stream = await getMedia();
      localStreamRef.current = stream;
      const { pc, remoteStream } = makePC(fromUid, { current: socket });
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      setActiveDirectCall({
        peerUid: fromUid, peerName: fromDisplayName, peerAvatar: fromAvatar,
        localStream: stream, remoteStream, pc,
      });
      socket.emit('direct_call_accept', { targetUid: fromUid });
    } catch (err) {
      console.error('acceptCall error:', err);
      socket.emit('direct_call_reject', { targetUid: fromUid });
      clearIncomingCall();
      setDirectCallStatus(null);
    }
  }, [clearIncomingCall, setDirectCallStatus, setActiveDirectCall]);

  const rejectCall = useCallback((fromUid) => {
    getSocket().emit('direct_call_reject', { targetUid: fromUid });
    clearIncomingCall();
    setDirectCallStatus(null);
  }, [clearIncomingCall, setDirectCallStatus]);

  const endDirectCall = useCallback(() => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) getSocket().emit('direct_call_end', { targetUid: activeDirectCall.peerUid });
    cleanupPC();
    clearActiveDirectCall();
  }, [clearActiveDirectCall]);

  const toggleDirectAudio = useCallback(() => {
    const { directAudioEnabled, directVideoEnabled, directScreenSharing, activeDirectCall } = useOnlineStore.getState();
    const newState = !directAudioEnabled;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = newState; });
    setDirectAudioEnabled(newState);
    if (activeDirectCall?.peerUid) {
      getSocket().emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: newState, videoEnabled: directVideoEnabled, screenSharing: directScreenSharing,
      });
    }
  }, [setDirectAudioEnabled]);

  const toggleDirectVideo = useCallback(() => {
    const { directAudioEnabled, directVideoEnabled, directScreenSharing, activeDirectCall } = useOnlineStore.getState();
    const newState = !directVideoEnabled;
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newState; });
    setDirectVideoEnabled(newState);
    useOnlineStore.setState(s => ({
      activeDirectCall: s.activeDirectCall ? { ...s.activeDirectCall, _vt: Date.now() } : s.activeDirectCall,
    }));
    if (activeDirectCall?.peerUid) {
      getSocket().emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: directAudioEnabled, videoEnabled: newState, screenSharing: directScreenSharing,
      });
    }
  }, [setDirectVideoEnabled]);

  const startDirectScreenShare = useCallback(async () => {
    const { directAudioEnabled, activeDirectCall } = useOnlineStore.getState();
    try {
      const ss = await getDisplayMedia();
      screenStreamRef.current = ss;
      const track = ss.getVideoTracks()[0];
      if (pcRef.current) await replaceTrackOnPeer(pcRef.current, track);
      setDirectScreenSharing(true);
      if (activeDirectCall?.peerUid) {
        getSocket().emit('direct_media_state', {
          targetUid: activeDirectCall.peerUid,
          audioEnabled: directAudioEnabled, videoEnabled: true, screenSharing: true,
        });
      }
      track.onended = () => stopDirectScreenShare();
    } catch (err) { console.error('screenShare:', err); }
  }, [setDirectScreenSharing]);

  const stopDirectScreenShare = useCallback(async () => {
    const { directAudioEnabled, directVideoEnabled, activeDirectCall } = useOnlineStore.getState();
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    const cam = localStreamRef.current?.getVideoTracks()[0];
    if (cam && pcRef.current) { cam.enabled = true; await replaceTrackOnPeer(pcRef.current, cam); }
    setDirectScreenSharing(false);
    if (activeDirectCall?.peerUid) {
      getSocket().emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: directAudioEnabled, videoEnabled: directVideoEnabled, screenSharing: false,
      });
    }
  }, [setDirectScreenSharing]);

  const sendDirectMessage = useCallback((message) => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (!activeDirectCall?.peerUid || !message?.trim()) return;
    const { user } = require('../store/authStore').useAuthStore.getState();
    const msg = {
      id: Date.now().toString(), uid: user?.uid, displayName: user?.displayName,
      message: message.trim(), timestamp: new Date().toISOString(),
    };
    addDirectMessage(msg);
    getSocket().emit('direct_chat_message', { targetUid: activeDirectCall.peerUid, message: message.trim() });
  }, [addDirectMessage]);

  // ── Socket listeners — single effect, stable deps, all state via refs ────
  useEffect(() => {
    const socket = getSocket();
    const socketRef = { current: socket };

    const onIncoming = ({ fromUid, fromDisplayName, fromAvatar }) => {
      playNotificationSound();
      setIncomingCall({ fromUid, fromDisplayName, fromAvatar });
    };

    // CALLER: acceptor accepted → caller gets media & sends offer
    const onAccepted = async ({ fromUid, fromDisplayName }) => {
      useOnlineStore.getState().setDirectCallStatus('connected');
      try {
        const stream = await getMedia();
        localStreamRef.current = stream;

        const { pc, remoteStream } = makePC(fromUid, socketRef);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        useOnlineStore.setState(s => ({
          activeDirectCall: s.activeDirectCall
            ? { ...s.activeDirectCall, localStream: stream, remoteStream, pc }
            : { peerUid: fromUid, peerName: fromDisplayName, peerAvatar: null, localStream: stream, remoteStream, pc },
        }));

        // Caller creates offer
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        socket.emit('direct_offer', { targetUid: fromUid, offer: pc.localDescription });
      } catch (err) {
        console.error('onAccepted error:', err);
        const st = useOnlineStore.getState();
        if (st.activeDirectCall?.peerUid) socket.emit('direct_call_end', { targetUid: st.activeDirectCall.peerUid });
        clearActiveDirectCall();
      }
    };

    const onRejected = () => { clearActiveDirectCall(); useOnlineStore.getState().setDirectCallStatus(null); };

    // ACCEPTOR: receives offer from caller
    const onDirectOffer = async ({ offer, fromUid }) => {
      const pc = pcRef.current;
      if (!pc) { console.warn('[DC] Got offer but no PC'); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescReadyRef.current = true;
        await flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('direct_answer', { targetUid: fromUid, answer: pc.localDescription });
      } catch (err) { console.error('[DC] onOffer error:', err); }
    };

    // CALLER: receives answer from acceptor
    const onDirectAnswer = async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc) return;
      if (pc.remoteDescription) { console.warn('[DC] Duplicate answer ignored'); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescReadyRef.current = true;
        await flushIce(pc);
      } catch (err) { console.error('[DC] onAnswer error:', err); }
    };

    // ICE — buffer until remote desc is ready
    const onDirectIce = async ({ candidate }) => {
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc) return;
      if (remoteDescReadyRef.current && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (err) { if (!err.message?.includes('Unknown ufrag')) console.error('ICE err:', err); }
      } else {
        iceQueueRef.current.push(candidate);
      }
    };

    const onCallEnded = () => { cleanupPC(); clearActiveDirectCall(); };

    const onPeerMedia = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerMediaState(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    const onDirectChat = (msg) => {
      const { user } = require('../store/authStore').useAuthStore.getState();
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
  }, []); // Mount once — all state accessed via refs or store.getState()

  return {
    requestCall, acceptCall, rejectCall, endDirectCall,
    toggleDirectAudio, toggleDirectVideo,
    startDirectScreenShare, stopDirectScreenShare,
    sendDirectMessage,
  };
};
