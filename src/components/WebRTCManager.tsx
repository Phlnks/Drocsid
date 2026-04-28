import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { playConnectSound, playDisconnectSound } from '../lib/sounds';
import socket from '../lib/socket';

function AudioPlayer({ stream }: { key?: any, stream: any }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isDeafened, voiceSettings } = useAppStore();
  
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(e => {
        if (e.name !== 'AbortError') {
          console.error("Audio play error:", e);
        }
      });
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isDeafened;
    }
  }, [isDeafened]);

  useEffect(() => {
    if (audioRef.current && voiceSettings.selectedSpeakerId && (audioRef.current as any).setSinkId) {
      (audioRef.current as any).setSinkId(voiceSettings.selectedSpeakerId)
        .catch((e: any) => console.error("Error setting output device:", e));
    }
  }, [voiceSettings.selectedSpeakerId]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}

export default function WebRTCManager() {
  const { user: currentUser } = useAuthStore();
  const { 
    connectedVoiceChannelId, 
    isVoiceMuted, 
    setIsVoiceMuted,
    isDeafened,
    setIsDeafened,
    voiceSettings, 
    setSpeakingUsers, 
    setConnectedVoiceChannelId,
    isScreenSharing,
    setIsScreenSharing,
    screenShareQuality,
    localScreenShareStream,
    setLocalScreenShareStream,
    setRemoteScreenShares,
    viewingScreenShares,
    setViewingScreenShares,
    setActiveStreamFocus
  } = useAppStore();
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenShareStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  
  const voiceParticipantsMap = useAppStore(state => state.voiceParticipants);
  const voiceParticipants = voiceParticipantsMap[connectedVoiceChannelId || ''] || [];

  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const iceQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastMoveTimestampRef = useRef<number>(Date.now());
  const localStreamIdRef = useRef<string | null>(null);
  const remoteStreamIdsRef = useRef<Map<string, string>>(new Map());
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup stale voice participants on mount
  useEffect(() => {
    if (!currentUser) return;
    // We no longer use Supabase for voice participants, so no need to clean up here.
    // The server handles it on disconnect.
  }, [currentUser]);

  // Listen for forced voice moves
  useEffect(() => {
    const handleForceMove = (data: { channelId: string | null }) => {
      setConnectedVoiceChannelId(data.channelId);
    };

    socket.on('force-move', handleForceMove);
    return () => {
      socket.off('force-move', handleForceMove);
    };
  }, [setConnectedVoiceChannelId]);

  // Handle mute state
  useEffect(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isVoiceMuted;
      }
    }
    
    if (connectedVoiceChannelId && currentUser) {
      socket.emit('voice-state-update', {
        channelId: connectedVoiceChannelId,
        userId: currentUser.id,
        updates: { isMuted: isVoiceMuted }
      });
    }
  }, [isVoiceMuted, connectedVoiceChannelId, currentUser]);

  // Enforce AFK channel restrictions
  useEffect(() => {
    if (!connectedVoiceChannelId) return;

    const checkChannelAfk = async () => {
      const { data: channel } = await supabase.from('channels').select('name').eq('id', connectedVoiceChannelId).maybeSingle();
      if (channel && channel.name.endsWith(' [AFK]')) {
        if (!isVoiceMuted) setIsVoiceMuted(true);
        if (!isDeafened) setIsDeafened(true);
      }
    };

    checkChannelAfk();
  }, [connectedVoiceChannelId, isVoiceMuted, isDeafened, setIsVoiceMuted, setIsDeafened]);

  // Handle voice settings changes
  useEffect(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.applyConstraints({
          echoCancellation: voiceSettings.echoCancellation,
          noiseSuppression: voiceSettings.noiseSuppression,
          autoGainControl: voiceSettings.autoGainControl,
        }).catch(console.error);
      }
    }
  }, [voiceSettings]);

  // Handle local stream changes - add tracks to all existing peers
  useEffect(() => {
    if (localStream) {
      peersRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        let added = false;
        localStream.getTracks().forEach(track => {
          const alreadyAdded = senders.some(s => s.track === track);
          if (!alreadyAdded) {
            pc.addTrack(track, localStream);
            added = true;
          }
        });
        if (added && pc.signalingState === 'stable') {
          pc.onnegotiationneeded?.(new Event('negotiationneeded'));
        }
      });
    }
  }, [localStream]);

  // Handle screen sharing
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;

    const startScreenShare = async () => {
      if (localScreenShareStream && localScreenShareStream !== localScreenShareStreamRef.current) {
        // New screen share stream
        localScreenShareStreamRef.current = localScreenShareStream;
        
        // Add tracks to all peers
        peersRef.current.forEach((pc) => {
          localScreenShareStream.getTracks().forEach(track => {
            pc.addTrack(track, localScreenShareStream);
          });
          
          // Force negotiation if it doesn't fire automatically
          if (pc.signalingState === 'stable') {
            pc.onnegotiationneeded?.(new Event('negotiationneeded'));
          } else {
            console.log("PC signaling state not stable, negotiation deferred:", pc.signalingState);
          }
        });
      } else if (!localScreenShareStream && localScreenShareStreamRef.current) {
        // Screen share stopped
        const stream = localScreenShareStreamRef.current;
        
        // Remove tracks from all peers
        peersRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          stream.getTracks().forEach(track => {
            const sender = senders.find(s => s.track === track);
            if (sender) {
              pc.removeTrack(sender);
            }
          });
        });
        
        localScreenShareStreamRef.current = null;
      }
    };

    startScreenShare();
  }, [localScreenShareStream, connectedVoiceChannelId, currentUser]);

  // Handle Electron-specific screen sharing and external links
  useEffect(() => {
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');
    if (isElectron) {
      // Override window.open to use shell.openExternal via main process handler
      // (The main process already has a setWindowOpenHandler, but this is a fallback)
      const originalWindowOpen = window.open;
      window.open = (url?: string | URL, target?: string, features?: string) => {
        if (url && (url.toString().startsWith('http'))) {
          // In Electron, window.open with a remote URL will be caught by our setWindowOpenHandler
          return originalWindowOpen(url, target, features);
        }
        return originalWindowOpen(url, target, features);
      };

      return () => {
        window.open = originalWindowOpen;
      };
    }
  }, []);

  // Sync remote streams with voice participants state
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
      if (silentAudioRef.current) {
        silentAudioRef.current.pause();
      }
      return;
    }

    // Setup Media Session for mobile notification controls
    if ('mediaSession' in navigator) {
      const status = [
        isVoiceMuted ? 'Micro : OFF' : 'Micro : ON',
        isDeafened ? 'Sourdine : ON' : 'Sourdine : OFF'
      ].join(' | ');

      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Conversation Vocale',
        artist: 'Drocsid',
        album: status,
        artwork: [
          { src: '/logo.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      // Show "playing" if connected, "paused" if muted
      navigator.mediaSession.playbackState = isVoiceMuted ? 'paused' : 'playing';

      navigator.mediaSession.setActionHandler('play', () => {
        setIsVoiceMuted(false);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        setIsVoiceMuted(true);
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        setConnectedVoiceChannelId(null);
      });

      // Using next/previous track for Deafen (Sourdine) toggle
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        setIsDeafened(!isDeafened);
      });
      
      try {
        // @ts-ignore
        navigator.mediaSession.setActionHandler('togglemicrophone', () => {
          setIsVoiceMuted(!isVoiceMuted);
        });
        // @ts-ignore
        navigator.mediaSession.setActionHandler('hangup', () => {
          setConnectedVoiceChannelId(null);
        });
      } catch (e) {}
    }

    // Play a silent audio loop to keep the process alive in background on mobile
    if (!silentAudioRef.current) {
      const audio = new Audio();
      // Extremely short silent base64 wav
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFav7//v8BAAgAZGF0YQAAAAA=';
      audio.loop = true;
      silentAudioRef.current = audio;
    }
    
    silentAudioRef.current.play().catch(() => {
      // User interaction might be needed, but usually within a click handler
    });

    voiceParticipants.forEach(p => {
      const isMe = p.id === currentUser.id;
      const isStillStreaming = isMe ? isScreenSharing : p.isStreaming;

      if (!isStillStreaming) {
        // If they are not streaming according to server state, clean up their stream
        setRemoteScreenShares(prev => {
          if (!prev[p.id]) return prev;
          const newMap = { ...prev };
          delete newMap[p.id];
          return newMap;
        });
        
        setViewingScreenShares(prev => {
          if (!prev.has(p.id)) return prev;
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        });
        
        if (useAppStore.getState().activeStreamFocus === p.id) {
          setActiveStreamFocus(null);
        }
      }
    });
  }, [voiceParticipants, connectedVoiceChannelId, currentUser, isScreenSharing, setRemoteScreenShares, setViewingScreenShares, setActiveStreamFocus, setConnectedVoiceChannelId, isVoiceMuted, setIsVoiceMuted, isDeafened, setIsDeafened]);

  // Speaking detection
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
      }
      analysersRef.current.clear();
      setSpeakingUsers({});
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("AudioContext is not supported in this browser.");
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.error);
    }
    const analysers = analysersRef.current;

    // Add local stream
    if (localStream) {
      if (!analysers.has(currentUser.id) || localStreamIdRef.current !== localStream.id) {
        if (analysers.has(currentUser.id)) {
          analysers.delete(currentUser.id);
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(localStream);
        source.connect(analyser);
        analysers.set(currentUser.id, analyser);
        localStreamIdRef.current = localStream.id;
      }
    }

    // Add remote streams
    remoteStreams.forEach((stream, uid) => {
      if (!analysers.has(uid) || remoteStreamIdsRef.current.get(uid) !== stream.id) {
        if (analysers.has(uid)) {
          analysers.delete(uid);
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        analysers.set(uid, analyser);
        remoteStreamIdsRef.current.set(uid, stream.id);
      }
    });

    // Remove old streams
    const currentUids = new Set(remoteStreams.keys());
    if (currentUser) currentUids.add(currentUser.id);
    
    for (const uid of analysers.keys()) {
      if (!currentUids.has(uid)) {
        analysers.delete(uid);
      }
    }

    const checkSpeaking = () => {
      const newSpeakingUsers: Record<string, boolean> = {};

      analysers.forEach((analyser, uid) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate a more sensitive volume metric
        let maxVolume = 0;
        for (let i = 0; i < dataArray.length; i++) {
          if (dataArray[i] > maxVolume) {
            maxVolume = dataArray[i];
          }
        }
        
        // maxVolume goes from 0 to 255.
        const isSpeaking = maxVolume > voiceSettings.micSensitivity; 
        newSpeakingUsers[uid] = isSpeaking;
      });

      if (Object.keys(newSpeakingUsers).length > 0) {
        // Optional: console.log("Speaking states:", newSpeakingUsers);
      }

      setSpeakingUsers(prev => {
        let hasChanges = false;
        for (const uid in newSpeakingUsers) {
          if (prev[uid] !== newSpeakingUsers[uid]) {
            hasChanges = true;
            break;
          }
        }
        for (const uid in prev) {
          if (newSpeakingUsers[uid] === undefined) {
            hasChanges = true;
            break;
          }
        }
        return hasChanges ? newSpeakingUsers : prev;
      });

      animationFrameRef.current = requestAnimationFrame(checkSpeaking);
    };

    // Always start a new loop and cancel the old one to avoid stale closures
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    checkSpeaking();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(console.error);
        }
        audioContextRef.current = null;
      }
      analysersRef.current.clear();
      setSpeakingUsers({});
    };
  }, [connectedVoiceChannelId, remoteStreams, localStream, setSpeakingUsers]);

  // Handle peer connections based on store participants
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    
    const uids = voiceParticipants.map(p => p.id);
    const myUid = currentUser.id;
    
    uids.forEach(uid => {
      if (uid !== myUid && !peersRef.current.has(uid)) {
        // We don't have a peer connection yet, but we see them in the room.
        // The main init() effect will create the peer connection when it runs,
        // but if they joined after us, we need to ping them.
        socket.emit('signal', {
          to: uid,
          from: myUid,
          type: 'ping',
          channelId: connectedVoiceChannelId,
          sessionId: localStreamIdRef.current
        });
      }
    });

    const currentUids = new Set(uids);
    peersRef.current.forEach((pc, uid) => {
      if (!currentUids.has(uid)) {
        pc.close();
        peersRef.current.delete(uid);
        remoteStreamIdsRef.current.delete(uid);
        makingOfferRef.current.delete(uid);
        ignoreOfferRef.current.delete(uid);
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.delete(uid);
          return newMap;
        });
      }
    });
  }, [voiceParticipants, connectedVoiceChannelId, currentUser]);

  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;

    let isMounted = true;
    const myUid = currentUser.id;
    const channelId = connectedVoiceChannelId;

    const servers = {
      iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        { urls: ['stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
        { urls: ['stun:stun.services.mozilla.com'] }
      ]
    };

    const cleanupPeer = (uid: string) => {
      const pc = peersRef.current.get(uid);
      if (pc) {
        pc.onnegotiationneeded = null;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
        peersRef.current.delete(uid);
        makingOfferRef.current.delete(uid);
        ignoreOfferRef.current.delete(uid);
        iceQueueRef.current.delete(uid);
        remoteStreamIdsRef.current.delete(uid);
      }
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.delete(uid);
        return newMap;
      });
      setRemoteScreenShares(prev => {
        const newMap = { ...prev };
        delete newMap[uid];
        return newMap;
      });
      useAppStore.getState().setViewingScreenShares(prev => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
      if (useAppStore.getState().activeStreamFocus === uid) {
        useAppStore.getState().setActiveStreamFocus(null);
      }
    };

    const createPeerConnection = (remoteUid: string) => {
      if (peersRef.current.has(remoteUid)) return peersRef.current.get(remoteUid)!;

      const pc = new RTCPeerConnection(servers);
      peersRef.current.set(remoteUid, pc);
      makingOfferRef.current.set(remoteUid, false);
      ignoreOfferRef.current.set(remoteUid, false);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }
      
      if (localScreenShareStreamRef.current) {
        localScreenShareStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localScreenShareStreamRef.current!);
        });
      }

      pc.onnegotiationneeded = async () => {
        if (makingOfferRef.current.get(remoteUid)) return;
        try {
          makingOfferRef.current.set(remoteUid, true);
          await pc.setLocalDescription();
          if (pc.localDescription) {
            socket.emit('signal', {
              from: myUid,
              to: remoteUid,
              channelId: channelId,
              sessionId: localStreamIdRef.current,
              type: 'offer',
              offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
            });
          }
        } catch (err) {
          console.error("Error during negotiation", err);
        } finally {
          makingOfferRef.current.set(remoteUid, false);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal', {
            from: myUid,
            to: remoteUid,
            channelId: channelId,
            sessionId: localStreamIdRef.current,
            type: 'ice',
            candidate: event.candidate.toJSON()
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        
        const handleStreamUpdate = () => {
          const hasVideo = stream.getVideoTracks().length > 0;
          
          if (hasVideo) {
            setRemoteScreenShares(prev => {
              if (prev[remoteUid] === stream) return prev;
              return {
                ...prev,
                [remoteUid]: stream
              };
            });
            
            stream.onremovetrack = () => {
              if (stream.getVideoTracks().length === 0) {
                setRemoteScreenShares(prev => {
                  if (!prev[remoteUid]) return prev;
                  const newMap = { ...prev };
                  delete newMap[remoteUid];
                  return newMap;
                });
                useAppStore.getState().setViewingScreenShares(prev => {
                  if (!prev.has(remoteUid)) return prev;
                  const next = new Set(prev);
                  next.delete(remoteUid);
                  return next;
                });
                if (useAppStore.getState().activeStreamFocus === remoteUid) {
                  useAppStore.getState().setActiveStreamFocus(null);
                }
              }
            };
          } else {
            setRemoteStreams(prev => {
              if (prev.get(remoteUid) === stream) return prev;
              const newMap = new Map(prev);
              newMap.set(remoteUid, stream);
              return newMap;
            });
          }
        };

        // Initial check
        handleStreamUpdate();
        
        // Also check after a short delay because tracks might arrive slightly staggered
        setTimeout(handleStreamUpdate, 100);
        setTimeout(handleStreamUpdate, 500);

        stream.onaddtrack = handleStreamUpdate;
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupPeer(remoteUid);
        }
      };

      return pc;
    };

    const init = async () => {
      const sessionId = Math.random().toString(36).substring(2, 15);
      localStreamIdRef.current = sessionId;

      let stream: MediaStream | null = null;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          // Reuse existing active stream if available to prevent "blinks"
          if (localStreamRef.current && localStreamRef.current.active) {
            stream = localStreamRef.current;
            console.log("WebRTCManager: Reusing existing active localStream");
          } else {
            const constraints: MediaStreamConstraints = {
              audio: {
                echoCancellation: voiceSettings.echoCancellation,
                noiseSuppression: voiceSettings.noiseSuppression,
                autoGainControl: voiceSettings.autoGainControl,
                ...(voiceSettings.selectedMicrophoneId ? { deviceId: { exact: voiceSettings.selectedMicrophoneId } } : {})
              },
              video: false
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
          }
        } else {
          console.warn("navigator.mediaDevices.getUserMedia is not supported in this browser.");
        }
      } catch (e) {
        console.error("Microphone access denied or not available", e);
      }
      
      if (!isMounted) {
        if (stream) stream.getTracks().forEach(t => t.stop());
        return;
      }
      
      if (stream) {
        localStreamRef.current = stream;
        setLocalStream(stream);
        // Apply initial mute state
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !isVoiceMuted;
        }
      }

      // Fetch user profile from profiles table
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', myUid).maybeSingle();
      if (!isMounted) return;

      // Join socket room
      socket.emit('join-channel', channelId);

      // Add self to voice_participants via socket
      socket.emit('join-voice-channel', {
        channelId,
        user: {
          id: myUid,
          name: profile?.username || profile?.display_name || 'Utilisateur',
          avatarUrl: profile?.avatar_url,
          isMuted: isVoiceMuted || !stream,
          isStreaming: isScreenSharing,
          joinedAt: new Date().toISOString()
        }
      });

      if (!isMounted) {
        socket.emit('leave-voice-channel', { channelId, userId: myUid });
        return;
      }

      // Create peer connections for existing participants
      const currentParticipants = useAppStore.getState().voiceParticipants[channelId] || [];
      currentParticipants.forEach(p => {
        if (p.id !== myUid) {
          createPeerConnection(p.id);
        }
      });

      // Listen to signaling via Socket.io
      const handleSignal = async (data: any) => {
        if (data.to !== myUid || data.channelId !== channelId) return;

        const fromUid = data.from;
        const incomingSessionId = data.sessionId;
        
        let pc = peersRef.current.get(fromUid);
        const currentSessionId = remoteStreamIdsRef.current.get(fromUid);

        // If we receive an offer with a new session ID, the peer restarted.
        if (data.type === 'offer' && incomingSessionId && currentSessionId && incomingSessionId !== currentSessionId) {
          cleanupPeer(fromUid);
          pc = undefined;
          iceQueueRef.current.delete(fromUid);
        }

        // If we receive a message for an old session, ignore it.
        if (incomingSessionId && currentSessionId && incomingSessionId !== currentSessionId && data.type !== 'offer') {
          return;
        }

        if (!pc) {
          // If it's an answer for a non-existent PC, ignore it. 
          if (data.type === 'answer') {
            return;
          }
          pc = createPeerConnection(fromUid);
          if (incomingSessionId) {
            remoteStreamIdsRef.current.set(fromUid, incomingSessionId);
          }
        }

        if (data.type === 'ping') {
          if (incomingSessionId) {
            remoteStreamIdsRef.current.set(fromUid, incomingSessionId);
          }
          // The other peer just joined and is pinging us to start the connection.
          // Since we already called createPeerConnection, we need to trigger negotiation
          // if it hasn't started yet.
          if (pc.signalingState === 'stable') {
            try {
              makingOfferRef.current.set(fromUid, true);
              await pc.setLocalDescription();
              if (pc.localDescription) {
                socket.emit('signal', {
                  from: myUid,
                  to: fromUid,
                  channelId: channelId,
                  sessionId: localStreamIdRef.current,
                  type: 'offer',
                  offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
                });
              }
            } catch (err) {
              console.error("Error during ping negotiation", err);
            } finally {
              makingOfferRef.current.set(fromUid, false);
            }
          }
          return;
        }

        try {
          if (data.type === 'offer') {
            const offerCollision = makingOfferRef.current.get(fromUid) || pc.signalingState !== 'stable';
            const polite = myUid > fromUid;
            if (offerCollision && !polite) {
              ignoreOfferRef.current.set(fromUid, true);
              return;
            }
            ignoreOfferRef.current.set(fromUid, false);
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            await pc.setLocalDescription();
            socket.emit('signal', {
              from: myUid,
              to: fromUid,
              channelId: channelId,
              sessionId: localStreamIdRef.current,
              type: 'answer',
              answer: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp }
            });
            
            // Process queued ICE candidates
            const queue = iceQueueRef.current.get(fromUid) || [];
            for (const candidate of queue) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e: any) {
                if (e.message && e.message.includes('Unknown ufrag')) {
                  // Ignore stale candidates
                } else {
                  console.error("Error adding queued ice candidate", e);
                }
              }
            }
            iceQueueRef.current.set(fromUid, []);
          } else if (data.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
              
              // Process queued ICE candidates
              const queue = iceQueueRef.current.get(fromUid) || [];
              for (const candidate of queue) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e: any) {
                  if (e.message && e.message.includes('Unknown ufrag')) {
                    // Ignore stale candidates
                  } else {
                    console.error("Error adding queued ice candidate", e);
                  }
                }
              }
              iceQueueRef.current.set(fromUid, []);
            } else {
              console.warn(`Ignoring answer in state ${pc.signalingState}`);
            }
          } else if (data.type === 'ice') {
            try {
              if (data.candidate) {
                if (pc.remoteDescription) {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                  const queue = iceQueueRef.current.get(fromUid) || [];
                  queue.push(data.candidate);
                  iceQueueRef.current.set(fromUid, queue);
                }
              }
            } catch (err: any) {
              if (!ignoreOfferRef.current.get(fromUid)) {
                if (err.message && err.message.includes('Unknown ufrag')) {
                  // Ignore stale candidates
                } else {
                  console.error("Error adding ice candidate", err);
                }
              }
            }
          }
        } catch (err) {
          console.error("Error processing signaling data", err);
        }
      };

      socket.on('signal', handleSignal);

      const handleReconnect = () => {
        const state = useAppStore.getState();
        socket.emit('join-channel', channelId);
        socket.emit('join-voice-channel', {
          channelId,
          user: {
            id: myUid,
            name: profile?.username || profile?.display_name || 'Utilisateur',
            avatarUrl: profile?.avatar_url,
            isMuted: state.isVoiceMuted || !localStreamRef.current,
            isStreaming: state.isScreenSharing,
            joinedAt: new Date().toISOString()
          }
        });
      };
      socket.on('connect', handleReconnect);

      // Handle window close
      const handleBeforeUnload = () => {
        socket.emit('leave-voice-channel', { channelId, userId: myUid });
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        socket.off('signal', handleSignal);
        socket.off('connect', handleReconnect);
        socket.emit('leave-voice-channel', { channelId, userId: myUid });
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    };

    let cleanupFns: any = null;
    init().then(cleanup => {
      if (!isMounted && cleanup) {
        cleanup();
      } else {
        cleanupFns = cleanup;
      }
    });

    return () => {
      isMounted = false;
      if (cleanupFns) cleanupFns();
      
      const currentState = useAppStore.getState();
      const isLeavingChannel = !currentState.connectedVoiceChannelId || currentState.connectedVoiceChannelId !== channelId;
      const isLoggedOut = !useAuthStore.getState().user;

      if (isLeavingChannel || isLoggedOut) {
        console.log("WebRTCManager: Cleaning up media tracks (leaving channel or logged out)");
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
          setLocalStream(null);
        }
        
        if (localScreenShareStreamRef.current) {
          localScreenShareStreamRef.current.getTracks().forEach(t => t.stop());
          localScreenShareStreamRef.current = null;
          setLocalScreenShareStream(null);
          setIsScreenSharing(false);
        }
      } else {
        console.log("WebRTCManager: Component re-mount, preserving media tracks");
      }
      
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      remoteStreamIdsRef.current.clear();
      makingOfferRef.current.clear();
      ignoreOfferRef.current.clear();
      setRemoteStreams(new Map());
      setRemoteScreenShares({});
      setViewingScreenShares(new Set());
      setActiveStreamFocus(null);
      
      if (isLeavingChannel || isLoggedOut) {
        socket.emit('leave-voice-channel', { channelId, userId: myUid });
      }
    };
  }, [connectedVoiceChannelId, currentUser]);

  // Sync viewingScreenShares to Socket
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    const myUid = currentUser.id;
    
    socket.emit('voice-state-update', {
      channelId: connectedVoiceChannelId,
      userId: myUid,
      updates: { viewingStreams: Array.from(viewingScreenShares) }
    });
  }, [viewingScreenShares, connectedVoiceChannelId, currentUser]);

  // Sync isScreenSharing to Socket
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    const myUid = currentUser.id;
    
    socket.emit('voice-state-update', {
      channelId: connectedVoiceChannelId,
      userId: myUid,
      updates: { isStreaming: isScreenSharing }
    });
  }, [isScreenSharing, connectedVoiceChannelId, currentUser]);

  return (
    <>
      {Array.from(remoteStreams.entries()).map(([uid, stream]) => (
        <AudioPlayer key={uid} stream={stream} />
      ))}
    </>
  );
}
