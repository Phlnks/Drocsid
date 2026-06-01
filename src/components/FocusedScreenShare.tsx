import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabase';
import VideoPlayer from './VideoPlayer';
import { Minimize2, X } from 'lucide-react';

export default function FocusedScreenShare() {
  const { user: currentUser } = useAuthStore();
  const {
    activeStreamFocus,
    setActiveStreamFocus,
    remoteScreenShares,
    remoteScreenShareAudioTracks,
    localScreenShareStream,
    setViewingScreenShares,
    streamVolume,
    isStreamVolumeMuted,
    isDeafened,
    setStreamVolume,
    setIsStreamVolumeMuted,
  } = useAppStore();

  const [streamerName, setStreamerName] = useState('Utilisateur');

  const isOwnStream = activeStreamFocus === currentUser?.id;

  const stream = isOwnStream
    ? localScreenShareStream
    : (activeStreamFocus ? remoteScreenShares[activeStreamFocus] : null);

  const hasSeparateRemoteAudio =
    !!activeStreamFocus &&
    !isOwnStream &&
    !!remoteScreenShareAudioTracks[activeStreamFocus];

  useEffect(() => {
    if (activeStreamFocus && activeStreamFocus !== currentUser?.id) {
      supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', activeStreamFocus)
        .single()
        .then(({ data }) => {
          if (data) {
            setStreamerName(data.username || data.display_name || 'Utilisateur');
          }
        });
    } else if (activeStreamFocus === currentUser?.id) {
      setStreamerName("Votre partage d'écran");
    } else {
      setStreamerName('Utilisateur');
    }
  }, [activeStreamFocus, currentUser]);

  if (!stream || !activeStreamFocus) return null;

  const handleClose = () => {
    setActiveStreamFocus(null);
    setViewingScreenShares(prev => {
      const next = new Set(prev);
      next.delete(activeStreamFocus);
      return next;
    });

    if (window.innerWidth < 768) {
      useAppStore.getState().setIsMobileNavOpen(true);
    }
  };

  const handleMinimize = () => {
    setActiveStreamFocus(null);
  };

  return (
    <div className="flex-1 bg-black flex flex-col min-w-0 relative">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-20 flex items-center justify-between md:opacity-0 md:hover:opacity-100 opacity-100 transition-opacity">
        <div className="text-white font-medium drop-shadow-md truncate mr-2">
          Stream de {streamerName}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleMinimize}
            className="hidden md:block p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
            title="Réduire"
          >
            <Minimize2 className="w-5 h-5" />
          </button>

          <button
            onClick={handleClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg"
            title="Fermer le stream"
          >
            <span className="text-xs font-bold md:hidden">Quitter</span>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <VideoPlayer
          stream={stream}
          muted={isOwnStream}
          showVolumeControls={!isOwnStream}
          forceHasAudio={hasSeparateRemoteAudio}
          externalVolume={streamVolume}
          externalMuted={isStreamVolumeMuted || isDeafened}
          onVolumeChange={setStreamVolume}
          onToggleMuted={() => setIsStreamVolumeMuted(!isStreamVolumeMuted)}
          controlsMode="always"
        />
      </div>
    </div>
  );
}