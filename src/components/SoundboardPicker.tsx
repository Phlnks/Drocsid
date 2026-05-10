import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, VolumeX, Volume1, Search, X, Smile, Play } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import socket from '../lib/socket';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

import { getAudioUrl } from '../lib/audioCache';

interface SoundboardPickerProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  serverId: string | null;
}

export default function SoundboardPicker({ isOpen, onClose, channelId, serverId }: SoundboardPickerProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { 
    setServerSettingsModal, 
    soundboardVolume, 
    isSoundboardMuted, 
    setSoundboardVolume, 
    setIsSoundboardMuted,
    serverSounds: sounds,
    canUseSoundboard
  } = useAppStore();
  const [search, setSearch] = useState('');
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setShowVolumeSlider(false); // Reset when reopening
  }, [isOpen]);

  const playSound = (sound: any) => {
    console.log("Soundboard: playSound called", { 
      soundName: sound.name, 
      canUseSoundboard, 
      hasCurrentAudio: !!currentAudio,
      channelId,
      userId: user?.id 
    });

    if (!canUseSoundboard) {
      console.warn("Soundboard: No permission to play sound");
      return;
    }
    
    if (currentAudio) {
      console.warn("Soundboard: Already playing a sound, ignoring click");
      return;
    }

    // Emit event to server
    console.log("Soundboard: Emitting play-soundboard-sound event to server");
    socket.emit('play-soundboard-sound', {
      soundId: sound.name,
      channelId,
      userId: user?.id,
      soundUrl: sound.url
    });

    // We can also play it locally immediately for feedback
    previewSound(sound.url);
  };

  const previewSound = async (url: string) => {
    console.log("Soundboard: previewSound called for", url);
    if (isSoundboardMuted) {
      console.log("Soundboard: Sound is muted locally, not playing preview");
      return;
    }

    if (currentAudio) {
      console.log("Soundboard: Stopping previous preview");
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    
    setCurrentAudioUrl(url);

    // Utiliser le cache blob si possible, ou fallback url
    const blobUrl = await getAudioUrl(url).catch(() => url);

    const audio = new Audio(blobUrl);
    audio.volume = soundboardVolume;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log("Soundboard: Local preview started");
        })
        .catch(err => {
          console.error("Soundboard: Local preview failed", err);
          setCurrentAudio(null);
          setCurrentAudioUrl(null);
        });
    }

    setCurrentAudio(audio);
    audio.onended = () => {
      console.log("Soundboard: Local preview ended");
      setCurrentAudio(null);
      setCurrentAudioUrl(null);
    };
    audio.onerror = (e) => {
      console.error("Soundboard: Local preview audio error", e);
      setCurrentAudio(null);
    };
  };

  if (!isOpen) {
    return null;
  }

  const filteredSounds = sounds.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[300px] h-[400px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl flex flex-col overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2 relative">
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
            className={clsx(
              "transition-colors group", 
              isSoundboardMuted ? "text-red-400 hover:text-red-300" : "text-zinc-400 hover:text-zinc-100"
            )}
            title={t('soundboard.volumeControl', 'Volume de la soundboard')}
          >
            {isSoundboardMuted || soundboardVolume === 0 ? <VolumeX className="w-4 h-4 transition-transform group-hover:scale-110" /> : 
             soundboardVolume < 0.5 ? <Volume1 className="w-4 h-4 transition-transform group-hover:scale-110" /> : 
             <Volume2 className="w-4 h-4 transition-transform group-hover:scale-110" />}
          </motion.button>
          
          <span className="text-sm font-bold text-zinc-100">{t('soundboard.title', 'Soundboard')}</span>
          
          <AnimatePresence>
            {showVolumeSlider && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute top-full left-0 mt-2 p-3 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl flex items-center gap-3 z-[110]"
              >
               <button 
                 onClick={() => setIsSoundboardMuted(!isSoundboardMuted)}
                 className={clsx("p-1 rounded transition-colors", isSoundboardMuted ? "text-red-400 bg-red-400/10" : "text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700")}
               >
                 {isSoundboardMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
               </button>
               <input 
                 type="range"
                 min="0"
                 max="1"
                 step="0.01"
                 value={soundboardVolume}
                 onChange={(e) => setSoundboardVolume(parseFloat(e.target.value))}
                 className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
               />
               <span className="text-[10px] text-zinc-400 font-mono w-6 text-right">
                 {Math.round(soundboardVolume * 100)}%
               </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder={t('soundboard.searchPlaceholder', 'Rechercher un son...')}
            className="w-full bg-zinc-950 text-zinc-200 text-sm pl-8 pr-3 py-1.5 rounded-md border-none focus:ring-1 focus:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {!canUseSoundboard ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <X className="w-8 h-8 text-red-500/50 mb-2" />
            <p className="text-sm text-zinc-400">{t('soundboard.noPermission', 'Tu n\'as pas la permission d\'utiliser le soundboard.')}</p>
          </div>
        ) : filteredSounds.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {filteredSounds.map((sound, index) => {
              const isPlaying = currentAudioUrl === sound.url;
              return (
                <button
                  key={index}
                  onClick={() => playSound(sound)}
                  className={clsx(
                    "flex flex-col items-center gap-1 p-2 rounded-md transition-colors group relative",
                    isPlaying ? "bg-indigo-500/20" : "hover:bg-zinc-800",
                    currentAudio && !isPlaying && "opacity-50 grayscale"
                  )}
                >
                  <div className={clsx(
                    "w-12 h-12 bg-zinc-800 flex items-center justify-center text-2xl rounded-lg transition-all relative group/sound",
                    isPlaying && "ring-2 ring-indigo-500 scale-110"
                  )}>
                    {sound.emoji || '🔊'}
                  </div>
                  <span className={clsx(
                    "text-[10px] font-medium truncate w-full text-center transition-colors",
                    isPlaying ? "text-indigo-400" : "text-zinc-400 group-hover:text-zinc-200"
                  )}>
                    {sound.name}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <Smile className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-sm text-zinc-500">{t('soundboard.noSounds', 'Aucun son trouvé.')}</p>
          </div>
        )}
      </div>

      <div className="p-3 bg-zinc-950/50 border-t border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between">
        <span>{canUseSoundboard ? t('soundboard.ready', 'Prêt à jouer') : t('soundboard.restricted', 'Accès restreint')}</span>
        <button 
           onClick={() => {
             if (serverId) {
               setServerSettingsModal({ isOpen: true, serverId, initialTab: 'soundboard' });
               onClose();
             }
           }}
           className="text-indigo-400 hover:underline"
        >
          {t('soundboard.manage', 'Gérer')}
        </button>
      </div>
    </div>
  );
}
