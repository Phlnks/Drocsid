import { useState, useEffect } from 'react';
import { Volume2, VolumeX, Volume1, Search, X, Smile } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import socket from '../lib/socket';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

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
    setIsSoundboardMuted 
  } = useAppStore();
  const [search, setSearch] = useState('');
  const [sounds, setSounds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [canUseSoundboard, setCanUseSoundboard] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  useEffect(() => {
    if (!isOpen || !serverId) return;
    setShowVolumeSlider(false); // Reset when reopening

    const fetchSoundsAndPerms = async () => {
      setIsLoading(true);
      try {
        // Fetch server for sounds
        const { data: server } = await supabase.from('servers').select('soundboard_sounds').eq('id', serverId).maybeSingle();
        if (server && server.soundboard_sounds) {
          setSounds(server.soundboard_sounds);
        }

        // Check permissions
        if (user) {
          const { data: member } = await supabase.from('server_members').select('roles').eq('server_id', serverId).eq('user_id', user.id).maybeSingle();
          if (member) {
            // Fetch server owner
            const { data: serverInfo } = await supabase.from('servers').select('owner_id').eq('id', serverId).maybeSingle();
            const isOwner = serverInfo?.owner_id === user.id;

            if (isOwner) {
              setCanUseSoundboard(true);
            } else {
              // Fetch all roles for this server to avoid "in" query issues
              const { data: allRoles } = await supabase.from('roles').select('*').eq('server_id', serverId);
              
              if (allRoles) {
                // Filter roles that the member actually has
                const memberRoleIds = member.roles || [];
                const memberRoles = allRoles.filter(r => memberRoleIds.includes(r.id));
                
                const hasPerm = memberRoles.some(r => 
                  r.permissions?.includes('USE_SOUNDBOARD') || 
                  r.permissions?.includes('ADMINISTRATOR') ||
                  r.permissions?.includes('MANAGE_SERVER')
                );
                setCanUseSoundboard(!!hasPerm);
              } else {
                setCanUseSoundboard(false);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching soundboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSoundsAndPerms();
  }, [isOpen, serverId, user]);

  const playSound = (sound: any) => {
    if (!canUseSoundboard) return;

    // Emit event to server
    socket.emit('play-soundboard-sound', {
      soundId: sound.name,
      channelId,
      userId: user?.id,
      soundUrl: sound.url
    });

    // We can also play it locally immediately for feedback
    if (!isSoundboardMuted) {
      const audio = new Audio(sound.url);
      audio.volume = soundboardVolume;
      audio.play().catch(console.error);
    }
    
    // Optionally close picker or keep it open for multi-sound
    // onClose();
  };

  if (!isOpen) return null;

  const filteredSounds = sounds.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[300px] h-[400px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl flex flex-col overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2 relative">
          <button 
            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
            className={clsx(
              "transition-colors", 
              isSoundboardMuted ? "text-red-400 hover:text-red-300" : "text-zinc-400 hover:text-zinc-100"
            )}
            title={t('soundboard.volumeControl', 'Volume de la soundboard')}
          >
            {isSoundboardMuted || soundboardVolume === 0 ? <VolumeX className="w-4 h-4" /> : 
             soundboardVolume < 0.5 ? <Volume1 className="w-4 h-4" /> : 
             <Volume2 className="w-4 h-4" />}
          </button>
          
          <span className="text-sm font-bold text-zinc-100">{t('soundboard.title', 'Soundboard')}</span>
          
          {showVolumeSlider && (
            <div className="absolute top-full left-0 mt-2 p-3 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl flex items-center gap-3 z-[110] animate-in fade-in zoom-in-95 duration-100">
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
            </div>
          )}
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
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : !canUseSoundboard ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <X className="w-8 h-8 text-red-500/50 mb-2" />
            <p className="text-sm text-zinc-400">{t('soundboard.noPermission', 'Tu n\'as pas la permission d\'utiliser le soundboard.')}</p>
          </div>
        ) : filteredSounds.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {filteredSounds.map((sound, index) => (
              <button
                key={index}
                onClick={() => playSound(sound)}
                className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-zinc-800 transition-colors group relative"
              >
                <div className="w-12 h-12 bg-zinc-800 flex items-center justify-center text-2xl rounded-lg group-hover:scale-110 transition-transform">
                  {sound.emoji || '🔊'}
                </div>
                <span className="text-[10px] text-zinc-400 font-medium truncate w-full text-center group-hover:text-zinc-200">
                  {sound.name}
                </span>
              </button>
            ))}
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
