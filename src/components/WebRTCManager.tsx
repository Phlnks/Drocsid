import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { useInstanceStore } from '../store/instanceStore';
import { playConnectSound, playDisconnectSound, playScreenShareStartSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound, playCallJoinedSound, stopRingtone } from '../lib/sounds';
import socket from '../lib/socket';
import { Room, RoomEvent, Participant, RemoteTrackPublication, RemoteTrack, Track, LocalTrack, LocalVideoTrack, LocalAudioTrack } from 'livekit-client';
import { createPeerAudioChain, destroyPeerAudioChain, setPeerGain, destroyAllPeerAudioChains } from '../lib/audioManager';


function AudioPlayer({ userId, stream }: { userId: string, stream: any }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isDeafened, voiceSettings, voiceVolume, isVoiceVolumeMuted, peerVolumes } = useAppStore();
  const userPeerVolume = peerVolumes[userId] ?? 1.0;

  // Créer la chaîne GainNode quand le stream change
  useEffect(() => {
    if (!audioRef.current || !stream) return;
    console.warn('[AP 5] 🔊 AudioPlayer mount | userId:', userId, '| tracks:', stream.getTracks().length, '| readyState:', stream.getTracks()[0]?.readyState);

    const processedStream = createPeerAudioChain(userId, stream, userPeerVolume);
    audioRef.current.srcObject = processedStream;
    audioRef.current.play().catch(e => {
      if (e.name !== 'AbortError') console.error("Audio play error:", e);
    });
    console.warn('[AP 6] audio element state | muted:', audioRef.current.muted, '| volume:', audioRef.current.volume, '| paused:', audioRef.current.paused);

    return () => {
      console.warn('[AP 5b] 🔇 AudioPlayer unmount | userId:', userId);  
      destroyPeerAudioChain(userId);
      if (audioRef.current) audioRef.current.srcObject = null;
    };
  }, [stream, userId]);

  // Volume global → sur l'élément HTML (0.0-1.0, safe)
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = Math.max(0, Math.min(1.0, voiceVolume));
  }, [voiceVolume]);

  // Volume individuel → sur le GainNode (peut dépasser 1.0)
  useEffect(() => {
    setPeerGain(userId, userPeerVolume);
  }, [userPeerVolume, userId]);

  // Mute (deafen ou mute global)
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isDeafened || isVoiceVolumeMuted;
  }, [isDeafened, isVoiceVolumeMuted]);

  // Sortie audio (sinkId)
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
  const rawMicStreamRef = useRef<MediaStream | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  // Ajoute ce ref en haut de WebRTCManager (avec les autres refs)
  const prevTrayStateRef = useRef({ isSpeaking: false });

  const startLocalSpeakingAnalysis = () => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    if (!localAnalyserRef.current || !currentUser?.id) return;

    const analyser = localAnalyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const checkVolume = () => {
      if (!localAnalyserRef.current) return;
      
      const isMuted = useAppStore.getState().isVoiceMuted || useAppStore.getState().isDeafened;
      
      if (isMuted) {
        const userId = currentUser.id;
        document.querySelectorAll(`.avatar-user-${userId}`).forEach(el => {
          el.classList.remove('speaking-ring');
          el.classList.add('ring-transparent');
        });
        document.querySelectorAll(`.text-user-${userId}`).forEach(el => {
          el.classList.remove('text-zinc-100');
          if (el.classList.contains('text-base')) {
            el.classList.add('text-zinc-400');
          } else {
            el.classList.add('text-zinc-300');
          }
        });

        // ← AJOUTER : reset speaking dans le tray quand muted
        if (prevTrayStateRef.current.isSpeaking) {
          prevTrayStateRef.current.isSpeaking = false;
          const s = useAppStore.getState();
          (window as any).electron?.updateTray?.({
            inVoice: true,
            isMuted: s.isVoiceMuted,
            isDeafened: s.isDeafened,
            isSpeaking: false,
          });
        }

        rafIdRef.current = requestAnimationFrame(checkVolume);
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      // Threshold matching the NoiseGate level roughly
      const isSpeaking = average > 15; 
      
      const userId = currentUser.id;
      const avatarElements = document.querySelectorAll(`.avatar-user-${userId}`);
      const textElements = document.querySelectorAll(`.text-user-${userId}`);

      if (isSpeaking) {
        avatarElements.forEach(el => {
          el.classList.remove('ring-transparent');
          el.classList.add('speaking-ring');
        });
        textElements.forEach(el => {
          el.classList.remove('text-zinc-400', 'text-zinc-300');
          el.classList.add('text-zinc-100');
        });
      } else {
        // We only remove if LiveKit didn't also say we're speaking (to avoid flickering)
        // But local rAF is much faster, so it's better to just manage it here for local
        avatarElements.forEach(el => {
          el.classList.remove('speaking-ring');
          el.classList.add('ring-transparent');
        });
        textElements.forEach(el => {
          el.classList.remove('text-zinc-100');
          if (el.classList.contains('text-base')) {
            el.classList.add('text-zinc-400');
          } else {
             el.classList.add('text-zinc-300');
          }
        });
      }

      if (isSpeaking !== prevTrayStateRef.current.isSpeaking) {
        prevTrayStateRef.current.isSpeaking = isSpeaking;
        const s = useAppStore.getState();
        (window as any).electron?.updateTray?.({
          inVoice: true,
          isMuted: s.isVoiceMuted,
          isDeafened: s.isDeafened,
          isSpeaking,
        });
      }
      rafIdRef.current = requestAnimationFrame(checkVolume);
    };

    rafIdRef.current = requestAnimationFrame(checkVolume);
  };

  const setupLocalAnalyser = async (stream: MediaStream) => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    
    // Create AudioContext if not exists (needed for Analyser even if no NoiseGate)
    if (!noiseGateCtxRef.current) {
      noiseGateCtxRef.current = new AudioContext();
    }
    
    const ctx = noiseGateCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const source = ctx.createMediaStreamSource(stream);
    
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    localAnalyserRef.current = analyser;
    
    startLocalSpeakingAnalysis();
  };

  const applyNoiseGate = async (stream: MediaStream, sensitivity: number): Promise<MediaStream> => {
    // Only close if we are switching sensitivity? Actually, we can reuse the context.
    // If sensitivity is changed, we might need a new WorkletNode but can stay in same context.
    
    // For simplicity and to avoid node buildup, let's keep the close logic but ensure analyser is handled
    if (noiseGateCtxRef.current) {
      noiseGateCtxRef.current.close().catch(() => {});
      noiseGateCtxRef.current = null;
    }
    
    // sensitivity 0 = très sensible (seuil bas), 100 = moins sensible (seuil haut)
    const gateLevel = (sensitivity / 100) * 0.05; 

    const ctx = new AudioContext();
    noiseGateCtxRef.current = ctx;
    // 👇 OBLIGATOIRE — le contexte démarre suspendu sans interaction utilisateur
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createMediaStreamSource(stream);
    const destination = ctx.createMediaStreamDestination();

    // Re-setup analyser here as well since node was closed
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    localAnalyserRef.current = analyser;
    startLocalSpeakingAnalysis();

    const noiseGateWorkletCode = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gateLevel = 0.0;
    this.isOpen = false;
    this.attack = 0.01;
    this.release = 0.05;
    this.gain = 1.0;
    
    this.port.onmessage = (e) => {
      if (e.data.gateLevel !== undefined) {
        this.gateLevel = e.data.gateLevel;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length || !input[0]) return true;

    let sumSquares = 0;
    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
        sumSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSquares / channelData.length);

    if (rms > this.gateLevel) {
      this.isOpen = true;
    } else {
      this.isOpen = false;
    }

    const targetGain = this.isOpen ? 1.0 : 0.0;
    
    this.gain += (targetGain - this.gain) * (this.isOpen ? this.attack : this.release);

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      if (!outputChannel) continue;
      for (let i = 0; i < inputChannel.length; i++) {
        outputChannel[i] = inputChannel[i] * this.gain;
      }
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
    `;

    const blob = new Blob([noiseGateWorkletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const noiseGateNode = new AudioWorkletNode(ctx, 'noise-gate-processor');
    noiseGateNode.port.postMessage({ gateLevel });

    source.connect(noiseGateNode);
    noiseGateNode.connect(destination);

    // Retourner le stream ORIGINAL (rawMicStream) pour LiveKit
    // Le noise gate agit en amont mais LiveKit prend la source brute
    return stream; // ← stream = le paramètre d'entrée de applyNoiseGate
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
      // Générer un vrai silence via Web Audio API — compatible Chrome/Firefox/Safari
      const silentCtx = new AudioContext();
      const silentBuffer = silentCtx.createBuffer(1, silentCtx.sampleRate, silentCtx.sampleRate);
      const silentDest = silentCtx.createMediaStreamDestination();
      const silentSource = silentCtx.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.loop = true;
      silentSource.connect(silentDest);
      silentSource.start();

      const audio = new Audio();
      audio.srcObject = silentDest.stream;
      audio.loop = true;
      silentAudioRef.current = audio;
    }
    silentAudioRef.current.play()
      .then(() => console.warn('[SILENT] ✅ audio started'))
      .catch(e => console.error('[SILENT] ❌ audio blocked', e));
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
        // ON désactive stopMicTrackOnMute pour ne pas perdre le noise gate personnalisé lors du unmute
        stopMicTrackOnMute: false 
      }
    });
    roomRef.current = room;

    const connectToLiveKit = async () => {

      // 👇 Fix Chrome — débloquer l'AudioContext au moment de la connexion
      try {
        const tmpCtx = new AudioContext();
        await tmpCtx.resume();
        await tmpCtx.close();
      } catch (e) { /* silencieux */ }  

      try {
        const currentInstance = getCurrentInstance();
        const livekitUrl = currentInstance?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
        if (!livekitUrl) { console.warn("VITE_LIVEKIT_URL is not set."); return; }
        console.warn('[LK 0] 🔑 Demande token | channel:', connectedVoiceChannelId, '| user:', currentUser.id);
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
        console.warn('[LK 0b] 📡 Token status:', res.status, res.ok ? '✅' : '❌');
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
            console.warn('[LK 3] 📥 Micro reçu | from:', participant.identity, '| readyState:', track.mediaStreamTrack.readyState, '| enabled:', track.mediaStreamTrack.enabled);
            const stream = new MediaStream([track.mediaStreamTrack]);
            setRemoteStreams(prev => { const map = new Map(prev); map.set(participant.identity, stream); return map; });
            console.warn('[LK 3b] remoteStreams size après set:', remoteStreams.size + 1);
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
            console.warn('[LK 4] 📤 Micro retiré | from:', participant.identity);
            setRemoteStreams(prev => { const map = new Map(prev); map.delete(participant.identity); return map; });
          }
        });

        room.on(RoomEvent.ParticipantConnected, (p) => {
          console.warn('[LK 6] 👤 Participant rejoint:', p.identity, '| total:', room.remoteParticipants.size);
        });

        room.on(RoomEvent.ParticipantDisconnected, (p) => {
          console.warn('[LK 7] 👋 Participant parti:', p.identity);
        });

        room.on(RoomEvent.ConnectionStateChanged, (state) => {
          console.warn('[LK 8] 🔌 ConnectionState:', state);
        });

        room.on(RoomEvent.MediaDevicesError, (e) => {
          console.error('[LK 9] ❌ MediaDevicesError:', e.message);
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          // Reset classes for everyone
          document.querySelectorAll('[class*="avatar-user-"]').forEach(el => {
            el.classList.remove('speaking-ring');
            el.classList.add('ring-transparent');
          });
          document.querySelectorAll('[class*="text-user-"]').forEach(el => {
            el.classList.remove('text-zinc-100');
            if (el.classList.contains('text-base')) { // the small one in right sidebar uses text-base
               el.classList.add('text-zinc-400');
            } else { // Large one is text-xs in VoiceParticipants, we used text-zinc-300 by default there
               el.classList.add('text-zinc-300');
            }
          });

          // Add speaking classes
          speakers.forEach(speaker => {
            document.querySelectorAll(`.avatar-user-${speaker.identity}`).forEach(el => {
              el.classList.remove('ring-transparent');
              el.classList.add('speaking-ring');
            });
            document.querySelectorAll(`.text-user-${speaker.identity}`).forEach(el => {
              // we don't know the exact base class here, but adding text-zinc-100 is enough to override if it's placed after or with !important. Actually Tailwind utilities replace each other if added together?
              el.classList.remove('text-zinc-400', 'text-zinc-300');
              el.classList.add('text-zinc-100');
            });
          });
        });

        // 🔄 Re-publier le micro silencieusement lors d'une reconnexion LiveKit
        room.on(RoomEvent.Reconnected, async () => {
          console.log('[WebRTC] Reconnected, re-applying microphone track if needed...');
          try {
            if (rawMicStreamRef.current) {
              rawMicStreamRef.current.getTracks().forEach(t => t.stop());
            }

            const currentSettings = useAppStore.getState().voiceSettings;
            const currentIsMuted = useAppStore.getState().isVoiceMuted;
            const currentIsDeafened = useAppStore.getState().isDeafened;
            
            rawMicStreamRef.current = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: currentSettings.echoCancellation,
                noiseSuppression: currentSettings.noiseSuppression,
                autoGainControl: currentSettings.autoGainControl,
                deviceId: currentSettings.selectedMicrophoneId || undefined
              }
            });

            const existingPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (existingPub && existingPub.track) {
              await room.localParticipant.unpublishTrack(existingPub.track as LocalAudioTrack);
            }

            await setupLocalAnalyser(rawMicStreamRef.current);
            const micStream = rawMicStreamRef.current;

              const audioTrack = micStream.getAudioTracks()[0];
              console.warn('[LK DEBUG] audioTrack:', audioTrack, '| micStream tracks:', micStream.getTracks().length);
              if (audioTrack) {
                const localAudioTrack = new LocalAudioTrack(audioTrack);
                if (currentIsMuted || currentIsDeafened) {
                    await localAudioTrack.mute();
                }
                await room.localParticipant.publishTrack(localAudioTrack, {
                  source: Track.Source.Microphone,
                  red: true,
                  dtx: true,
                });
                console.log('[WebRTC] Microphone track successfully republished after reconnect.');
              }
            } catch (err) {
              console.error("[WebRTC] Reconnected mic publish error:", err);
            }
        });

        await room.connect(livekitUrl, token);
        console.log('[WebRTC] Connected to LiveKit Room:', connectedVoiceChannelId);        
        console.warn('[LK 1] ✅ Room connectée | state:', room.state, '| participants distants:', room.remoteParticipants.size);
      

        // ── DM Call Joined Sound ──
        const handleCallJoined = () => {
          const state = useAppStore.getState();
          // Uniquement pour les appels privés (pas de serverId)
          if (state.connectedVoiceServerId) return;
          
          if (!state.callJoinedSoundPlayed) {
            state.setCallJoinedSoundPlayed(true);
            stopRingtone();
            playCallJoinedSound(state.voiceVolume);
            console.log('[WebRTC] Private call established, playing sound');
          }
        };

        // Si on rejoint un appel où il y a déjà du monde
        if (room.remoteParticipants.size > 0) {
          handleCallJoined();
        }

        // Si quelqu'un nous rejoint
        room.on(RoomEvent.ParticipantConnected, () => {
          handleCallJoined();
        });

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
        socket.emit('join-channel', connectedVoiceChannelId);
        
        const emitJoinVoiceChannel = () => {
          socket.emit('join-voice-channel', {
            channelId: connectedVoiceChannelId,
            user: {
              id: currentUser.id,
              name: profile?.username || profile?.display_name || 'Utilisateur',
              avatarUrl: profile?.avatar_url,
              isMuted: useAppStore.getState().isVoiceMuted,
              isStreaming: useAppStore.getState().isScreenSharing,
              joinedAt: new Date().toISOString()
            }
          });
        };

        emitJoinVoiceChannel();
        
        // 🔄 Si le serveur Node.js redémarre ou que le socket se reconnecte, on se réannonce
        socket.on('connect', emitJoinVoiceChannel);
        (room as any)._onSocketConnect = emitJoinVoiceChannel; // on stocke pour nettoyer

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
          rawMicStreamRef.current = rawMicStream;

          await setupLocalAnalyser(rawMicStream);
          const micStream = rawMicStream;

          const audioTrack = micStream.getAudioTracks()[0];
          console.warn('[LK DEBUG] audioTrack apres NoiseGate:', audioTrack, '| micStream tracks:', micStream.getTracks().length);
          if (audioTrack) {
            const localAudioTrack = new LocalAudioTrack(audioTrack);
            if (isVoiceMuted || isDeafened) {
              await localAudioTrack.mute();
            }
            await room.localParticipant.publishTrack(localAudioTrack, {
              source: Track.Source.Microphone,
              red: true,
              dtx: true,
            });
            const _iceRaw = (room.engine?.pcManager?.publisher as any)?.pc?.getConfiguration();
            console.warn('[LK 1b] ICE config:', JSON.stringify({
              ..._iceRaw,
              iceServers: (_iceRaw?.iceServers ?? []).map(s => ({ ...s, credential: '***', username: '***' }))
            }));
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

      // ✅ Nettoyer le noise gate et le micro
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      localAnalyserRef.current = null;

      if (rawMicStreamRef.current) {
        rawMicStreamRef.current.getTracks().forEach(t => t.stop());
        rawMicStreamRef.current = null;
      }
      if (noiseGateCtxRef.current) {
        noiseGateCtxRef.current.close();
        noiseGateCtxRef.current = null;
      }
      // ✅ Nettoyer les GainNodes de tous les peers
      destroyAllPeerAudioChains();

      if (roomRef.current) { 
        if ((roomRef.current as any)._onSocketConnect) {
          socket.off('connect', (roomRef.current as any)._onSocketConnect);
        }
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
        <AudioPlayer key={uid} userId={uid} stream={stream} />
      ))}
    </>
  );
}
