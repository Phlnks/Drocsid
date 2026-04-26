import { useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { playMessageSound } from '../lib/sounds';

export default function NotificationManager() {
  const { user } = useAuthStore();
  const { selectedChannelId, selectedDmId, notificationSettings, mutedServers, mutedDms } = useAppStore();

  useEffect(() => {
    if (!user) return;

    // Request Notification permission (web)
    if (notificationSettings.desktop && 'Notification' in window && Notification.permission === 'default' && !(window as any).electron) {
      Notification.requestPermission();
    }

    const showDesktopNotification = (title: string, body?: string) => {
      if (!notificationSettings.desktop) return;
      if ((window as any).electron) {
         (window as any).electron.showNotification(title, body);
      } else if ('Notification' in window && Notification.permission === 'granted') {
         new Notification(title, { body });
      }
    };

    // Subscribe to new DM messages (RLS ensures we only get our own DMs)
    const dmMessagesSub = supabase.channel(`global_dm_messages_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, async (payload) => {
        const message = payload.new as any;
        
        // Don't notify if user is the author or if DM is muted
        if (message.author_id === user.id || mutedDms.includes(message.dm_id)) return;

        // If mentions only preference is on, DMs are still special but we can apply logic if needed. 
        // Typically DMs always notify unless muted.

        // Note: we can't fully rely on document.hasFocus() in an effect, but we check it at the time of the event
        const windowIsFocused = document.hasFocus();
        const isCurrentlyViewed = selectedDmId === message.dm_id;

        if (!isCurrentlyViewed || !windowIsFocused) {
          if (notificationSettings.sounds) {
            playMessageSound();
          }
          
          const { data: profile } = await supabase.from('profiles').select('username').eq('id', message.author_id).maybeSingle();
          const authorName = profile?.username || 'Somebody';
          
          showDesktopNotification(`Nouveau message de ${authorName}`, message.content);
        }
      })
      .subscribe();

    // Subscribe to mentions in the notifications table globally
    const notifSub = supabase.channel(`global_notifs_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const n = payload.new as any;
        
        // Don't notify if server is muted
        if (n.server_id && mutedServers.includes(n.server_id)) return;

        if (!n.notified) {
          // If preference is 'mentions', we only notify if it's actually an @mention (which is what this table stores)
          // If we had a global message listener for channels, we'd filter there too.

          if (notificationSettings.sounds) {
            playMessageSound();
          }
          
          showDesktopNotification(`Mention de ${n.author_name}`, n.content);
          
          // Mark as notified so we don't trigger it again
          supabase.from('notifications').update({ notified: true }).eq('id', n.id).then();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dmMessagesSub);
      supabase.removeChannel(notifSub);
    };
  }, [user, selectedDmId, notificationSettings]);

  return null;
}
