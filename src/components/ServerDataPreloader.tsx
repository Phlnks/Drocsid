import { useEffect } from 'react';
import { supabase } from '../supabase';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import { getAudioUrl } from '../lib/audioCache';

export default function ServerDataPreloader() {
  const { selectedServerId, setServerSounds, setCanUseSoundboard } = useAppStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!selectedServerId) {
      setServerSounds([]);
      setCanUseSoundboard(false);
      return;
    }

    let isMounted = true;

    const fetchServerData = async () => {
      try {
        // Fetch server sounds
        const { data: server } = await supabase
          .from('servers')
          .select('soundboard_sounds')
          .eq('id', selectedServerId)
          .maybeSingle();

        if (!isMounted) return;

        let sounds: any[] = [];
        if (server && server.soundboard_sounds) {
          sounds = server.soundboard_sounds;
          setServerSounds(sounds);
          
          // Preload sounds in background
          sounds.forEach((sound: any) => {
            getAudioUrl(sound.url).catch(() => {});
          });
        } else {
          setServerSounds([]);
        }

        // Fetch permissions
        if (user) {
          const { data: member } = await supabase
            .from('server_members')
            .select('roles')
            .eq('server_id', selectedServerId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!isMounted) return;

          if (member) {
            // Fetch server owner
            const { data: serverInfo } = await supabase
              .from('servers')
              .select('owner_id')
              .eq('id', selectedServerId)
              .maybeSingle();

            if (!isMounted) return;

            if (serverInfo?.owner_id === user.id) {
              setCanUseSoundboard(true);
            } else if (member.roles && member.roles.length > 0) {
              const { data: roles } = await supabase
                .from('server_roles')
                .select('permissions')
                .in('id', member.roles);
              
              if (!isMounted) return;

              if (roles) {
                const hasPerm = roles.some(r => 
                  r.permissions?.includes('USE_SOUNDBOARD') || 
                  r.permissions?.includes('ADMINISTRATOR') ||
                  r.permissions?.includes('MANAGE_SERVER')
                );
                setCanUseSoundboard(!!hasPerm);
              } else {
                setCanUseSoundboard(false);
              }
            } else {
              setCanUseSoundboard(false);
            }
          } else {
            setCanUseSoundboard(false);
          }
        } else {
          setCanUseSoundboard(false);
        }
      } catch (error) {
        console.error("ServerDataPreloader: Error fetching data:", error);
      }
    };

    fetchServerData();

    return () => {
      isMounted = false;
    };
  }, [selectedServerId, user, setServerSounds, setCanUseSoundboard]);

  return null;
}
