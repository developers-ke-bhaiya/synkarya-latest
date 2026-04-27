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
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    play(659.25, 0, 0.35);
    play(830.61, 0.18, 0.35);
    play(987.77, 0.36, 0.5);
  } catch {}
};

export const useDirectCall = () => {
  const {
    setIncomingCall, clearIncomingCall,
    setActiveDirectCall, clearActiveDirectCall,
    setDirectCallStatus, setDirectAudioEnabled, setDirectVideoEnabled,
    setDirectScreenSharing, setPeerMediaState, addDirectMessage,
    directAudioEnabled, directVideoEnabled, directScreenSharing,
  } = useOnlineStore();

  const socket = getSocket();
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  // ── helpers ────────────────────────────────────────────────────────────────
  const setupPC = useCallback((peerUid) => {
    const pc = createPeerConnection();
    pcRef.current = pc;
    const remoteStream = new MediaStream();

    pc.ontrack = ({ track }) => {
      remoteStream.addTrack(track);
      useOnlineStore.setState((s) => ({
        activeDirectCall: s.activeDirectCall
          ? { ...s.activeDirectCall, remoteStream: new MediaStream(remoteStream.getTracks()) }
          : s.activeDirectCall,
      }));
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('direct_ice_candidate', { targetUid: peerUid, candidate });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        clearActiveDirectCall();
      }
    };

    return { pc, remoteStream };
  }, [socket, clearActiveDirectCall]);

  // ── Request call ───────────────────────────────────────────────────────────
  const requestCall = useCallback((targetUid, targetName, targetAvatar) => {
    socket.emit('direct_call_request', { targetUid });
    setDirectCallStatus('calling');
    setActiveDirectCall({
      peerUid: targetUid, peerName: targetName, peerAvatar: targetAvatar,
      localStream: null, remoteStream: null, pc: null,
    });
  }, [socket, setDirectCallStatus, setActiveDirectCall]);

  // ── Accept call (callee side) ─────────────────────────────────────────────
  const acceptCall = useCallback(async (fromUid, fromDisplayName, fromAvatar) => {
    clearIncomingCall();
    setDirectCallStatus('connected');
    try {
      const stream = await getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      const { pc, remoteStream } = setupPC(fromUid);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      setActiveDirectCall({
        peerUid: fromUid, peerName: fromDisplayName, peerAvatar: fromAvatar,
        localStream: stream, remoteStream, pc,
      });
      socket.emit('direct_call_accept', { targetUid: fromUid });
    } catch (err) {
      console.error('acceptCall error:', err);
      rejectCall(fromUid);
    }
  }, [clearIncomingCall, setDirectCallStatus, setActiveDirectCall, setupPC, socket]);

  // ── Reject ─────────────────────────────────────────────────────────────────
  const rejectCall = useCallback((fromUid) => {
    socket.emit('direct_call_reject', { targetUid: fromUid });
    clearIncomingCall();
    setDirectCallStatus(null);
  }, [socket, clearIncomingCall, setDirectCallStatus]);

  // ── End call ───────────────────────────────────────────────────────────────
  const endDirectCall = useCallback(() => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_call_end', { targetUid: activeDirectCall.peerUid });
    }
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    if (localStreamRef.current) { stopStream(localStreamRef.current); localStreamRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    clearActiveDirectCall();
  }, [socket, clearActiveDirectCall]);

  // ── Toggle audio ───────────────────────────────────────────────────────────
  const toggleDirectAudio = useCallback(() => {
    const newState = !directAudioEnabled;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = newState; });
    }
    setDirectAudioEnabled(newState);
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: newState, videoEnabled: directVideoEnabled, screenSharing: directScreenSharing,
      });
    }
  }, [directAudioEnabled, directVideoEnabled, directScreenSharing, setDirectAudioEnabled, socket]);

  // ── Toggle video ───────────────────────────────────────────────────────────
  const toggleDirectVideo = useCallback(() => {
    const newState = !directVideoEnabled;
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = newState; });
    }
    setDirectVideoEnabled(newState);
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: directAudioEnabled, videoEnabled: newState, screenSharing: directScreenSharing,
      });
    }
  }, [directAudioEnabled, directVideoEnabled, directScreenSharing, setDirectVideoEnabled, socket]);

  // ── Screen share ───────────────────────────────────────────────────────────
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
    } catch (err) { console.error('startDirectScreenShare error:', err); }
  }, [directAudioEnabled, setDirectScreenSharing, socket]);

  const stopDirectScreenShare = useCallback(async () => {
    if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack && pcRef.current) {
      cameraTrack.enabled = true;
      await replaceTrackOnPeer(pcRef.current, cameraTrack);
    }
    setDirectScreenSharing(false);
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_media_state', {
        targetUid: activeDirectCall.peerUid,
        audioEnabled: directAudioEnabled, videoEnabled: directVideoEnabled, screenSharing: false,
      });
    }
  }, [directAudioEnabled, directVideoEnabled, setDirectScreenSharing, socket]);

  // ── Send direct chat message ───────────────────────────────────────────────
  const sendDirectMessage = useCallback((message) => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (!activeDirectCall?.peerUid || !message?.trim()) return;
    socket.emit('direct_chat_message', { targetUid: activeDirectCall.peerUid, message: message.trim() });
  }, [socket]);

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const onIncoming = ({ fromUid, fromDisplayName, fromAvatar }) => {
      playNotificationSound();
      setIncomingCall({ fromUid, fromDisplayName, fromAvatar });
    };

    // Caller: call was accepted → start WebRTC as offerer
    const onAccepted = async ({ fromUid, fromDisplayName }) => {
      setDirectCallStatus('connected');
      try {
        const stream = await getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        const { pc, remoteStream } = setupPC(fromUid);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        useOnlineStore.setState((s) => ({
          activeDirectCall: s.activeDirectCall
            ? { ...s.activeDirectCall, localStream: stream, remoteStream, pc }
            : s.activeDirectCall,
        }));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('direct_offer', { targetUid: fromUid, offer: pc.localDescription });
      } catch (err) {
        console.error('onAccepted error:', err);
        endDirectCall();
      }
    };

    const onRejected = () => { clearActiveDirectCall(); setDirectCallStatus(null); };

    const onDirectOffer = async ({ offer, fromUid }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('direct_answer', { targetUid: fromUid, answer: pc.localDescription });
      } catch (err) { console.error('direct_offer error:', err); }
    };

    const onDirectAnswer = async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
      catch (err) { console.error('direct_answer error:', err); }
    };

    const onDirectIce = async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };

    const onCallEnded = () => {
      if (screenStreamRef.current) { stopStream(screenStreamRef.current); screenStreamRef.current = null; }
      if (localStreamRef.current) { stopStream(localStreamRef.current); localStreamRef.current = null; }
      if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
      clearActiveDirectCall();
    };

    const onPeerMedia = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerMediaState(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    const onDirectChat = (msg) => addDirectMessage(msg);

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
  }, [socket, setupPC]);

  return {
    requestCall, acceptCall, rejectCall, endDirectCall,
    toggleDirectAudio, toggleDirectVideo,
    startDirectScreenShare, stopDirectScreenShare,
    sendDirectMessage,
  };
};
