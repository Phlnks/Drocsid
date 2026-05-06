import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { PhoneOff, Mic, MicOff, SignalHigh, Headphones, HeadphonesIcon, MonitorUp, MonitorOff, Settings2, Eye, Volume2 } from 'lucide-react';
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
    soundboardVolume,
    isSoundboardMuted
  } = useAppStore();
  
  const [channelName, setChannelName] = useState('Voice Channel');
  const [callDuration, setCallDuration] = useState(0);
  const [isCall, setIsCall] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);
  const [pendingQuality, setPendingQuality] = useState<any>(null);
  const [streamViewers, setStreamViewers] = useState<any[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const voiceParticipantsMap = useAppStore(state => state.voiceParticipants);
  const voiceParticipants = voiceParticipantsMap[connectedVoiceChannelId || ''] || [];

  // Soundboard listener removed - now handled globally in App.tsx

  useEffect(() => {
    if (localVideoRef.current && localScreenShareStream) {
      localVideoRef.current.srcObject = localScreenShareStream;
      localVideoRef.current.play().catch(console.error);
      
      // Use requestVideoFrameCallback if available to keep the track active
      // This tells the browser the video is being actively consumed for rendering
      if ('requestVideoFrameCallback' in localVideoRef.current) {
        const video = localVideoRef.current;
        const callback = () => {
          if (localScreenShareStream.active && localVideoRef.current === video) {
            (video as any).requestVideoFrameCallback(callback);
          }
        };
        (video as any).requestVideoFrameCallback(callback);
      }
    } else if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [localScreenShareStream]);

  useEffect(() => {
    let wakeLock: any = null;
    
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && connectedVoiceChannelId) {
          // Check if permission is allowed by policy
          const status = await (navigator as any).permissions.query({ name: 'screen-wake-lock' }).catch(() => null);
          if (status && status.state === 'denied') {
            console.warn("Wake Lock permission denied by policy.");
            return;
          }
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err: any) {
        // Only log if it's not a policy error, as those are often expected in iframes
        if (err.name !== 'NotAllowedError' && !err.message?.includes('permissions policy')) {
          console.error("Wake Lock error:", err);
        } else {
          console.warn("Wake Lock blocked by permissions policy (common in iframes).");
        }
      }
    };

    if (connectedVoiceChannelId) {
      requestWakeLock();
    }

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release().catch(console.error);
      }
    };
  }, [connectedVoiceChannelId]);

  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser) return;

    setCallDuration(0);
    setIsCall(false);

    const fetchChannelInfo = async () => {
      // Fetch channel name
      const { data: channel } = await supabase.from('channels').select('name').eq('id', connectedVoiceChannelId).maybeSingle();
      if (channel) {
        setChannelName(channel.name);
        setIsCall(false);
      } else {
        // Might be a DM call
        const { data: dm } = await supabase.from('dms').select('*').eq('id', connectedVoiceChannelId).maybeSingle();
        if (dm) {
          setIsCall(true);
          const otherIds = dm.participants.filter((id: string) => id !== currentUser.id);
          let names = [];
          for (const id of otherIds) {
            if (!id) continue;
            const { data: profile } = await supabase.from('profiles').select('username, display_name').eq('id', id).maybeSingle();
            if (profile) {
              names.push(profile.username || profile.display_name);
            }
          }
          setChannelName(names.join(', ') || t('voice.privateCall'));
        }
      }
    };

    fetchChannelInfo();

    const channelName = `voice_panel_channel_${connectedVoiceChannelId}_${currentUser.id}_${Math.random().toString(36).substring(7)}`;
    const channelSub = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `id=eq.${connectedVoiceChannelId}` }, () => fetchChannelInfo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dms', filter: `id=eq.${connectedVoiceChannelId}` }, () => fetchChannelInfo())
      .subscribe();

    return () => {
      supabase.removeChannel(channelSub);
    };
  }, [connectedVoiceChannelId, currentUser]);

  useEffect(() => {
    if (!connectedVoiceChannelId || !currentUser || !isScreenSharing) {
      setStreamViewers([]);
      return;
    }

    const myUid = currentUser.id;
    
    const viewers = voiceParticipants
      .filter((p: any) => p.id !== myUid && Array.isArray(p.viewingStreams) && p.viewingStreams.includes(myUid))
      .map(p => ({
        id: p.id,
        name: p.name
      }));
    
    setStreamViewers(viewers);
  }, [connectedVoiceChannelId, isScreenSharing, currentUser, voiceParticipants]);

  useEffect(() => {
    let interval: any;
    if (connectedVoiceChannelId && isCall) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connectedVoiceChannelId, isCall]);

  // Outgoing ringtone logic
  useEffect(() => {
    if (!connectedVoiceChannelId || !isCall || !currentUser) {
      stopRingtone();
      return;
    }

    let isCaller = false;

    const checkCaller = async () => {
      const { data: call } = await supabase.from('calls').select('caller_id').eq('id', connectedVoiceChannelId).maybeSingle();
      if (call && call.caller_id === currentUser.id) {
        isCaller = true;
        if (voiceParticipants.length === 1) {
          playRingtone();
        }
      }
    };

    checkCaller();

    if (voiceParticipants.length === 1 && isCaller) {
      playRingtone();
    } else if (voiceParticipants.length > 1) {
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
  }, [connectedVoiceChannelId, isCall, currentUser, voiceParticipants.length]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDisconnect = async () => {
    playDisconnectSound();
    // We don't need to delete from calls table here, it should be handled by the server or left as is
    // since it's a persistent record of the call.
    setConnectedVoiceChannelId(null);
  };

  const toggleMute = () => {
    if (isDeafened) return; // Cannot unmute if deafened
    
    if (isVoiceMuted) {
      playUnmuteSound();
    } else {
      playMuteSound();
    }
    setIsVoiceMuted(!isVoiceMuted);
  };

  const toggleDeafen = () => {
    if (isDeafened) {
      playUndeafenSound();
      setIsDeafened(false);
    } else {
      playDeafenSound();
      setIsDeafened(true);
      if (!isVoiceMuted) {
        setIsVoiceMuted(true); // Deafening also mutes
      }
    }
  };

  const handleScreenShare = async (quality: { width: number, height: number, frameRate: number }, sourceId?: string) => {
    try {
      const isElectron = navigator.userAgent.toLowerCase().includes('electron');
      let stream: MediaStream;

      if (isElectron && sourceId) {
        console.log("Attempting Electron screen share with source:", sourceId);
        
        // Add a small delay to ensure the picker modal is fully closed and system is ready
        await new Promise(resolve => setTimeout(resolve, 300));

        const isScreen = sourceId.startsWith('screen:');
        
        try {
          if (!isScreen) throw new Error("Audio capture is only supported for entire screens");
          
          // Attempt 1: Video + System Audio
          // CRITICAL: audio constraint must NOT have chromeMediaSourceId, only chromeMediaSource
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop'
              }
            },
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
          console.log("Electron video+audio stream obtained successfully");
        } catch (err) {
          console.warn("Could not start with audio, falling back to video only.", err);
          
          // Attempt 2: Video Only
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
          console.log("Electron video-only stream obtained successfully");
        }
      } else {
        // Browser standard capture
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: quality.width },
            height: { ideal: quality.height },
            frameRate: { ideal: quality.frameRate },
            displaySurface: 'browser',
            surfaceSwitching: 'include',
            selfBrowserSurface: 'include',
            systemAudio: 'include'
          } as any,
          audio: true
        });
      }
      
      console.log("Screen share stream obtained:", stream.id);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        if ('contentHint' in videoTrack) {
          (videoTrack as any).contentHint = 'motion';
        }
      }
      
      playScreenShareStartSound();
      setScreenShareQuality(quality);
      setShowQualityMenu(false);
      setShowPicker(false);
      
      const useAppStoreState = useAppStore.getState();
      useAppStoreState.setLocalScreenShareStream(stream);
      useAppStoreState.setIsScreenSharing(true);
      
      // Keep-alive interval to prevent background freezing
      const keepAliveInterval = setInterval(() => {
        if (videoTrack && videoTrack.readyState === 'live') {
          // Just accessing settings can sometimes keep the track from being throttled
          videoTrack.getSettings();
          
          // Force frame decoding to keep the track completely active even in background
          if (localVideoRef.current && localVideoRef.current.videoWidth > 0) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 1;
              canvas.height = 1;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(localVideoRef.current, 0, 0, 1, 1);
              }
            } catch (e) {
              // Ignore errors
            }
          }
        } else {
          clearInterval(keepAliveInterval);
        }
      }, 1000);
      
      stream.getVideoTracks()[0].onended = () => {
        clearInterval(keepAliveInterval);
        playScreenShareStopSound();
        useAppStore.getState().setIsScreenSharing(false);
        useAppStore.getState().setLocalScreenShareStream(null);
      };
    } catch (err) {
      console.error("Error sharing screen", err);
      useAppStore.getState().setIsScreenSharing(false);
      useAppStore.getState().setLocalScreenShareStream(null);
    }
  };

  const startScreenShareFlow = (quality: { width: number, height: number, frameRate: number }) => {
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');
    if (isElectron) {
      setPendingQuality(quality);
      setShowPicker(true);
      setShowQualityMenu(false);
    } else {
      handleScreenShare(quality);
    }
  };

  const toggleScreenShare = () => {
    if (window.innerWidth < 768) return; // Prevent on mobile
    
    if (isScreenSharing) {
      playScreenShareStopSound();
      setIsScreenSharing(false);
      setViewingScreenShares(new Set());
      setActiveStreamFocus(null);
      // The stream will be stopped by WebRTCManager or here
      const stream = useAppStore.getState().localScreenShareStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        useAppStore.getState().setLocalScreenShareStream(null);
      }
    } else {
      setShowQualityMenu(!showQualityMenu);
    }
  };

  const stopWatchingAll = () => {
    setViewingScreenShares(new Set());
    setActiveStreamFocus(null);
  };

  if (!connectedVoiceChannelId) return null;

  const handlePanelClick = () => {
    if (isCall && connectedVoiceChannelId) {
      setSelectedServerId(null);
      setSelectedDmId(connectedVoiceChannelId);
    }
  };

  const isAfk = channelName.endsWith(' [AFK]');
  const displayChannelName = isAfk ? channelName.replace(' [AFK]', '') : channelName;

  return (
    <div className="bg-zinc-950 border-t border-zinc-800 p-2 flex flex-col gap-2 shrink-0 relative">
      {/* Hidden video to keep screen share alive */}
      <video ref={localVideoRef} autoPlay playsInline muted className="absolute w-[1px] h-[1px] opacity-0 pointer-events-none" />
      
      <div className="hidden md:flex items-center justify-between px-2">
        <div 
          className={clsx(
            "flex items-center gap-2 text-emerald-500",
            isCall && "cursor-pointer hover:opacity-80 transition-opacity"
          )}
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
            className={`w-full flex items-center justify-center py-1.5 rounded-md transition-colors ${isScreenSharing ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'} ${isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isScreenSharing ? t('voice.stopSharing') : (isAfk ? t('voice.afkRestricted') : t('voice.shareScreen'))}
          >
            {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
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
          title={isAfk ? t('voice.afkRestricted') : ''}
        >
          {isVoiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button 
          onClick={toggleDeafen}
          disabled={isAfk}
          className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors ${isDeafened ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'} ${isAfk ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isAfk ? t('voice.afkRestricted') : ''}
        >
          {isDeafened ? <HeadphonesIcon className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>
        {!isCall && (
          <button 
            onClick={() => setShowSoundboard(!showSoundboard)}
            className={`flex-1 flex flex-col md:flex-row items-center justify-center py-1.5 rounded-md transition-colors ${showSoundboard ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'}`}
            title={t('voice.soundboard', 'Soundboard')}
          >
            <Volume2 className="w-4 h-4" />
          </button>
        )}
        <button 
          onClick={handleDisconnect}
          className="flex-1 md:hidden flex items-center justify-center py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-500 transition-colors"
          title={t('voice.disconnect')}
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
          <button 
            onClick={() => startScreenShareFlow({ width: 1280, height: 720, frameRate: 30 })}
            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
          >
            {t('voice.standard')}
          </button>
          <button 
            onClick={() => startScreenShareFlow({ width: 1920, height: 1080, frameRate: 60 })}
            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
          >
            {t('voice.high')}
          </button>
          <button 
            onClick={() => startScreenShareFlow({ width: 2560, height: 1440, frameRate: 60 })}
            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
          >
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

