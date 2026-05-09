import { useCallback, useEffect, useRef } from 'react';
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

export const useDirectCall = () => {
  const {
    setIncomingCall, clearIncomingCall,
    setActiveDirectCall, clearActiveDirectCall,
    setDirectCallStatus, setDirectAudioEnabled, setDirectVideoEnabled,
    setDirectScreenSharing, setPeerMediaState, addDirectMessage,
  } = useOnlineStore();

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceQueueRef = useRef([]);
  const remoteDescReadyRef = useRef(false);
  const pendingOfferRef = useRef(null); // stores offer if it arrives before PC is ready

  const getSocket$ = () => getSocket();

  const flushIce = async (pc) => {
    const q = iceQueueRef.current.splice(0);
    for (const c of q) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  };

  const cleanupPC = () => {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (localStreamRef.current) { stopStream(localStreamRef.current); localStreamRef.current = null; }
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    remoteStreamRef.current = null;
    remoteDescReadyRef.current = false;
    iceQueueRef.current = [];
    pendingOfferRef.current = null;
  };

  const getMedia = async () => {
    try { return await getUserMedia({ video: true, audio: true }); }
    catch { return await getUserMedia({ video: false, audio: true }); }
  };

  // Creates a fresh PeerConnection for a direct call
  const buildPC = (peerUid) => {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} }
    remoteDescReadyRef.current = false;
    iceQueueRef.current = [];

    const pc = createPeerConnection();
    pcRef.current = pc;

    const rs = new MediaStream();
    remoteStreamRef.current = rs;

    pc.ontrack = ({ track }) => {
      console.log('[DC] ontrack:', track.kind, track.readyState);
      if (!rs.getTracks().find(t => t.id === track.id)) rs.addTrack(track);
      // FIX: force update even if remoteStream ref is same object
      useOnlineStore.setState(s => ({
        activeDirectCall: s.activeDirectCall
          ? { ...s.activeDirectCall, remoteStream: rs, _trackUpdate: Date.now() }
          : { peerUid: peerUid, peerName: '', peerAvatar: null, localStream: null, remoteStream: rs, pc, _trackUpdate: Date.now() },
      }));
      // Poll to keep video showing even if readyState changes
      track.onunmute = () => {
        useOnlineStore.setState(s => ({
          activeDirectCall: s.activeDirectCall ? { ...s.activeDirectCall, _trackUpdate: Date.now() } : s.activeDirectCall,
        }));
      };
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) getSocket$().emit('direct_ice_candidate', { targetUid: peerUid, candidate });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };

    // FIX: if offer arrived before PC was ready, process it now
    if (pendingOfferRef.current) {
      const { offer, fromUid } = pendingOfferRef.current;
      pendingOfferRef.current = null;
      console.log('[DC] processing pending offer from', fromUid);
      setTimeout(async () => {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          remoteDescReadyRef.current = true;
          await flushIce(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          getSocket$().emit('direct_answer', { targetUid: fromUid, answer: pc.localDescription });
          console.log('[DC] pending offer processed, answer sent');
        } catch (err) { console.error('[DC] pending offer error:', err); }
      }, 0);
    }

    return { pc, remoteStream: rs };
  };

  // ── Public API ─────────────────────────────────────────────────────────────
  const requestCall = useCallback((targetUid, targetName, targetAvatar) => {
    getSocket$().emit('direct_call_request', { targetUid });
    useOnlineStore.getState().setDirectCallStatus('calling');
    useOnlineStore.getState().setActiveDirectCall({
      peerUid: targetUid, peerName: targetName, peerAvatar: targetAvatar,
      localStream: null, remoteStream: null, pc: null,
    });
  }, []);

  // ACCEPTOR: gets camera, builds PC, waits for offer from caller
  const acceptCall = useCallback(async (fromUid, fromDisplayName, fromAvatar) => {
    clearIncomingCall();
    setDirectCallStatus('connected');
    try {
      const stream = await getMedia();
      localStreamRef.current = stream;

      const { pc, remoteStream } = buildPC(fromUid);
      // Add local tracks so they go to caller when offer/answer completes
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      setActiveDirectCall({
        peerUid: fromUid, peerName: fromDisplayName, peerAvatar: fromAvatar,
        localStream: stream, remoteStream, pc,
      });

      // Tell caller we accepted — they will now send us an offer
      getSocket$().emit('direct_call_accept', { targetUid: fromUid });
    } catch (err) {
      console.error('[DC] acceptCall error:', err);
      getSocket$().emit('direct_call_reject', { targetUid: fromUid });
      clearIncomingCall();
      setDirectCallStatus(null);
    }
  }, [clearIncomingCall, setDirectCallStatus, setActiveDirectCall]);

  const rejectCall = useCallback((fromUid) => {
    getSocket$().emit('direct_call_reject', { targetUid: fromUid });
    clearIncomingCall();
    setDirectCallStatus(null);
  }, [clearIncomingCall, setDirectCallStatus]);

  const endDirectCall = useCallback(() => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) getSocket$().emit('direct_call_end', { targetUid: activeDirectCall.peerUid });
    cleanupPC();
    clearActiveDirectCall();
  }, [clearActiveDirectCall]);

  const toggleDirectAudio = useCallback(() => {
    const { directAudioEnabled, directVideoEnabled, directScreenSharing, activeDirectCall } = useOnlineStore.getState();
    const newVal = !directAudioEnabled;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = newVal; });
    setDirectAudioEnabled(newVal);
    if (activeDirectCall?.peerUid) {
      getSocket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: newVal, videoEnabled: directVideoEnabled, screenSharing: directScreenSharing });
    }
  }, [setDirectAudioEnabled]);

  const toggleDirectVideo = useCallback(() => {
    const { directAudioEnabled, directVideoEnabled, directScreenSharing, activeDirectCall } = useOnlineStore.getState();
    const newVal = !directVideoEnabled;
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = newVal; });
    setDirectVideoEnabled(newVal);
    useOnlineStore.setState(s => ({
      activeDirectCall: s.activeDirectCall ? { ...s.activeDirectCall, _vt: Date.now() } : s.activeDirectCall,
    }));
    if (activeDirectCall?.peerUid) {
      getSocket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: directAudioEnabled, videoEnabled: newVal, screenSharing: directScreenSharing });
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
        getSocket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: directAudioEnabled, videoEnabled: true, screenSharing: true });
      }
      track.onended = () => stopDirectScreenShare();
    } catch (err) { console.error('[DC] screenShare:', err); }
  }, [setDirectScreenSharing]);

  const stopDirectScreenShare = useCallback(async () => {
    const { directAudioEnabled, directVideoEnabled, activeDirectCall } = useOnlineStore.getState();
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    const cam = localStreamRef.current?.getVideoTracks()[0];
    if (cam && pcRef.current) { cam.enabled = true; await replaceTrackOnPeer(pcRef.current, cam); }
    setDirectScreenSharing(false);
    if (activeDirectCall?.peerUid) {
      getSocket$().emit('direct_media_state', { targetUid: activeDirectCall.peerUid, audioEnabled: directAudioEnabled, videoEnabled: directVideoEnabled, screenSharing: false });
    }
  }, [setDirectScreenSharing]);

  const sendDirectMessage = useCallback((message) => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (!activeDirectCall?.peerUid || !message?.trim()) return;
    const { user } = useAuthStore.getState();
    const msg = {
      id: Date.now().toString() + '_local',
      uid: user?.uid, displayName: user?.displayName,
      message: message.trim(), timestamp: new Date().toISOString(),
    };
    addDirectMessage(msg);
    getSocket$().emit('direct_chat_message', { targetUid: activeDirectCall.peerUid, message: message.trim() });
  }, [addDirectMessage]);

  // ── Socket listeners — mounted ONCE ───────────────────────────────────────
  useEffect(() => {
    const socket = getSocket$();

    const onIncoming = ({ fromUid, fromDisplayName, fromAvatar }) => {
      playNotificationSound();
      setIncomingCall({ fromUid, fromDisplayName, fromAvatar });
    };

    // CALLER: acceptor accepted → build PC and send offer
    const onAccepted = async ({ fromUid, fromDisplayName }) => {
      useOnlineStore.getState().setDirectCallStatus('connected');
      try {
        const stream = await getMedia();
        localStreamRef.current = stream;

        const { pc, remoteStream } = buildPC(fromUid);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        useOnlineStore.setState(s => ({
          activeDirectCall: s.activeDirectCall
            ? { ...s.activeDirectCall, localStream: stream, remoteStream, pc }
            : { peerUid: fromUid, peerName: fromDisplayName, peerAvatar: null, localStream: stream, remoteStream, pc },
        }));

        // Caller creates and sends offer
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        socket.emit('direct_offer', { targetUid: fromUid, offer: pc.localDescription });
        console.log('[DC] offer sent to', fromDisplayName);
      } catch (err) {
        console.error('[DC] onAccepted error:', err);
        clearActiveDirectCall();
      }
    };

    const onRejected = () => { clearActiveDirectCall(); useOnlineStore.getState().setDirectCallStatus(null); };

    // ACCEPTOR: receives offer → creates answer
    const onDirectOffer = async ({ offer, fromUid }) => {
      const pc = pcRef.current;
      if (!pc) {
        // PC not ready yet (acceptCall still getting camera) — queue the offer
        console.log('[DC] PC not ready, queuing offer from', fromUid);
        pendingOfferRef.current = { offer, fromUid };
        return;
      }
      try {
        if (pc.signalingState !== 'stable') {
          console.warn('[DC] Bad state for offer:', pc.signalingState);
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescReadyRef.current = true;
        await flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('direct_answer', { targetUid: fromUid, answer: pc.localDescription });
        console.log('[DC] answer sent to', fromUid);
      } catch (err) { console.error('[DC] onOffer error:', err); }
    };

    // CALLER: receives answer
    const onDirectAnswer = async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc || pc.remoteDescription) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescReadyRef.current = true;
        await flushIce(pc);
        console.log('[DC] answer received, connection establishing...');
      } catch (err) { console.error('[DC] onAnswer error:', err); }
    };

    const onDirectIce = async ({ candidate }) => {
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc) return;
      if (remoteDescReadyRef.current && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else {
        iceQueueRef.current.push(candidate);
      }
    };

    const onCallEnded = () => { cleanupPC(); clearActiveDirectCall(); };

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
