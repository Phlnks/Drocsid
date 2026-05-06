import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { playConnectSound, playDisconnectSound, playScreenShareStartSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from '../lib/sounds';
import socket from '../lib/socket';
import { Room, RoomEvent, Participant, RemoteTrackPublication, RemoteTrack, Track, createLocalAudioTrack, LocalTrack, LocalVideoTrack } from 'livekit-client';

function AudioPlayer({ stream }: { key?: any, stream: any }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isDeafened, voiceSettings, voiceVolume, isVoiceVolumeMuted } = useAppStore();
  
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
      audioRef.current.muted = isDeafened || isVoiceVolumeMuted;
    }
  }, [isDeafened, isVoiceVolumeMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = voiceVolume;
    }
  }, [voiceVolume]);

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
  
  const roomRef = useRef<Room | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const prevVoiceParticipantsRef = useRef<any[]>([]);
  const prevVoiceChannelRef = useRef<string | null>(null);
  const voiceParticipantsMap = useAppStore(state => state.voiceParticipants);
  const voiceParticipants = voiceParticipantsMap[connectedVoiceChannelId || ''] || [];

  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // Broadcast sounds for join/leave/screenshare
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) {
      prevVoiceParticipantsRef.current = [];
      prevVoiceChannelRef.current = null;
      return;
    }

    const currentParticipants = voiceParticipants;
    const prevParticipants = prevVoiceParticipantsRef.current;

    if (prevVoiceChannelRef.current === connectedVoiceChannelId && prevParticipants.length > 0) {
      const currentUids = new Set(currentParticipants.map(p => p.id));
      const prevUids = new Set(prevParticipants.map(p => p.id));

      let joined = false;
      let left = false;
      let startedStream = false;

      currentParticipants.forEach(p => {
        if (!prevUids.has(p.id) && p.id !== currentUser.id) joined = true;
      });

      prevParticipants.forEach(p => {
        if (!currentUids.has(p.id) && p.id !== currentUser.id) left = true;
      });

      currentParticipants.forEach(curr => {
        const prev = prevParticipants.find(p => p.id === curr.id);
        if (prev && curr.id !== currentUser.id && curr.isStreaming && !prev.isStreaming) {
          startedStream = true;
        }
      });

      if (joined) playConnectSound();
      if (left && !joined) playDisconnectSound(); 
      if (startedStream) playScreenShareStartSound();
    }

    prevVoiceParticipantsRef.current = currentParticipants;
    prevVoiceChannelRef.current = connectedVoiceChannelId;
  }, [voiceParticipants, connectedVoiceChannelId, currentUser]);

  // Listen for forced voice moves and mutes
  useEffect(() => {
    const handleForceMove = async (data: { channelId: string | null, serverId?: string | null }) => {
      if (data.channelId) {
        try {
          if (data.serverId) {
             setConnectedVoiceChannelId(data.channelId, data.serverId);
          } else {
             const { data: channel } = await supabase.from('channels').select('server_id').eq('id', data.channelId).maybeSingle();
             setConnectedVoiceChannelId(data.channelId, channel?.server_id);
          }
        } catch (e) {
          setConnectedVoiceChannelId(data.channelId);
        }
      } else {
        setConnectedVoiceChannelId(null);
      }
    };

    const handleForceMute = (data: { mute: boolean }) => {
      if (data.mute && !isVoiceMuted) {
        playMuteSound();
        setIsVoiceMuted(true);
      } else if (!data.mute && isVoiceMuted) {
        playUnmuteSound();
        setIsVoiceMuted(false);
      }
    };

    socket.on('force-move', handleForceMove);
    socket.on('force-mute', handleForceMute);
    return () => {
      socket.off('force-move', handleForceMove);
      socket.off('force-mute', handleForceMute);
    };
  }, [setConnectedVoiceChannelId, isVoiceMuted, setIsVoiceMuted]);

  // Handle local mute status on LiveKit
  useEffect(() => {
    if (roomRef.current && roomRef.current.localParticipant) {
      const isMutedNow = isVoiceMuted || isDeafened;
      roomRef.current.localParticipant.setMicrophoneEnabled(!isMutedNow);
    }
    
    if (connectedVoiceChannelId && currentUser) {
      socket.emit('voice-state-update', {
        channelId: connectedVoiceChannelId,
        userId: currentUser.id,
        updates: { 
          isMuted: isVoiceMuted,
          isDeafened: isDeafened
        }
      });
    }
  }, [isVoiceMuted, isDeafened, connectedVoiceChannelId, currentUser]);

  // Apply voice settings (mic sensitivity, echo setup via new track or constraints)
  // Usually in LiveKit you apply these when creating the track. We'll handle this in the main connection effect.

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

  // Handle local screen sharing
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser || !roomRef.current) return;
    
    const updateScreenshare = async () => {
      try {
        const participant = roomRef.current?.localParticipant;
        if (!participant) return;
        
        if (localScreenShareStream) {
          const videoTrack = localScreenShareStream.getVideoTracks()[0];
          if (videoTrack) {
            // LiveKit provides a way to publish an existing track
            const lvt = new LocalVideoTrack(videoTrack, undefined, false);
            await participant.publishTrack(lvt, { name: 'screen', source: Track.Source.ScreenShare });
          }
        } else {
          // Unpublish existing screen tracks
          participant.getTrackPublications().forEach(pub => {
            if (pub.source === Track.Source.ScreenShare) {
              participant.unpublishTrack(pub.track as LocalTrack);
            }
          });
        }
      } catch (e) {
         console.error("Screen share publish error:", e);
      }
    };
    updateScreenshare();
  }, [localScreenShareStream, connectedVoiceChannelId, currentUser]);

  // Sync background stuff, Media Session API
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

      navigator.mediaSession.playbackState = isVoiceMuted ? 'paused' : 'playing';

      try { navigator.mediaSession.setActionHandler('play', () => setIsVoiceMuted(false)); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('pause', () => setIsVoiceMuted(true)); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('stop', () => setConnectedVoiceChannelId(null)); } catch (e) {}
      try {
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          setIsDeafened(!isDeafened);
          if (!isDeafened) playDeafenSound(); else playUndeafenSound();
        });
      } catch (e) {}
      try {
        navigator.mediaSession.setActionHandler('togglemicrophone' as any, () => {
          setIsVoiceMuted(!isVoiceMuted);
          if (!isVoiceMuted) playMuteSound(); else playUnmuteSound();
        });
      } catch (e) {}
      try { navigator.mediaSession.setActionHandler('hangup' as any, () => setConnectedVoiceChannelId(null)); } catch (e) {}
    }

    if (!silentAudioRef.current) {
      const audio = new Audio();
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.loop = true;
      silentAudioRef.current = audio;
    }
    silentAudioRef.current.play().catch(() => {});

  }, [connectedVoiceChannelId, currentUser, isVoiceMuted, isDeafened, setIsVoiceMuted, setIsDeafened, setConnectedVoiceChannelId]);

  // Sync remote streams with participants logic
  useEffect(() => {
    voiceParticipants.forEach(p => {
      const isMe = p.id === currentUser?.id;
      const isStillStreaming = isMe ? isScreenSharing : p.isStreaming;

      if (!isStillStreaming) {
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
  }, [voiceParticipants, currentUser, isScreenSharing, setRemoteScreenShares, setViewingScreenShares, setActiveStreamFocus]);

  // Main LiveKit Connection Loop
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    
    let isMounted = true;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: screenShareQuality.width, height: screenShareQuality.height, frameRate: screenShareQuality.frameRate }
      }
    });
    roomRef.current = room;

    const connectToLiveKit = async () => {
      try {
        const livekitUrl = import.meta.env.VITE_LIVEKIT_URL;
        if (!livekitUrl) {
           console.warn("VITE_LIVEKIT_URL is not set. LiveKit will not connect.");
           return;
        }

        const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || '/api/livekit/token';
        const res = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: connectedVoiceChannelId,
            participantIdentity: currentUser.id,
            participantName: (currentUser as any).user_metadata?.username || 'Utilisateur'
          })
        });

        if (!res.ok) {
           console.error("Failed to fetch LiveKit token. Server responded with:", await res.text());
           return;
        }

        const data = await res.json();
        const token = data.participantToken || data.token;
        
        // Listen to events before connecting
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: Participant) => {
          if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            setRemoteScreenShares(prev => ({ ...prev, [participant.identity]: stream }));
          } else if (track.kind === Track.Kind.Audio) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            setRemoteStreams(prev => {
               const map = new Map(prev);
               map.set(participant.identity, stream);
               return map;
            });
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: Participant) => {
          if (track.kind === Track.Kind.Video) {
            setRemoteScreenShares(prev => {
              const map = { ...prev };
              delete map[participant.identity];
              return map;
            });
            useAppStore.getState().setViewingScreenShares(prev => {
               const next = new Set(prev);
               next.delete(participant.identity);
               return next;
            });
            if (useAppStore.getState().activeStreamFocus === participant.identity) {
               useAppStore.getState().setActiveStreamFocus(null);
            }
          } else if (track.kind === Track.Kind.Audio) {
             setRemoteStreams(prev => {
                const map = new Map(prev);
                map.delete(participant.identity);
                return map;
             });
          }
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const speakingMap: Record<string, boolean> = {};
          speakers.forEach(speaker => {
            speakingMap[speaker.identity] = true;
          });
          setSpeakingUsers(speakingMap);
        });

        await room.connect(livekitUrl, token);
        console.log("Connected to LiveKit Room:", connectedVoiceChannelId);

        // Fetch user profile from profiles table for presence
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

        // Join socket room for presence compatibility 
        socket.emit('join-channel', connectedVoiceChannelId);
        socket.emit('join-voice-channel', {
          channelId: connectedVoiceChannelId,
          user: {
            id: currentUser.id,
            name: profile?.username || profile?.display_name || 'Utilisateur',
            avatarUrl: profile?.avatar_url,
            isMuted: isVoiceMuted,
            isStreaming: isScreenSharing,
            joinedAt: new Date().toISOString()
          }
        });

        // Publish local mic
        try {
          // We respect current voiceSettings for exact device selection
          await room.localParticipant.setMicrophoneEnabled(!isVoiceMuted && !isDeafened, {
             echoCancellation: voiceSettings.echoCancellation,
             noiseSuppression: voiceSettings.noiseSuppression,
             autoGainControl: voiceSettings.autoGainControl,
             deviceId: voiceSettings.selectedMicrophoneId || undefined
          });
        } catch (e) {
          console.error("Could not capture microphone:", e);
        }

      } catch (err) {
        console.error("Error connecting to LiveKit:", err);
      }
    };

    connectToLiveKit();

    const handleBeforeUnload = () => {
      socket.emit('leave-voice-channel', { channelId: connectedVoiceChannelId, userId: currentUser.id });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      const currentState = useAppStore.getState();
      const isCompletelyDisconnecting = !currentState.connectedVoiceChannelId;
      const isLoggedOut = !useAuthStore.getState().user;

      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      
      if (isCompletelyDisconnecting || isLoggedOut) {
        if (localScreenShareStream) {
          localScreenShareStream.getTracks().forEach(t => t.stop());
          setLocalScreenShareStream(null);
          setIsScreenSharing(false);
        }
      }
      
      setRemoteStreams(new Map());
      setRemoteScreenShares({});
      setViewingScreenShares(new Set());
      setActiveStreamFocus(null);
      setSpeakingUsers({});
      
      socket.emit('leave-voice-channel', { channelId: connectedVoiceChannelId, userId: currentUser.id });
    };
  }, [connectedVoiceChannelId, currentUser]);

  // Sync remaining state to socket
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    socket.emit('voice-state-update', {
      channelId: connectedVoiceChannelId,
      userId: currentUser.id,
      updates: { 
        viewingStreams: Array.from(viewingScreenShares),
        isStreaming: isScreenSharing 
      }
    });
  }, [viewingScreenShares, isScreenSharing, connectedVoiceChannelId, currentUser]);

  return (
    <>
      {Array.from(remoteStreams.entries()).map(([uid, stream]) => (
        <AudioPlayer key={uid} stream={stream} />
      ))}
    </>
  );
}
