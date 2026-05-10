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

            // Default to true for any member as requested (soundboard active for everyone by default)
            setCanUseSoundboard(true);

            // If we want to keep role-based overrides (but in additive way, it's already true)
            // If they are owner or have certain perms, they might have "Manage" rights too (handled in components)
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
