import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../store/callStore';
import { getSocket } from '../services/socket';
import {
  createPeerConnection,
  addStreamToPeer,
  replaceTrackOnPeer,
  getUserMedia,
  getDisplayMedia,
  stopStream,
} from '../services/webrtc';

/**
 * useWebRTC — mesh WebRTC hook
 *
 * Manages all RTCPeerConnections for a room.
 * One connection per remote peer. Full mesh: every user connects to every other.
 *
 * Flow:
 *   New user joins → existing users send offers → new user answers
 *   ICE candidates relay through signaling server
 *   On leave → close all PCs, stop all tracks
 */
export const useWebRTC = () => {
  const {
    localStream,
    peerConnections,
    setLocalStream,
    setRemoteStream,
    removeRemoteStream,
    addPeerConnection,
    removePeerConnection,
    setPeerInfo,
    removePeerInfo,
    currentRoom,
    audioEnabled,
    videoEnabled,
    setAudioEnabled,
    setVideoEnabled,
    setScreenStream,
    setInCall,
    cleanupCall,
    isScreenSharing,
  } = useCallStore();

  const localStreamRef = useRef(null);
  const makingOfferRef = useRef(new Set()); // track in-progress offer creation

  const socket = getSocket();

  // ─── Initialize local media ───────────────────────────────────────────────
  const initLocalStream = useCallback(async () => {
    try {
      const stream = await getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to get user media:', err);
      // Try audio only
      try {
        const audioOnly = await getUserMedia({ video: false, audio: true });
        localStreamRef.current = audioOnly;
        setLocalStream(audioOnly);
        setVideoEnabled(false);
        return audioOnly;
      } catch (audioErr) {
        console.error('Failed to get audio only:', audioErr);
        throw audioErr;
      }
    }
  }, [setLocalStream, setVideoEnabled]);

  // ─── Create peer for a specific remote uid ───────────────────────────────
  const createPeer = useCallback(
    (remoteUid, remoteDisplayName) => {
      const stream = localStreamRef.current;
      if (!stream) {
        console.warn('createPeer called without local stream');
        return null;
      }

      // Prevent duplicates
      const existing = useCallStore.getState().peerConnections.get(remoteUid);
      if (existing && existing.signalingState !== 'closed') {
        console.log(`Peer already exists for ${remoteUid}, skipping`);
        return existing;
      }

      const pc = createPeerConnection();
      addStreamToPeer(pc, stream);

      // Track remote stream
      const remoteStream = new MediaStream();
      setRemoteStream(remoteUid, remoteStream);

      pc.ontrack = ({ track }) => {
        remoteStream.addTrack(track);
        setRemoteStream(remoteUid, new MediaStream(remoteStream.getTracks()));
      };

      // ICE candidates
      pc.onicecandidate = ({ candidate }) => {
        if (candidate && currentRoom?.roomId) {
          socket.emit('ice_candidate', {
            targetUid: remoteUid,
            candidate,
            roomId: currentRoom.roomId,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE state [${remoteUid}]:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.warn(`ICE failed for ${remoteUid}, restarting ICE`);
          pc.restartIce();
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`Connection state [${remoteUid}]:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          removePeerConnection(remoteUid);
          removeRemoteStream(remoteUid);
          removePeerInfo(remoteUid);
        }
      };

      pc.onnegotiationneeded = async () => {
        if (makingOfferRef.current.has(remoteUid)) return;
        makingOfferRef.current.add(remoteUid);
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') {
            makingOfferRef.current.delete(remoteUid);
            return;
          }
          await pc.setLocalDescription(offer);
          socket.emit('offer', {
            targetUid: remoteUid,
            offer: pc.localDescription,
            roomId: currentRoom?.roomId,
          });
        } catch (err) {
          console.error('negotiationneeded error:', err);
        } finally {
          makingOfferRef.current.delete(remoteUid);
        }
      };

      addPeerConnection(remoteUid, pc);
      setPeerInfo(remoteUid, { displayName: remoteDisplayName });
      return pc;
    },
    [
      addPeerConnection,
      addStreamToPeer,
      setRemoteStream,
      removeRemoteStream,
      removePeerConnection,
      removePeerInfo,
      setPeerInfo,
      socket,
      currentRoom,
    ]
  );

  // ─── Send offer to a peer ────────────────────────────────────────────────
  const sendOffer = useCallback(
    async (remoteUid, remoteDisplayName) => {
      const pc = createPeer(remoteUid, remoteDisplayName);
      if (!pc) return;

      if (makingOfferRef.current.has(remoteUid)) return;
      makingOfferRef.current.add(remoteUid);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', {
          targetUid: remoteUid,
          offer: pc.localDescription,
          roomId: currentRoom?.roomId,
        });
      } catch (err) {
        console.error('sendOffer error:', err);
      } finally {
        makingOfferRef.current.delete(remoteUid);
      }
    },
    [createPeer, socket, currentRoom]
  );

  // ─── Socket event handlers ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Existing users tell us who's in the room
    const onUsersInRoom = ({ users }) => {
      users.forEach(({ uid, displayName }) => {
        sendOffer(uid, displayName);
      });
    };

    // New user joined — they will send us an offer, just set peer info
    const onUserJoined = ({ uid, displayName }) => {
      setPeerInfo(uid, { displayName });
    };

    // Receive offer from a peer
    const onOffer = async ({ offer, fromUid, fromDisplayName }) => {
      let pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') {
        pc = createPeer(fromUid, fromDisplayName);
        if (!pc) return;
      }

      try {
        // Glare handling: if we're also making an offer, polite peer yields
        const offerCollision =
          offer.type === 'offer' && (makingOfferRef.current.has(fromUid) || pc.signalingState !== 'stable');

        if (offerCollision) {
          // We yield: rollback our local description
          if (pc.signalingState !== 'stable') {
            await pc.setLocalDescription({ type: 'rollback' });
          }
          makingOfferRef.current.delete(fromUid);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer', {
          targetUid: fromUid,
          answer: pc.localDescription,
          roomId: currentRoom?.roomId,
        });
      } catch (err) {
        console.error('onOffer error:', err);
      }
    };

    // Receive answer
    const onAnswer = async ({ answer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') return;

      try {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('onAnswer error:', err);
      }
    };

    // Receive ICE candidate
    const onIceCandidate = async ({ candidate, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc || pc.signalingState === 'closed') return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        if (!err.message.includes('Unknown ufrag')) {
          console.error('onIceCandidate error:', err);
        }
      }
    };

    // Peer left
    const onUserLeft = ({ uid }) => {
      removePeerConnection(uid);
      removeRemoteStream(uid);
      removePeerInfo(uid);
    };

    // Peer media state update
    const onPeerMediaState = ({ uid, audioEnabled, videoEnabled, screenSharing }) => {
      setPeerInfo(uid, { audioEnabled, videoEnabled, screenSharing });
    };

    // Renegotiation (screen share)
    const onRenegotiate = async ({ offer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('renegotiate_answer', {
          targetUid: fromUid,
          answer: pc.localDescription,
          roomId: currentRoom?.roomId,
        });
      } catch (err) {
        console.error('onRenegotiate error:', err);
      }
    };

    const onRenegotiateAnswer = async ({ answer, fromUid }) => {
      const pc = useCallStore.getState().peerConnections.get(fromUid);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('onRenegotiateAnswer error:', err);
      }
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
  }, [socket, currentRoom, createPeer, sendOffer, setPeerInfo, removePeerConnection, removeRemoteStream, removePeerInfo]);

  // ─── Toggle audio ─────────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    socket.emit('media_state', {
      roomId: currentRoom?.roomId,
      audioEnabled: newState,
      videoEnabled,
      screenSharing: isScreenSharing,
    });
  }, [audioEnabled, videoEnabled, isScreenSharing, setAudioEnabled, socket, currentRoom]);

  // ─── Toggle video ─────────────────────────────────────────────────────────
  const toggleVideo = useCallback(() => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    socket.emit('media_state', {
      roomId: currentRoom?.roomId,
      audioEnabled,
      videoEnabled: newState,
      screenSharing: isScreenSharing,
    });
  }, [audioEnabled, videoEnabled, isScreenSharing, setVideoEnabled, socket, currentRoom]);

  // ─── Start screen share ───────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await getDisplayMedia();
      const screenTrack = screenStream.getVideoTracks()[0];
      setScreenStream(screenStream);

      // Replace video track in all peer connections
      const allPeers = useCallStore.getState().peerConnections;
      const replacePromises = [];

      allPeers.forEach((pc, uid) => {
        replacePromises.push(replaceTrackOnPeer(pc, screenTrack));
      });

      await Promise.all(replacePromises);

      // Notify peers
      socket.emit('media_state', {
        roomId: currentRoom?.roomId,
        audioEnabled,
        videoEnabled: true,
        screenSharing: true,
      });

      // When screen share ends
      screenTrack.onended = () => stopScreenShare();

      return true;
    } catch (err) {
      console.error('startScreenShare error:', err);
      return false;
    }
  }, [socket, currentRoom, audioEnabled, setScreenStream]);

  // ─── Stop screen share ────────────────────────────────────────────────────
  const stopScreenShare = useCallback(async () => {
    const { screenStream, localStream } = useCallStore.getState();
    if (screenStream) {
      stopStream(screenStream);
      setScreenStream(null);
    }

    // Restore camera track
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      const allPeers = useCallStore.getState().peerConnections;
      const replacePromises = [];
      allPeers.forEach((pc) => {
        replacePromises.push(replaceTrackOnPeer(pc, cameraTrack));
      });
      await Promise.all(replacePromises);
    }

    socket.emit('media_state', {
      roomId: currentRoom?.roomId,
      audioEnabled,
      videoEnabled,
      screenSharing: false,
    });
  }, [socket, currentRoom, audioEnabled, videoEnabled, setScreenStream]);

  // ─── End call ─────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    socket.emit('leave_room');
    cleanupCall();
  }, [socket, cleanupCall]);

  return {
    initLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    endCall,
  };
};
