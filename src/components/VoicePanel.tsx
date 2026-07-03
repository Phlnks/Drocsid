import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { PhoneOff, Mic, MicOff, SignalHigh, Headphones, HeadphonesIcon, MonitorUp, MonitorOff, Settings2, Eye, Volume2, PauseCircle } from 'lucide-react';
import { playDisconnectSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound, playScreenShareStartSound, playScreenShareStopSound } from '../lib/sounds';
import clsx from 'clsx';
import ScreenSharePickerModal from './ui/ScreenSharePickerModal';
import SoundboardPicker from './SoundboardPicker';
import socket from '../lib/socket';
import { useTranslation } from 'react-i18next';
import { type DesktopSourceInfo } from '../vite-env';
import { useInstanceStore } from '../store/instanceStore';

export default function VoicePanel() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const { getCurrentInstance } = useInstanceStore();
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

    activeShareSource,
    setActiveShareSource,
    loopbackStatus,
    setLoopbackStatus,
    loopbackOutputPath,
    setLoopbackOutputPath,
    loopbackError,
    setLoopbackError,
    setScreenShareHasAudio,
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
    return () => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
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

	useEffect(() => {
	  if (!isElectron || !isScreenSharing || activeShareSource?.type !== 'window') return;

	  const interval = setInterval(async () => {
		try {
		  const status = await window.electron?.getLoopbackTestStatus?.();
		  if (status?.ok) {
			setLoopbackStatus(status.status ?? 'idle');
			setLoopbackOutputPath((status as any).outputPath ?? null);
		  }
		} catch {}
	  }, 1500);

	  return () => clearInterval(interval);
	}, [isElectron, isScreenSharing, activeShareSource]);


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


	// Token livekit
	const fetchLivekitAppAudioToken = async () => {
	  const currentInstance = getCurrentInstance();
	  const livekitUrl = currentInstance?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
	  if (!livekitUrl) {
		throw new Error('VITE_LIVEKIT_URL is not set.');
	  }

	  const tokenEndpoint =
		currentInstance?.livekitTokenEndpoint ||
		import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ||
		'/api/livekit/token';

	  let finalTokenEndpoint = tokenEndpoint;

	  if (finalTokenEndpoint.startsWith('/')) {
		let baseUrl = currentInstance?.socketUrl || window.location.origin;
		if (baseUrl.includes('file://') || baseUrl.includes('drocsid://')) {
		  baseUrl =
			import.meta.env.VITE_BACKEND_URL ||
			import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
		}
		baseUrl = baseUrl.replace(/\/+$/, '');
		finalTokenEndpoint = baseUrl + tokenEndpoint;
	  }

	  const { currentUserProfile } = useAuthStore.getState();
	  const { isVoiceMuted, isDeafened } = useAppStore.getState();

	  const res = await fetch(finalTokenEndpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
		  roomName: connectedVoiceChannelId,
		  participantIdentity: `${currentUser.id}-appaudio`,
		  participantName: `${(currentUser as any).user_metadata?.username || 'Utilisateur'} (App Audio)`,
		  userProfile: {
			...currentUserProfile,
			name:
			  currentUserProfile?.username ||
			  (currentUser as any).user_metadata?.username ||
			  'Utilisateur',
			avatarUrl: currentUserProfile?.avatar_url,
			isMuted: isVoiceMuted,
			isDeafened: isDeafened,
			isAppAudioPublisher: true,
		  },
		}),
	  });

	  if (!res.ok) {
		throw new Error(await res.text());
	  }

	  const data = await res.json();
	  const token = data.participantToken || data.token;

	  if (!token) {
		throw new Error('LiveKit app audio token missing in response');
	  }

	  return { livekitUrl, token };
	};

  // ─── Lancement du partage d'écran ─────────────────────────────────────────
  const handleScreenShare = async (quality: { width: number; height: number; frameRate: number },source?: DesktopSourceInfo) => {
	  try {
		let stream: MediaStream;

		if (isElectron && source) {
		  await new Promise(resolve => setTimeout(resolve, 300));

		  const sourceId = source.id;
		  const isScreen = source.type === 'screen';
		  const isWindow = source.type === 'window';
		  const sourcePid = source.pid ?? null;

		  console.log('[VoicePanel] Source sélectionnée', {
			id: source.id,
			name: source.name,
			type: source.type,
			hwnd: source.hwnd,
			pid: source.pid,
			canShareAppAudio: source.canShareAppAudio
		  });

		  setActiveShareSource(source);
		  setLoopbackError(null);
		  setLoopbackOutputPath(null);
		  setLoopbackStatus('idle');

		  try {
			if (!isScreen) throw new Error('System audio only available for full screen');

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

			if (isWindow && sourcePid && sourcePid > 0) {
			  try {
				setLoopbackStatus('launching');
				setLoopbackError(null);
				setLoopbackOutputPath(null);

				const { livekitUrl, token } = await fetchLivekitAppAudioToken();

				const configResult = await window.electron?.configureLivekitAppAudio?.({
				  url: livekitUrl,
				  token,
				});

				console.log('[VoicePanel] configureLivekitAppAudio result', configResult);

				if (!configResult?.ok) {
				  setLoopbackStatus('error');
				  setLoopbackError(configResult?.error ?? "Impossible de configurer LiveKit pour l'audio applicatif");
				  throw new Error(configResult?.error ?? 'configureLivekitAppAudio failed');
				}

				const loopbackResult = await window.electron?.launchLoopbackTest?.(sourcePid);
				console.log('[VoicePanel] launchLoopbackTest result', loopbackResult);

				if (loopbackResult?.ok) {
				  setLoopbackStatus(loopbackResult.status ?? 'launching');
				  setLoopbackOutputPath((loopbackResult as any).outputPath ?? null);
				  setLoopbackError(null);
				} else {
				  setLoopbackStatus(loopbackResult?.status ?? 'error');
				  setLoopbackError(loopbackResult?.error ?? "Impossible de lancer l'audio applicatif");
				}
			  } catch (loopbackErr: any) {
				console.error('[VoicePanel] app audio setup failed', loopbackErr);
				setLoopbackStatus('error');
				setLoopbackError(loopbackErr?.message ?? "Erreur inconnue lors du lancement du loopback");
			  }
			} else {
			  setLoopbackStatus('idle');
			  setLoopbackOutputPath(null);
			  setLoopbackError(null);
			}
		} else {
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
		if (videoTrack && 'contentHint' in videoTrack) {
		  (videoTrack as any).contentHint = 'motion';
		}

		userStoppedRef.current = false;
		setIsStreamPaused(false);

		videoTrack.onended = async () => {
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
			setActiveShareSource(null);
			setLoopbackStatus('idle');
			setLoopbackOutputPath(null);
			setLoopbackError(null);
			setScreenShareHasAudio(false);
			playScreenShareStopSound();

			const s = useAppStore.getState().localScreenShareStream;
			if (s) s.getTracks().forEach(t => t.stop());
			useAppStore.getState().setLocalScreenShareStream(null);
		  }

		  try {
			await window.electron?.stopLoopbackTest?.();
		  } catch (e) {
			console.warn('[VoicePanel] stopLoopbackTest failed on track end', e);
		  }
		};

		const hasSystemAudio = stream.getAudioTracks().length > 0;

		playScreenShareStartSound();
		setScreenShareQuality(quality);
		setShowQualityMenu(false);
		setShowPicker(false);

		useAppStore.getState().setLocalScreenShareStream(stream);
		useAppStore.getState().setIsScreenSharing(true);
		setScreenShareHasAudio(hasSystemAudio);

	  } catch (err: any) {
		if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
		  console.error('Error sharing screen', err);
		}

		try {
		  await window.electron?.stopLoopbackTest?.();
		} catch {}

		useAppStore.getState().setIsScreenSharing(false);
		useAppStore.getState().setLocalScreenShareStream(null);
		setActiveShareSource(null);
		setLoopbackStatus('idle');
		setLoopbackOutputPath(null);
		setLoopbackError(null);
		setScreenShareHasAudio(false);
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
	  setActiveShareSource(null);
	  setLoopbackStatus('idle');
	  setLoopbackOutputPath(null);
	  setLoopbackError(null);
	  setScreenShareHasAudio(false);
	  playScreenShareStopSound();

	  const stream = useAppStore.getState().localScreenShareStream;
	  if (stream) {
		stream.getTracks().forEach(track => track.stop());
		useAppStore.getState().setLocalScreenShareStream(null);
	  }

	  window.electron?.stopLoopbackTest?.().catch((err: any) => {
		console.warn('[VoicePanel] stopLoopbackTest failed', err);
	  });
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
    const getShareStatusMeta = () => {
    if (!isScreenSharing) return null;

    const sourceType = activeShareSource?.type;
    const sourceName = activeShareSource?.name?.trim();

    const cleanName =
      sourceName && sourceName !== 'Entire Screen' && sourceName !== 'Screen 1'
        ? sourceName
        : null;

    const isWindowShare = isElectron && sourceType === 'window';
    const isScreenShare = (isElectron && sourceType === 'screen') || (!isElectron && !activeShareSource);

    let title = t('voice.shareActive');
    let subtitle = t('voice.shareRunning');

    if (isWindowShare) {
      title = cleanName ? cleanName : t('voice.sharedWindow');
      if (loopbackStatus === 'process_running') {
        subtitle = t('voice.appAudioRunning');
      } else if (loopbackStatus === 'launching') {
        subtitle = t('voice.appAudioStarting');
      } else if (loopbackStatus === 'error') {
        subtitle = loopbackError || t('voice.appAudioUnavailable');
      } else {
        subtitle = t('voice.windowShareActive');
      }
    } else if (isScreenShare) {
      title = cleanName ? cleanName : t('voice.sharedScreen');
      subtitle = t('voice.screenShareActive');
    } else {
      title = cleanName ? cleanName : t('voice.shareActive');
      subtitle = t('voice.shareRunning');
    }

    if (!isElectron && supportsDisplayMedia) {
      subtitle = t('voice.browserShareActive');
    }

    return {
      title,
      subtitle,
      badge: isWindowShare
        ? t('voice.window')
        : isScreenShare
          ? t('voice.screen')
          : t('voice.live'),
      hasError: loopbackStatus === 'error',
      hasAudio:
        isWindowShare
          ? loopbackStatus === 'process_running'
          : true,
    };
  };

  const shareStatusMeta = getShareStatusMeta();

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
            {t('voice.streamPaused')}
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
	  
	        {isScreenSharing && shareStatusMeta && (
        <div className="px-2">
          <div
            className={clsx(
              'w-full rounded-md border px-3 py-2 text-xs',
              shareStatusMeta.hasError
                ? 'border-red-500/20 bg-red-500/10'
                : 'border-indigo-500/20 bg-indigo-500/10'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className={clsx(
                    'font-semibold truncate',
                    shareStatusMeta.hasError ? 'text-red-300' : 'text-indigo-300'
                  )}
                >
                  {shareStatusMeta.title}
                </div>

                <div
                  className={clsx(
                    'truncate mt-0.5',
                    shareStatusMeta.hasError ? 'text-red-200/90' : 'text-zinc-400'
                  )}
                >
                  {shareStatusMeta.subtitle}
                </div>
              </div>

              <div
                className={clsx(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  shareStatusMeta.hasError
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-indigo-500/15 text-indigo-300'
                )}
              >
                {shareStatusMeta.badge}
              </div>
            </div>
          </div>
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
          {/* Note audio — uniquement sur navigateur web */}
          {!isElectron && (
            <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-700 leading-tight">
              <span className="block text-yellow-500/80">
                {t('voice.browserWarning')}
              </span>
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
	    onSelect={(source) => handleScreenShare(pendingQuality, source)}
	  />
    </div>
  );
}
