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
  const userStoppedRef = useRef(false);

  // Détection Electron une seule fois
  const isElectron = navigator.userAgent.toLowerCase().includes('electron');
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const supportsDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;

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

  // ─── Infos channel ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;
    setCallDuration(0);
    setIsCall(false);
    const fetchChannelInfo = async () => {
      const { data: channel } = await supabase.from('channels').select('name').eq('id', connectedVoiceChannelId).maybeSingle();
      if (channel) { setChannelName(channel.name); setIsCall(false); }
      else {
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
    // ✅ FIX: nom déterministe — Math.random() créait des channels zombies à chaque re-render
    const chanName = `voice_panel_channel_${connectedVoiceChannelId}_${currentUser.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${chanName}`) supabase.removeChannel(c);
    });
    const channelSub = supabase.channel(chanName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `id=eq.${connectedVoiceChannelId}` }, () => fetchChannelInfo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dms', filter: `id=eq.${connectedVoiceChannelId}` }, () => fetchChannelInfo())
      .subscribe();
    return () => { supabase.removeChannel(channelSub); };
  }, [connectedVoiceChannelId, currentUser]);

  // ─── Viewers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser || !isScreenSharing) { setStreamViewers([]); return; }
    const myUid = currentUser.id;
    const viewers = voiceParticipants
      .filter((p: any) => p.id !== myUid && Array.isArray(p.viewingStreams) && p.viewingStreams.includes(myUid))
      .map(p => ({ id: p.id, name: p.name }));
    setStreamViewers(viewers);
  }, [connectedVoiceChannelId, isScreenSharing, currentUser, voiceParticipants]);

  // ─── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let interval: any;
    if (connectedVoiceChannelId && isCall) interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    return () => { if (interval) clearInterval(interval); };
  }, [connectedVoiceChannelId, isCall]);

  // ─── Sonnerie ──────────────────────────────────────────────────────────────
  // Après — isCaller stocké en ref pour éviter la race condition
  const isCallerRef = useRef(false);

  useEffect(() => {
    if (!connectedVoiceChannelId || !isCall || !currentUser) {
      stopRingtone();
      isCallerRef.current = false;
      return;
    }
    const checkCaller = async () => {
      const { data: call } = await supabase.from('calls')
        .select('caller_id')
        .eq('id', connectedVoiceChannelId)
        .maybeSingle();
      // ✅ Vérifier que l'appel est toujours actif avant de sonner
      if (!call) { isCallerRef.current = false; return; }
      isCallerRef.current = call.caller_id === currentUser.id;
      if (isCallerRef.current && voiceParticipants.length === 1) playRingtone();
      else stopRingtone();
    };
    checkCaller();
    if (voiceParticipants.length > 1) stopRingtone();
    // ✅ cleanup immédiat — ne pas laisser la sonnerie si on quitte
    return () => { stopRingtone(); isCallerRef.current = false; };
  }, [connectedVoiceChannelId, isCall, currentUser, voiceParticipants.length]);

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
        if (err.name !== 'NotAllowedError' && !err.message?.includes('permissions policy')) console.error("Wake Lock error:", err);
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


  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDisconnect = async () => { playDisconnectSound(); setConnectedVoiceChannelId(null); };

  const toggleMute = () => {
    if (isDeafened) return;
    if (isVoiceMuted) playUnmuteSound(); else playMuteSound();
    setIsVoiceMuted(!isVoiceMuted);
  };

  const toggleDeafen = () => {
    if (isDeafened) { playUndeafenSound(); setIsDeafened(false); }
    else { playDeafenSound(); setIsDeafened(true); if (!isVoiceMuted) setIsVoiceMuted(true); }
  };

  // ─── Lancement du partage d'écran ─────────────────────────────────────────
  const handleScreenShare = async (quality: { width: number, height: number, frameRate: number }, sourceId?: string) => {
    try {
      let stream: MediaStream;

      if (isElectron && sourceId) {
        // ── Electron : capture desktop (écran entier ou fenêtre d'application) ──
        await new Promise(resolve => setTimeout(resolve, 300));
        const isScreen = sourceId.startsWith('screen:');
        try {
          if (!isScreen) throw new Error('Audio loopback only available for full screen');
          // Écran entier avec audio système
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'desktop' } },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: quality.width,
                maxHeight: quality.height,
                maxFrameRate: quality.frameRate
              }
            }
          } as any);
        } catch {
          // Fenêtre d'application ou écran sans audio → sans audio
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: quality.width,
                maxHeight: quality.height,
                maxFrameRate: quality.frameRate
              }
            }
          } as any);
        }
      } else {
        // ── Navigateur web : écran entier UNIQUEMENT ──
        // displaySurface: 'monitor' force la sélection d'un écran entier.
        // Les onglets et fenêtres d'applications sont exclus de la boîte de dialogue.
        // L'audio système est proposé à l'utilisateur s'il coche "Partager l'audio du système".
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: quality.width, max: 2560 },
            height: { ideal: quality.height, max: 1440 },
            frameRate: { ideal: quality.frameRate, max: 60 },
            displaySurface: 'monitor'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            suppressLocalAudioPlayback: false
          }
        } as any);
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'contentHint' in videoTrack) (videoTrack as any).contentHint = 'motion';

      userStoppedRef.current = false;
      setIsStreamPaused(false);
	  
      // Electron → pause (fenêtre minimisée, reprise possible via visibilitychange)
      // Navigateur → arrêt propre immédiat (la reprise n'est pas fiable sur navigateur)
      videoTrack.onended = () => {
        if (userStoppedRef.current) return;
        if (isElectron) {
          console.log('[VoicePanel] track ended (Electron) → paused');
          setIsStreamPaused(true);
        } else {
          console.log('[VoicePanel] track ended (browser) → stopping cleanly');
          userStoppedRef.current = true;
          setIsStreamPaused(false);
          setIsScreenSharing(false);
          setViewingScreenShares(new Set());
          setActiveStreamFocus(null);
          playScreenShareStopSound();
          const s = useAppStore.getState().localScreenShareStream;
          if (s) s.getTracks().forEach(t => t.stop());
          useAppStore.getState().setLocalScreenShareStream(null);
        }
      };

      const hasSystemAudio = stream.getAudioTracks().length > 0;

      playScreenShareStartSound();
      setScreenShareQuality(quality);
      setShowQualityMenu(false);
      setShowPicker(false);

      useAppStore.getState().setLocalScreenShareStream(stream);
      useAppStore.getState().setIsScreenSharing(true);
      // ✅ Stocker si le son système est actif
      (useAppStore.getState() as any).screenShareHasAudio = hasSystemAudio;

    } catch (err: any) {
      // L'utilisateur a annulé ou refusé → pas d'erreur visible
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        console.error('Error sharing screen', err);
      }
      useAppStore.getState().setIsScreenSharing(false);
      useAppStore.getState().setLocalScreenShareStream(null);
    }
  };

  const startScreenShareFlow = (quality: { width: number, height: number, frameRate: number }) => {
    if (isElectron) {
      // Electron : ouvrir le picker (écrans + fenêtres d'applications)
      setPendingQuality(quality);
      setShowPicker(true);
      setShowQualityMenu(false);
    } else {
      // Navigateur : lancer directement getDisplayMedia (écran entier seulement)
      handleScreenShare(quality);
    }
  };

  const toggleScreenShare = () => {
  if (isMobile || (!isElectron && !supportsDisplayMedia)) return;
    if (isScreenSharing) {
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
        autoPlay playsInline muted
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
        <button onClick={handleDisconnect} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-500 transition-colors" title={t('voice.disconnect')}>
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>

      {/* Bannière "Stream en pause" — visible seulement sur Electron (fenêtre minimisée) */}
      {isElectron && isScreenSharing && isStreamPaused && (
        <div className="px-2">
          <div className="w-full flex items-center justify-center gap-2 py-1.5 bg-yellow-500/10 text-yellow-400 rounded-md text-xs font-medium border border-yellow-500/20 animate-pulse">
            <PauseCircle className="w-3 h-3" />
            Stream en pause — fenêtre minimisée
          </div>
        </div>
      )}

      {viewingScreenShares.size > 0 && (
        <div className="px-2">
          <button onClick={stopWatchingAll} className="w-full flex items-center justify-center gap-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-md text-xs font-medium transition-colors border border-indigo-500/20">
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
                ? (isElectron && isStreamPaused)
                  ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
            } ${isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isScreenSharing ? t('voice.stopSharing') : (isAfk ? t('voice.afkRestricted') : t('voice.shareScreen'))}
          >
            {isScreenSharing
              ? (isElectron && isStreamPaused) ? <PauseCircle className="w-4 h-4" /> : <MonitorOff className="w-4 h-4" />
              : <MonitorUp className="w-4 h-4" />}
          </button>
          {isScreenSharing && streamViewers.length > 0 && (
            <div className="absolute -top-2 -right-2 bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-md" title={streamViewers.map(v => v.name).join(', ')}>
              <Eye className="w-3 h-3" />
              {streamViewers.length}
            </div>
          )}
        </div>

        <button onClick={toggleMute} disabled={isAfk}
          className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${isVoiceMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'} ${isDeafened || isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {isVoiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button onClick={toggleDeafen} disabled={isAfk}
          className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${isDeafened ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'} ${isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {isDeafened ? <HeadphonesIcon className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>

        <button onClick={() => setShowSoundboard(!showSoundboard)}
          className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${showSoundboard ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'}`}>
          <Volume2 className="w-4 h-4" />
        </button>

        <button onClick={handleDisconnect}
          className="flex-1 md:hidden flex items-center justify-center py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-500 transition-colors">
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>

      <SoundboardPicker isOpen={showSoundboard} onClose={() => setShowSoundboard(false)} channelId={connectedVoiceChannelId} serverId={selectedServerId} />

      {/* Menu qualité — visible uniquement si pas encore en train de partager */}
      {showQualityMenu && !isScreenSharing && (
        <div className="absolute bottom-full left-2 mb-2 w-56 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg overflow-hidden z-50 hidden md:block">
          <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-900/50 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300">{t('voice.qualityTitle')}</span>
          </div>
          {/* Note audio — uniquement sur navigateur web où displaySurface: 'monitor' est utilisé */}
          {!isElectron && (
            <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-700 leading-tight">
              🖥️ Écran entier uniquement — l'audio système sera proposé dans la boîte de dialogue du navigateur.
              {/firefox/i.test(navigator.userAgent) && (
                <span className="block mt-1 text-yellow-500/80">
                  ⚠️ Firefox : préférez partager un écran entier pour éviter les coupures.
                </span>
              )}
            </div>
          )}
          {isElectron && (
            <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-700 leading-tight">
              🎵 L'audio système est capturé automatiquement lors d'un partage d'écran entier.
            </div>
          )}
          <button onClick={() => startScreenShareFlow({ width: 1280, height: 720, frameRate: 30 })} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">{t('voice.standard')}</button>
          <button onClick={() => startScreenShareFlow({ width: 1920, height: 1080, frameRate: 60 })} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">{t('voice.high')}</button>
          <button onClick={() => startScreenShareFlow({ width: 2560, height: 1440, frameRate: 60 })} className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">{t('voice.ultra')}</button>
        </div>
      )}

      {/* Picker Electron — écrans ET fenêtres d'applications */}
      <ScreenSharePickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(sourceId) => handleScreenShare(pendingQuality, sourceId)}
      />
    </div>
  );
}
