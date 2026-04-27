import { useCallback, useEffect, useRef } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../services/socket';
import { createPeerConnection, getUserMedia, getDisplayMedia, stopStream, replaceTrackOnPeer } from '../services/webrtc';

// Unique bell sound using Web Audio API
export const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, start, duration, gain = 0.3) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gainNode.gain.setValueAtTime(0, ctx.currentTime + start);
      gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    // Unique 3-tone chime: E5 → G#5 → B5
    playTone(659.25, 0, 0.4);
    playTone(830.61, 0.2, 0.4);
    playTone(987.77, 0.4, 0.6);
  } catch (err) {
    console.warn('Could not play notification sound:', err);
  }
};

export const useDirectCall = () => {
  const {
    setIncomingCall, clearIncomingCall,
    setActiveDirectCall, clearActiveDirectCall,
    setDirectCallStatus, setDirectAudioEnabled,
    setDirectVideoEnabled, setPeerMediaState,
    directAudioEnabled, directVideoEnabled, directScreenSharing,
    setDirectScreenSharing, activeDirectCall,
  } = useOnlineStore();
  const { user } = useAuthStore();
  const socket = getSocket();
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  // ── Request a call to another user ────────────────────────────────────────
  const requestCall = useCallback((targetUid, targetName, targetAvatar) => {
    socket.emit('direct_call_request', { targetUid });
    setDirectCallStatus('calling');
    setActiveDirectCall({ peerUid: targetUid, peerName: targetName, peerAvatar: targetAvatar, localStream: null, remoteStream: null, pc: null });
  }, [socket, setDirectCallStatus, setActiveDirectCall]);

  // ── Accept incoming call ───────────────────────────────────────────────────
  const acceptCall = useCallback(async (fromUid, fromDisplayName, fromAvatar) => {
    clearIncomingCall();
    setDirectCallStatus('connected');

    try {
      const stream = await getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const remoteStream = new MediaStream();

      pc.ontrack = ({ track }) => {
        remoteStream.addTrack(track);
        setActiveDirectCall((prev) => ({ ...prev, remoteStream: new MediaStream(remoteStream.getTracks()) }));
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('direct_ice_candidate', { targetUid: fromUid, candidate });
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') pc.restartIce();
      };

      setActiveDirectCall({
        peerUid: fromUid, peerName: fromDisplayName, peerAvatar: fromAvatar,
        localStream: stream, remoteStream, pc,
      });

      socket.emit('direct_call_accept', { targetUid: fromUid });
    } catch (err) {
      console.error('acceptCall error:', err);
      rejectCall(fromUid);
    }
  }, [clearIncomingCall, setDirectCallStatus, setActiveDirectCall, socket]);

  // ── Reject incoming call ───────────────────────────────────────────────────
  const rejectCall = useCallback((fromUid) => {
    socket.emit('direct_call_reject', { targetUid: fromUid });
    clearIncomingCall();
    setDirectCallStatus(null);
  }, [socket, clearIncomingCall, setDirectCallStatus]);

  // ── End active call ────────────────────────────────────────────────────────
  const endDirectCall = useCallback(() => {
    const { activeDirectCall } = useOnlineStore.getState();
    if (activeDirectCall?.peerUid) {
      socket.emit('direct_call_end', { targetUid: activeDirectCall.peerUid });
    }
    if (localStreamRef.current) stopStream(localStreamRef.current);
    localStreamRef.current = null;
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    clearActiveDirectCall();
  }, [socket, clearActiveDirectCall]);

  // ── Toggle audio in direct call ────────────────────────────────────────────
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

  // ── Toggle video in direct call ────────────────────────────────────────────
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

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Incoming call notification
    const onIncoming = ({ fromUid, fromDisplayName, fromAvatar }) => {
      playNotificationSound();
      setIncomingCall({ fromUid, fromDisplayName, fromAvatar });
    };

    // Our call was accepted — now start WebRTC as caller
    const onAccepted = async ({ fromUid, fromDisplayName }) => {
      setDirectCallStatus('connected');
      try {
        const stream = await getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;

        const pc = createPeerConnection();
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        const remoteStream = new MediaStream();

        pc.ontrack = ({ track }) => {
          remoteStream.addTrack(track);
          useOnlineStore.setState((s) => ({
            activeDirectCall: { ...s.activeDirectCall, remoteStream: new MediaStream(remoteStream.getTracks()) },
          }));
        };

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) socket.emit('direct_ice_candidate', { targetUid: fromUid, candidate });
        };

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'failed') pc.restartIce();
        };

        // Update with streams
        useOnlineStore.setState((s) => ({
          activeDirectCall: { ...s.activeDirectCall, localStream: stream, remoteStream, pc },
        }));

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('direct_offer', { targetUid: fromUid, offer: pc.localDescription });
      } catch (err) {
        console.error('onAccepted error:', err);
        endDirectCall();
      }
    };

    const onRejected = () => {
      clearActiveDirectCall();
      setDirectCallStatus(null);
    };

    // Receive offer (callee side)
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

    // Receive answer (caller side)
    const onDirectAnswer = async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); }
      catch (err) { console.error('direct_answer error:', err); }
    };

    const onDirectIce = async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch {}
    };

    const onCallEnded = () => {
      if (localStreamRef.current) stopStream(localStreamRef.current);
      localStreamRef.current = null;
      if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
      clearActiveDirectCall();
    };

    const onPeerMediaState = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerMediaState(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    socket.on('direct_call_incoming', onIncoming);
    socket.on('direct_call_accepted', onAccepted);
    socket.on('direct_call_rejected', onRejected);
    socket.on('direct_offer', onDirectOffer);
    socket.on('direct_answer', onDirectAnswer);
    socket.on('direct_ice_candidate', onDirectIce);
    socket.on('direct_call_ended', onCallEnded);
    socket.on('direct_peer_media_state', onPeerMediaState);

    return () => {
      socket.off('direct_call_incoming', onIncoming);
      socket.off('direct_call_accepted', onAccepted);
      socket.off('direct_call_rejected', onRejected);
      socket.off('direct_offer', onDirectOffer);
      socket.off('direct_answer', onDirectAnswer);
      socket.off('direct_ice_candidate', onDirectIce);
      socket.off('direct_call_ended', onCallEnded);
      socket.off('direct_peer_media_state', onPeerMediaState);
    };
  }, [socket]);

  return { requestCall, acceptCall, rejectCall, endDirectCall, toggleDirectAudio, toggleDirectVideo };
};
