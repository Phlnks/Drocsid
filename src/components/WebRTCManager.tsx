import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { useInstanceStore } from '../store/instanceStore';
import { playConnectSound, playDisconnectSound, playScreenShareStartSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from '../lib/sounds';
import socket from '../lib/socket';
import { Room, RoomEvent, Participant, RemoteTrackPublication, RemoteTrack, Track, LocalTrack, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';


function AudioPlayer({ stream }: { key?: any, stream: any }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isDeafened, voiceSettings, voiceVolume, isVoiceVolumeMuted } = useAppStore();

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(e => {
        if (e.name !== 'AbortError') console.error("Audio play error:", e);
      });
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isDeafened || isVoiceVolumeMuted;
  }, [isDeafened, isVoiceVolumeMuted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = voiceVolume;
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
  const { getCurrentInstance } = useInstanceStore();
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

  // Refs pour les tracks publiées — vidéo ET audio du screen share
  const publishedScreenTrackRef = useRef<LocalVideoTrack | null>(null);
  const publishedScreenAudioTrackRef = useRef<LocalAudioTrack | null>(null);

  const noiseGateCtxRef = useRef<AudioContext | null>(null);

  const applyNoiseGate = (stream: MediaStream, sensitivity: number): MediaStream => {
    if (noiseGateCtxRef.current) {
      noiseGateCtxRef.current.close();
      noiseGateCtxRef.current = null;
    }
    // sensitivity 0 = très sensible (seuil bas), 100 = moins sensible (seuil haut)
    const gateLevel = sensitivity / 100 * 0.05; // amplitude 0.0 → 0.05

    const ctx = new AudioContext();
    noiseGateCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    const destination = ctx.createMediaStreamDestination();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Float32Array(analyser.fftSize);

    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;

    // Vérifie le volume toutes les 50ms et applique le gate
    const interval = setInterval(() => {
      analyser.getFloatTimeDomainData(dataArray);
      const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / dataArray.length);
      gainNode.gain.setTargetAtTime(rms < gateLevel ? 0 : 1, ctx.currentTime, 0.01);
    }, 50);

    // Stocker l'interval pour le cleanup
    (noiseGateCtxRef.current as any)._interval = interval;

    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(destination);

    return destination.stream;
  };

  const prevVoiceParticipantsRef = useRef<any[]>([]);
  const prevVoiceChannelRef = useRef<string | null>(null);
  const voiceParticipantsMap = useAppStore(state => state.voiceParticipants);
  const voiceParticipants = voiceParticipantsMap[connectedVoiceChannelId || ''] || [];

  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());


  // ─── Broadcast sounds join/leave/screenshare ───────────────────────────────
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
      let joined = false, left = false, startedStream = false;
      currentParticipants.forEach(p => { if (!prevUids.has(p.id) && p.id !== currentUser.id) joined = true; });
      prevParticipants.forEach(p => { if (!currentUids.has(p.id) && p.id !== currentUser.id) left = true; });
      currentParticipants.forEach(curr => {
        const prev = prevParticipants.find(p => p.id === curr.id);
        if (prev && curr.id !== currentUser.id && curr.isStreaming && !prev.isStreaming) startedStream = true;
      });
      if (joined) playConnectSound();
      if (left && !joined) playDisconnectSound();
      if (startedStream) playScreenShareStartSound();
    }
    prevVoiceParticipantsRef.current = currentParticipants;
    prevVoiceChannelRef.current = connectedVoiceChannelId;
  }, [voiceParticipants, connectedVoiceChannelId, currentUser]);


  // ─── Force move / force mute ───────────────────────────────────────────────
  useEffect(() => {
    const handleForceMove = async (data: { channelId: string | null, serverId?: string | null }) => {
      if (data.channelId) {
        try {
          if (data.serverId) { setConnectedVoiceChannelId(data.channelId, data.serverId); }
          else {
            const { data: channel } = await supabase.from('channels').select('server_id').eq('id', data.channelId).maybeSingle();
            setConnectedVoiceChannelId(data.channelId, channel?.server_id);
          }
        } catch (e) { setConnectedVoiceChannelId(data.channelId); }
      } else { setConnectedVoiceChannelId(null); }
    };
    const handleForceMute = (data: { mute: boolean }) => {
      if (data.mute && !isVoiceMuted) { playMuteSound(); setIsVoiceMuted(true); }
      else if (!data.mute && isVoiceMuted) { playUnmuteSound(); setIsVoiceMuted(false); }
    };
    socket.on('force-move', handleForceMove);
    socket.on('force-mute', handleForceMute);
    return () => { socket.off('force-move', handleForceMove); socket.off('force-mute', handleForceMute); };
  }, [setConnectedVoiceChannelId, isVoiceMuted, setIsVoiceMuted]);


  // ─── Mute local mic ────────────────────────────────────────────────────────
  useEffect(() => {
    if (roomRef.current?.localParticipant) {
      roomRef.current.localParticipant.setMicrophoneEnabled(!(isVoiceMuted || isDeafened));
    }
    if (connectedVoiceChannelId && currentUser) {
      socket.emit('voice-state-update', { channelId: connectedVoiceChannelId, userId: currentUser.id, updates: { isMuted: isVoiceMuted, isDeafened } });
    }
  }, [isVoiceMuted, isDeafened, connectedVoiceChannelId, currentUser]);


  // ─── AFK ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId) return;
    const checkChannelAfk = async () => {
      const { data: channel } = await supabase.from('channels').select('name').eq('id', connectedVoiceChannelId).maybeSingle();
      if (channel?.name.endsWith(' [AFK]')) {
        if (!isVoiceMuted) setIsVoiceMuted(true);
        if (!isDeafened) setIsDeafened(true);
      }
    };
    checkChannelAfk();
  }, [connectedVoiceChannelId, isVoiceMuted, isDeafened, setIsVoiceMuted, setIsDeafened]);


  // ─── Screen share publish — vidéo + audio système ─────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser || !roomRef.current) return;

    const updateScreenshare = async () => {
      try {
        const participant = roomRef.current?.localParticipant;
        if (!participant) return;

        if (localScreenShareStream) {
          const videoTrack = localScreenShareStream.getVideoTracks()[0];
          const audioTrack = localScreenShareStream.getAudioTracks()[0];

          // ── Vidéo ──
          if (videoTrack) {
            if (publishedScreenTrackRef.current) {
              try {
                await publishedScreenTrackRef.current.replaceTrack(videoTrack);
                console.log('[WebRTC] Screen video track replaced (hot swap)');
              } catch (e) {
                console.warn('[WebRTC] replaceTrack failed, republishing video:', e);
                await participant.unpublishTrack(publishedScreenTrackRef.current);
                publishedScreenTrackRef.current = null;
                const lvt = new LocalVideoTrack(videoTrack, undefined, false);
                await participant.publishTrack(lvt, {
                  name: 'screen',
                  source: Track.Source.ScreenShare,
                  // ✅ Piste 1 — pas de simulcast : un seul flux, pas 3 résolutions en parallèle
                  simulcast: false,
                  // ✅ Piste 4 — encodage limité : pas besoin de plus pour un screen share
                  videoEncoding: {
                    maxBitrate: 3_000_000,   // 3 Mbps — suffisant pour 1080p/1440p screen share
                    maxFramerate: 30,
                    priority: 'high'
                  }
                });
                publishedScreenTrackRef.current = lvt;
                (useAppStore.getState() as any).publishedScreenTrack = lvt;
              }
            } else {
              const lvt = new LocalVideoTrack(videoTrack, undefined, false);
              await participant.publishTrack(lvt, {
                name: 'screen',
                source: Track.Source.ScreenShare,
                // ✅ Piste 1 — désactiver le simulcast pour le screen share
                // Le simulcast publie 2-3 résolutions en parallèle → RAM/CPU inutile à 2-3 personnes
                simulcast: false,
                // ✅ Piste 4 — limiter l'encodage
                // Évite que LiveKit encode en 4K ou à 60fps sans limite
                videoEncoding: {
                  maxBitrate: 3_000_000,   // 3 Mbps
                  maxFramerate: 60,
                  priority: 'high'
                }
              });
              publishedScreenTrackRef.current = lvt;
              (useAppStore.getState() as any).publishedScreenTrack = lvt;
              console.log('[WebRTC] Screen video track published (no simulcast, H.264 preferred, 3Mbps max)');
            }
          }

          // ── Audio système ──
          if (audioTrack) {
            if (!publishedScreenAudioTrackRef.current) {
              try {
                const lat = new LocalAudioTrack(audioTrack, undefined, false);
                await participant.publishTrack(lat, {
                  name: 'screen-audio',
                  source: Track.Source.ScreenShareAudio
                });
                publishedScreenAudioTrackRef.current = lat;
                console.log('[WebRTC] Screen audio track published');
              } catch (e) {
                console.warn('[WebRTC] Screen audio publish failed:', e);
              }
            }
          } else {
            if (publishedScreenAudioTrackRef.current) {
              try {
                await participant.unpublishTrack(publishedScreenAudioTrackRef.current);
                publishedScreenAudioTrackRef.current = null;
                console.log('[WebRTC] Screen audio unpublished (no audio in stream)');
              } catch (e) {
                console.warn('[WebRTC] Screen audio unpublish failed:', e);
              }
            }
          }

        } else {
          // ── Arrêt du partage ──
          if (publishedScreenTrackRef.current) {
            participant.getTrackPublications().forEach(pub => {
              if (pub.source === Track.Source.ScreenShare) participant.unpublishTrack(pub.track as LocalTrack);
            });
            publishedScreenTrackRef.current = null;
            (useAppStore.getState() as any).publishedScreenTrack = null;
            console.log('[WebRTC] Screen video track unpublished');
          }
          if (publishedScreenAudioTrackRef.current) {
            try {
              await participant.unpublishTrack(publishedScreenAudioTrackRef.current);
              publishedScreenAudioTrackRef.current = null;
              console.log('[WebRTC] Screen audio track unpublished');
            } catch (e) {
              console.warn('[WebRTC] Screen audio unpublish failed:', e);
            }
          }
        }
      } catch (e) {
        console.error('[WebRTC] Screen share publish error:', e);
      }
    };

    updateScreenshare();
  }, [localScreenShareStream, connectedVoiceChannelId, currentUser]);


  // ─── Media Session API ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
      if (silentAudioRef.current) silentAudioRef.current.pause();
      return;
    }
    if ('mediaSession' in navigator) {
      const status = [isVoiceMuted ? 'Micro : OFF' : 'Micro : ON', isDeafened ? 'Sourdine : ON' : 'Sourdine : OFF'].join(' | ');
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Conversation Vocale', artist: 'Drocsid', album: status, artwork: [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }] });
      navigator.mediaSession.playbackState = isVoiceMuted ? 'paused' : 'playing';
      try { navigator.mediaSession.setActionHandler('play', () => setIsVoiceMuted(false)); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('pause', () => setIsVoiceMuted(true)); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('stop', () => setConnectedVoiceChannelId(null)); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('previoustrack', () => { setIsDeafened(!isDeafened); if (!isDeafened) playDeafenSound(); else playUndeafenSound(); }); } catch (e) {}
      try { navigator.mediaSession.setActionHandler('togglemicrophone' as any, () => { setIsVoiceMuted(!isVoiceMuted); if (!isVoiceMuted) playMuteSound(); else playUnmuteSound(); }); } catch (e) {}
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


  // ─── Sync remote streams / participants ────────────────────────────────────
  useEffect(() => {
    voiceParticipants.forEach(p => {
      const isMe = p.id === currentUser?.id;
      const isStillStreaming = isMe ? isScreenSharing : p.isStreaming;
      if (!isStillStreaming) {
        setRemoteScreenShares(prev => { if (!prev[p.id]) return prev; const m = { ...prev }; delete m[p.id]; return m; });
        setViewingScreenShares(prev => { if (!prev.has(p.id)) return prev; const n = new Set(prev); n.delete(p.id); return n; });
        if (useAppStore.getState().activeStreamFocus === p.id) setActiveStreamFocus(null);
      }
    });
  }, [voiceParticipants, currentUser, isScreenSharing, setRemoteScreenShares, setViewingScreenShares, setActiveStreamFocus]);


  // ─── Écouter TrackMuted/TrackUnmuted LiveKit côté spectateurs ─────────────
  useEffect(() => {
    if (!roomRef.current) return;
    const handleTrackSubscribed = (track: RemoteTrack, publication: RemoteTrackPublication, participant: Participant) => {
      if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
        const mediaTrack = track.mediaStreamTrack;
        const handleMute = () => console.log(`[WebRTC] Remote screen muted for ${participant.identity}`);
        const handleUnmute = () => console.log(`[WebRTC] Remote screen unmuted for ${participant.identity}`);
        mediaTrack.addEventListener('mute', handleMute);
        mediaTrack.addEventListener('unmute', handleUnmute);
        track.once('ended', () => {
          mediaTrack.removeEventListener('mute', handleMute);
          mediaTrack.removeEventListener('unmute', handleUnmute);
        });
      }
    };
    roomRef.current.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    return () => { roomRef.current?.off(RoomEvent.TrackSubscribed, handleTrackSubscribed); };
  }, [connectedVoiceChannelId]);


  // ─── Main LiveKit Connection Loop ─────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;

    let isMounted = true;
    const room = new Room({
      adaptiveStream: true,
      // ✅ dynacast: true — ajuste dynamiquement la qualité selon le nombre de spectateurs
      // Compatible avec simulcast: false car dynacast agit sur la couche d'encodage, pas les flux
      dynacast: true,
      videoCaptureDefaults: screenShareQuality ? {
        resolution: {
          width: screenShareQuality.width,
          height: screenShareQuality.height,
          frameRate: screenShareQuality.frameRate
        }
      } : undefined,
      // ✅ Piste 4 — Forcer H.264 comme codec vidéo préféré
      // H.264 est accéléré matériellement par Intel Quick Sync, NVIDIA NVENC, AMD VCE
      // → divise par 3-5 la charge CPU/RAM de l'encodage et du décodage vs VP8/VP9 logiciel
      // Si le navigateur ou la carte graphique ne supporte pas H.264, LiveKit bascule sur VP8
      publishDefaults: {
        videoCodec: 'h264',
        screenShareEncoding: {
          maxBitrate: 3_000_000,
          maxFramerate: 30,
          priority: 'high'
        },
        // ✅ AJOUTER — protection contre les pertes de paquets réseau
        audioPreset: {
          maxBitrate: 32_000,     // 32 kbps — suffisant pour voix claire
          priority: 'high',
        },
        red: true,               // Redundant Encoding — copie chaque paquet dans le suivant
        dtx: true,               // Discontinuous Transmission — silence = 0 bande passante
        stopMicTrackOnMute: true // Libère la ressource micro quand muté
      }
    });
    roomRef.current = room;

    const connectToLiveKit = async () => {
      try {
        const currentInstance = getCurrentInstance();
        const livekitUrl = currentInstance?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
        if (!livekitUrl) { console.warn("VITE_LIVEKIT_URL is not set."); return; }

        const tokenEndpoint = currentInstance?.livekitTokenEndpoint || import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || '/api/livekit/token';
        const res = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: connectedVoiceChannelId,
            participantIdentity: currentUser.id,
            participantName: (currentUser as any).user_metadata?.username || 'Utilisateur'
          })
        });
        if (!res.ok) { console.error("Failed to fetch LiveKit token:", await res.text()); return; }

        const data = await res.json();
        const token = data.participantToken || data.token;

        // ── Réception des tracks distantes ──
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: Participant) => {
          
          if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
            // ✅ Toujours créer un nouveau MediaStream pour forcer le re-render du VideoPlayer
            // Récupérer les éventuelles audio tracks déjà présentes dans l'ancien stream
            const existing = useAppStore.getState().remoteScreenShares[participant.identity];
            const audioTracks = existing ? existing.getAudioTracks() : [];
            const stream = new MediaStream([track.mediaStreamTrack, ...audioTracks]);
            setRemoteScreenShares(prev => ({ ...prev, [participant.identity]: stream }));

          } else if (track.kind === Track.Kind.Audio && track.source === Track.Source.ScreenShareAudio) {
            const existing = useAppStore.getState().remoteScreenShares[participant.identity];
            if (existing) {
              // ✅ Nouveau MediaStream avec vidéo + audio pour forcer le re-render
              const videoTracks = existing.getVideoTracks();
              const stream = new MediaStream([...videoTracks, track.mediaStreamTrack]);
              setRemoteScreenShares(prev => ({ ...prev, [participant.identity]: stream }));
            } else {
              // Audio arrivé avant la vidéo — stocker temporairement
              const stream = new MediaStream([track.mediaStreamTrack]);
              setRemoteScreenShares(prev => ({ ...prev, [participant.identity]: stream }));
            
            }
            console.log(`[WebRTC] Screen share audio merged into video stream for ${participant.identity}`);

          } else if (track.kind === Track.Kind.Audio) {
            // Micro normal
            const stream = new MediaStream([track.mediaStreamTrack]);
            setRemoteStreams(prev => { const map = new Map(prev); map.set(participant.identity, stream); return map; });
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: Participant) => {
          if (track.kind === Track.Kind.Video) {
            setRemoteScreenShares(prev => { const map = { ...prev }; delete map[participant.identity]; return map; });
            useAppStore.getState().setViewingScreenShares(prev => { const next = new Set(prev); next.delete(participant.identity); return next; });
            if (useAppStore.getState().activeStreamFocus === participant.identity) useAppStore.getState().setActiveStreamFocus(null);

          } else if (track.kind === Track.Kind.Audio && track.source === Track.Source.ScreenShareAudio) {
            // ✅ Retirer la track audio du stream vidéo combiné
            const existing = useAppStore.getState().remoteScreenShares[participant.identity];
            if (existing) {
              existing.removeTrack(track.mediaStreamTrack);
              setRemoteScreenShares(prev => ({ ...prev, [participant.identity]: existing }));
            }

          } else if (track.kind === Track.Kind.Audio) {
            setRemoteStreams(prev => { const map = new Map(prev); map.delete(participant.identity); return map; });
          }
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const speakingMap: Record<string, boolean> = {};
          speakers.forEach(speaker => { speakingMap[speaker.identity] = true; });
          setSpeakingUsers(speakingMap);
        });

        await room.connect(livekitUrl, token);
        console.log('[WebRTC] Connected to LiveKit Room:', connectedVoiceChannelId);

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
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

        try {
          // Capturer le micro brut
          const rawMicStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: voiceSettings.echoCancellation,
              noiseSuppression: voiceSettings.noiseSuppression,
              autoGainControl: voiceSettings.autoGainControl,
              deviceId: voiceSettings.selectedMicrophoneId || undefined
            }
          });

          // ✅ Appliquer le noise gate si sensibilité > 0
          const micStream = voiceSettings.micSensitivity > 0
            ? applyNoiseGate(rawMicStream, voiceSettings.micSensitivity)
            : rawMicStream;

          if (!isVoiceMuted && !isDeafened) {
            const audioTrack = micStream.getAudioTracks()[0];
            if (audioTrack) {
              await room.localParticipant.publishTrack(audioTrack, {
                source: Track.Source.Microphone,
                red: true,
                dtx: true,
              });
            }
          }
        } catch (e) { console.error("Could not capture microphone:", e); }

      } catch (err) { console.error("Error connecting to LiveKit:", err); }
    };

    connectToLiveKit();

    const handleBeforeUnload = () => { socket.emit('leave-voice-channel', { channelId: connectedVoiceChannelId, userId: currentUser.id }); };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);

      publishedScreenTrackRef.current = null;
      publishedScreenAudioTrackRef.current = null;
      (useAppStore.getState() as any).publishedScreenTrack = null;

      const currentState = useAppStore.getState();
      const isCompletelyDisconnecting = !currentState.connectedVoiceChannelId;
      const isLoggedOut = !useAuthStore.getState().user;

      // ✅ Nettoyer le noise gate
      if (noiseGateCtxRef.current) {
        clearInterval((noiseGateCtxRef.current as any)._interval);
        noiseGateCtxRef.current.close();
        noiseGateCtxRef.current = null;
      }

      if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null; }

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


  // ─── Sync socket ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    socket.emit('voice-state-update', {
      channelId: connectedVoiceChannelId,
      userId: currentUser.id,
      updates: { viewingStreams: Array.from(viewingScreenShares), isStreaming: isScreenSharing }
    });
  }, [viewingScreenShares, isScreenSharing, connectedVoiceChannelId, currentUser]);


  return (
    <>
      {/* Joue tous les flux audio : micros distants + audio système des screen shares */}
      {Array.from(remoteStreams.entries()).map(([uid, stream]) => (
        <AudioPlayer key={uid} stream={stream} />
      ))}
    </>
  );
}
