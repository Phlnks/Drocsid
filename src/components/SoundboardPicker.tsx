import { useState, useEffect } from 'react';
import { Volume2, Search, X, Smile } from 'lucide-react';
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
  const { setServerSettingsModal } = useAppStore();
  const [search, setSearch] = useState('');
  const [sounds, setSounds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [canUseSoundboard, setCanUseSoundboard] = useState(false);

  useEffect(() => {
    if (!isOpen || !serverId) return;

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
            // Check if owner or has USE_SOUNDBOARD / ADMINISTRATOR
            const { data: serverInfo } = await supabase.from('servers').select('owner_id').eq('id', serverId).maybeSingle();
            const isOwner = serverInfo?.owner_id === user.id;

            if (isOwner) {
              setCanUseSoundboard(true);
            } else {
              const { data: roles } = await supabase.from('roles').select('*').in('id', member.roles || []);
              const hasPerm = roles?.some(r => r.permissions?.includes('USE_SOUNDBOARD') || r.permissions?.includes('ADMINISTRATOR'));
              setCanUseSoundboard(!!hasPerm);
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
    const audio = new Audio(sound.url);
    audio.play().catch(console.error);
    
    // Optionally close picker or keep it open for multi-sound
    // onClose();
  };

  if (!isOpen) return null;

  const filteredSounds = sounds.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[300px] h-[400px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl flex flex-col overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-bold text-zinc-100">{t('soundboard.title', 'Soundboard')}</span>
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
