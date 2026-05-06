import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { PhoneOff, Mic, MicOff, SignalHigh, Headphones, HeadphonesIcon, MonitorUp, MonitorOff, Settings2, Eye, Volume2, PauseCircle } from 'lucide-react';
import { playDisconnectSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound, playScreenShareStartSound, playScreenShareStopSound, playRingtone, stopRingtone } from '../lib/sounds';
import clsx from 'clsx';
import ScreenSharePickerModal from './ui/ScreenSharePickerModal';
import SoundboardPicker from './SoundboardPicker';
import socket from '../lib/socket';
import { useTranslation } from 'react-i18next';

export default function VoicePanel() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const {
    connectedVoiceChannelId,
    setConnectedVoiceChannelId,
    isVoiceMuted,
    setIsVoiceMuted,
    isDeafened,
    setIsDeafened,
    isScreenSharing,
    setIsScreenSharing,
    setScreenShareQuality,
    viewingScreenShares,
    setViewingScreenShares,
    setActiveStreamFocus,
    localScreenShareStream,
    setSelectedDmId,
    setSelectedServerId,
    selectedServerId,
  } = useAppStore();

  const [channelName, setChannelName] = useState('Voice Channel');
  const [callDuration, setCallDuration] = useState(0);
  const [isCall, setIsCall] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);
  const [pendingQuality, setPendingQuality] = useState<any>(null);
  const [streamViewers, setStreamViewers] = useState<any[]>([]);
  const [isStreamPaused, setIsStreamPaused] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);

  // ─── Refs pour la stratégie canvas "pause frame" ───────────────────────────
  // Quand la fenêtre partagée est minimisée, la vraie track se "mute" (readyState=live mais plus de frames).
  // On substitue une canvas noire animée (1 fps) pour garder la track LiveKit en vie côté spectateurs.
  // Quand la fenêtre revient, on reswap sur la vraie track via replaceTrack.
  const realVideoTrackRef = useRef<MediaStreamTrack | null>(null);    // la vraie track capturée
  const canvasStreamRef = useRef<MediaStream | null>(null);           // stream canvas de substitution
  const canvasIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // boucle canvas
  const isPausedRef = useRef(false);                                  // état pause interne (sans re-render)
  const userStoppedRef = useRef(false);                               // true si arrêt volontaire
  // ──────────────────────────────────────────────────────────────────────────

  const voiceParticipantsMap = useAppStore(state => state.voiceParticipants);
  const voiceParticipants = voiceParticipantsMap[connectedVoiceChannelId || ''] || [];

  // ─── Vidéo locale keep-alive ───────────────────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localScreenShareStream) {
      localVideoRef.current.srcObject = localScreenShareStream;
      localVideoRef.current.play().catch(console.error);
    } else if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [localScreenShareStream]);


  // ─── Stratégie optimization RAM : Freeze frame basse fréquence ─────────────
  useEffect(() => {
    if (!localScreenShareStream || !isScreenSharing) {
      cleanupCanvas();
      return;
    }

    const videoTrack = localScreenShareStream.getVideoTracks()[0];
    if (!videoTrack) return;

    realVideoTrackRef.current = videoTrack;
    userStoppedRef.current = false;

    // Canvas pour stocker la "dernière frame"
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let lastW = 0, lastH = 0;

    // Prise d'instantané à basse fréquence (toutes les 2.5s)
    // C'est TRÈS léger par rapport à 30 fois par seconde
    const takeSnapshot = () => {
      if (userStoppedRef.current || !localVideoRef.current || isPausedRef.current) return;
      
      const v = localVideoRef.current;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        if (lastW !== v.videoWidth || lastH !== v.videoHeight) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          lastW = v.videoWidth;
          lastH = v.videoHeight;
        }
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      }
    };

    const snapshotInterval = setInterval(takeSnapshot, 2500);

    // Quand la vraie track s'arrête (fenêtre réduite)
    const handleEnded = async () => {
      if (userStoppedRef.current) return;
      
      console.log('[ScreenShare] Track ended unexpectedly — showing freeze frame');
      isPausedRef.current = true;
      setIsStreamPaused(true);
      clearInterval(snapshotInterval);

      // Dessiner l'overlay de pause
      if (lastW > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(canvas.height * 0.05)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⏸ Stream en pause', canvas.width / 2, canvas.height / 2);
      }

      // Créer un flux Canvas statique (1 FPS) pour maintenir la connexion
      const canvasStream = canvas.captureStream(1);
      canvasStreamRef.current = canvasStream;
      const canvasTrack = canvasStream.getVideoTracks()[0];

      // Remplacer la track dans LiveKit pour les spectateurs
      const publishedTrack = (useAppStore.getState() as any).publishedScreenTrack;
      if (publishedTrack && canvasTrack) {
        try {
          await publishedTrack.replaceTrack(canvasTrack);
        } catch (e) {
          console.warn('[ScreenShare] replaceTrack to freeze failed:', e);
        }
      }
    };

    // Quand la fenêtre est restaurée (dé-minimisée)
    const handleUnmute = async () => {
      if (userStoppedRef.current || !isPausedRef.current) return;
      
      console.log('[ScreenShare] Window restored — resuming real track');
      isPausedRef.current = false;
      setIsStreamPaused(false);
      
      // Nettoyer le stream canvas
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getTracks().forEach(t => t.stop());
        canvasStreamRef.current = null;
      }

      // Remplacer par la vraie track
      const publishedTrack = (useAppStore.getState() as any).publishedScreenTrack;
      if (publishedTrack && realVideoTrackRef.current) {
        try {
          await publishedTrack.replaceTrack(realVideoTrackRef.current);
        } catch (e) {
          console.warn('[ScreenShare] replaceTrack back to real failed:', e);
        }
      }
    };

    videoTrack.addEventListener('ended', handleEnded);
    videoTrack.addEventListener('mute', handleEnded);
    videoTrack.addEventListener('unmute', handleUnmute);

    return () => {
      videoTrack.removeEventListener('ended', handleEnded);
      videoTrack.removeEventListener('mute', handleEnded);
      videoTrack.removeEventListener('unmute', handleUnmute);
      clearInterval(snapshotInterval);
      cleanupCanvas();
    };
  }, [localScreenShareStream, isScreenSharing]);

  // ─── Cleanup canvas helper ──────────────────────────────────────────────────
  const cleanupCanvas = useCallback(() => {
    if (canvasIntervalRef.current) {
      clearInterval(canvasIntervalRef.current);
      canvasIntervalRef.current = null;
    }
    if (canvasStreamRef.current) {
      canvasStreamRef.current.getTracks().forEach(t => t.stop());
      canvasStreamRef.current = null;
    }
    isPausedRef.current = false;
  }, []);

  // ─── Wake Lock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && connectedVoiceChannelId) {
          const status = await (navigator as any).permissions.query({ name: 'screen-wake-lock' }).catch(() => null);
          if (status && status.state === 'denied') return;
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err: any) {
        if (err.name !== 'NotAllowedError' && !err.message?.includes('permissions policy')) {
          console.error("Wake Lock error:", err);
        }
      }
    };
    if (connectedVoiceChannelId) requestWakeLock();
    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) wakeLock.release().catch(console.error);
    };
  }, [connectedVoiceChannelId]);

  // ─── Infos channel ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    setCallDuration(0);
    setIsCall(false);
    const fetchChannelInfo = async () => {
      const { data: channel } = await supabase.from('channels').select('name').eq('id', connectedVoiceChannelId).maybeSingle();
      if (channel) {
        setChannelName(channel.name);
        setIsCall(false);
      } else {
        const { data: dm } = await supabase.from('dms').select('*').eq('id', connectedVoiceChannelId).maybeSingle();
        if (dm) {
          setIsCall(true);
          const otherIds = dm.participants.filter((id: string) => id !== currentUser.id);
          let names = [];
          for (const id of otherIds) {
            if (!id) continue;
            const { data: profile } = await supabase.from('profiles').select('username, display_name').eq('id', id).maybeSingle();
            if (profile) names.push(profile.username || profile.display_name);
          }
          setChannelName(names.join(', ') || t('voice.privateCall'));
        }
      }
    };
    fetchChannelInfo();
    const chanName = `voice_panel_channel_${connectedVoiceChannelId}_${currentUser.id}_${Math.random().toString(36).substring(7)}`;
    const channelSub = supabase.channel(chanName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `id=eq.${connectedVoiceChannelId}` }, () => fetchChannelInfo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dms', filter: `id=eq.${connectedVoiceChannelId}` }, () => fetchChannelInfo())
      .subscribe();
    return () => { supabase.removeChannel(channelSub); };
  }, [connectedVoiceChannelId, currentUser]);

  // ─── Viewers du stream ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser || !isScreenSharing) {
      setStreamViewers([]);
      return;
    }
    const myUid = currentUser.id;
    const viewers = voiceParticipants
      .filter((p: any) => p.id !== myUid && Array.isArray(p.viewingStreams) && p.viewingStreams.includes(myUid))
      .map(p => ({ id: p.id, name: p.name }));
    setStreamViewers(viewers);
  }, [connectedVoiceChannelId, isScreenSharing, currentUser, voiceParticipants]);

  // ─── Timer d'appel ─────────────────────────────────────────────────────────
  useEffect(() => {
    let interval: any;
    if (connectedVoiceChannelId && isCall) {
      interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [connectedVoiceChannelId, isCall]);

  // ─── Sonnerie ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !isCall || !currentUser) { stopRingtone(); return; }
    let isCaller = false;
    const checkCaller = async () => {
      const { data: call } = await supabase.from('calls').select('caller_id').eq('id', connectedVoiceChannelId).maybeSingle();
      if (call && call.caller_id === currentUser.id) {
        isCaller = true;
        if (voiceParticipants.length === 1) playRingtone();
      }
    };
    checkCaller();
    if (voiceParticipants.length === 1 && isCaller) playRingtone();
    else if (voiceParticipants.length > 1) stopRingtone();
    return () => { stopRingtone(); };
  }, [connectedVoiceChannelId, isCall, currentUser, voiceParticipants.length]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDisconnect = async () => {
    playDisconnectSound();
    setConnectedVoiceChannelId(null);
  };

  const toggleMute = () => {
    if (isDeafened) return;
    if (isVoiceMuted) playUnmuteSound(); else playMuteSound();
    setIsVoiceMuted(!isVoiceMuted);
  };

  const toggleDeafen = () => {
    if (isDeafened) { playUndeafenSound(); setIsDeafened(false); }
    else { playDeafenSound(); setIsDeafened(true); if (!isVoiceMuted) setIsVoiceMuted(true); }
  };

  const handleScreenShare = async (quality: { width: number, height: number, frameRate: number }, sourceId?: string) => {
    try {
      const isElectron = navigator.userAgent.toLowerCase().includes('electron');
      let stream: MediaStream;

      if (isElectron && sourceId) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const isScreen = sourceId.startsWith('screen:');
        try {
          if (!isScreen) throw new Error("Audio capture is only supported for entire screens");
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'desktop' } },
            video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: quality.width, maxHeight: quality.height, maxFrameRate: quality.frameRate } }
          } as any);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: quality.width, maxHeight: quality.height, maxFrameRate: quality.frameRate } }
          } as any);
        }
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: quality.width, max: 2560 }, height: { ideal: quality.height, max: 1440 }, frameRate: { ideal: quality.frameRate, max: 60 }, displaySurface: 'window' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, suppressLocalAudioPlayback: false }
        } as any);
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'contentHint' in videoTrack) (videoTrack as any).contentHint = 'motion';

      userStoppedRef.current = false;
      setIsStreamPaused(false);
      playScreenShareStartSound();
      setScreenShareQuality(quality);
      setShowQualityMenu(false);
      setShowPicker(false);

      useAppStore.getState().setLocalScreenShareStream(stream);
      useAppStore.getState().setIsScreenSharing(true);
    } catch (err) {
      console.error("Error sharing screen", err);
      useAppStore.getState().setIsScreenSharing(false);
      useAppStore.getState().setLocalScreenShareStream(null);
    }
  };

  const startScreenShareFlow = (quality: { width: number, height: number, frameRate: number }) => {
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');
    if (isElectron) { setPendingQuality(quality); setShowPicker(true); setShowQualityMenu(false); }
    else handleScreenShare(quality);
  };

  const toggleScreenShare = () => {
    if (window.innerWidth < 768) return;
    if (isScreenSharing) {
      // Arrêt volontaire
      userStoppedRef.current = true;
      setIsStreamPaused(false);
      setIsScreenSharing(false);
      setViewingScreenShares(new Set());
      setActiveStreamFocus(null);
      playScreenShareStopSound();
      const stream = useAppStore.getState().localScreenShareStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        useAppStore.getState().setLocalScreenShareStream(null);
      }
    } else {
      setShowQualityMenu(!showQualityMenu);
    }
  };

  const stopWatchingAll = () => { setViewingScreenShares(new Set()); setActiveStreamFocus(null); };

  if (!connectedVoiceChannelId) return null;

  const handlePanelClick = () => {
    if (isCall && connectedVoiceChannelId) { setSelectedServerId(null); setSelectedDmId(connectedVoiceChannelId); }
  };

  const isAfk = channelName.endsWith(' [AFK]');
  const displayChannelName = isAfk ? channelName.replace(' [AFK]', '') : channelName;

  return (
    <div className="bg-zinc-950 border-t border-zinc-800 p-2 flex flex-col gap-2 shrink-0 relative">
      {/* Vidéo cachée keep-alive */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="fixed -left-[2000px] -top-[2000px] w-10 h-10 opacity-[0.05] pointer-events-none z-[-1]"
      />

      <div className="hidden md:flex items-center justify-between px-2">
        <div
          className={clsx("flex items-center gap-2 text-emerald-500", isCall && "cursor-pointer hover:opacity-80 transition-opacity")}
          onClick={handlePanelClick}
        >
          <SignalHigh className="w-4 h-4" />
          <div className="flex flex-col">
            <span className="text-xs font-bold">
              {isCall ? t('voice.inCall', { duration: formatDuration(callDuration) }) : t('voice.voiceConnected')}
            </span>
            <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">{displayChannelName}</span>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-500 transition-colors"
          title={t('voice.disconnect')}
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>

      {/* Overlay "Stream en pause" */}
      {isScreenSharing && isStreamPaused && (
        <div className="px-2">
          <div className="w-full flex items-center justify-center gap-2 py-1.5 bg-yellow-500/10 text-yellow-400 rounded-md text-xs font-medium border border-yellow-500/20 animate-pulse">
            <PauseCircle className="w-3 h-3" />
            Stream en pause — fenêtre minimisée
          </div>
        </div>
      )}

      {viewingScreenShares.size > 0 && (
        <div className="px-2">
          <button
            onClick={stopWatchingAll}
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-md text-xs font-medium transition-colors border border-indigo-500/20"
          >
            <MonitorOff className="w-3 h-3" />
            {t('voice.leaveStreamCount', { count: viewingScreenShares.size })}
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 px-1">
        <div className="relative flex-1 hidden md:block">
          <button
            onClick={toggleScreenShare}
            disabled={isAfk}
            className={`w-full flex items-center justify-center py-1.5 rounded-md transition-colors ${
              isScreenSharing
                ? isStreamPaused
                  ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
            } ${isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isScreenSharing ? t('voice.stopSharing') : (isAfk ? t('voice.afkRestricted') : t('voice.shareScreen'))}
          >
            {isScreenSharing
              ? isStreamPaused ? <PauseCircle className="w-4 h-4" /> : <MonitorOff className="w-4 h-4" />
              : <MonitorUp className="w-4 h-4" />
            }
          </button>
          {isScreenSharing && streamViewers.length > 0 && (
            <div className="absolute -top-2 -right-2 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-md" title={streamViewers.map(v => v.name).join(', ')}>
              <Eye className="w-3 h-3" />
              {streamViewers.length}
            </div>
          )}
        </div>

        <button
          onClick={toggleMute}
          disabled={isAfk}
          className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${isVoiceMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'} ${isDeafened || isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isVoiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleDeafen}
          disabled={isAfk}
          className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${isDeafened ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'} ${isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isDeafened ? <HeadphonesIcon className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setShowSoundboard(!showSoundboard)}
          className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${showSoundboard ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'}`}
        >
          <Volume2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleDisconnect}
          className="flex-1 md:hidden flex items-center justify-center py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-500 transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>

      <SoundboardPicker
        isOpen={showSoundboard}
        onClose={() => setShowSoundboard(false)}
        channelId={connectedVoiceChannelId}
        serverId={selectedServerId}
      />

      {showQualityMenu && !isScreenSharing && (
        <div className="absolute bottom-full left-2 mb-2 w-48 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg overflow-hidden z-50 hidden md:block">
          <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-900/50 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300">{t('voice.qualityTitle')}</span>
          </div>
          <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-700 leading-tight">
            {t('voice.audioNote')}
          </div>
          <button onClick={() => startScreenShareFlow({ width: 1280, height: 720, frameRate: 30 })} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">
            {t('voice.standard')}
          </button>
          <button onClick={() => startScreenShareFlow({ width: 1920, height: 1080, frameRate: 60 })} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">
            {t('voice.high')}
          </button>
          <button onClick={() => startScreenShareFlow({ width: 2560, height: 1440, frameRate: 60 })} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">
            {t('voice.ultra')}
          </button>
        </div>
      )}

      <ScreenSharePickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(sourceId) => handleScreenShare(pendingQuality, sourceId)}
      />
    </div>
  );
}
