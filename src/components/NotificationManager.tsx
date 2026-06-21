import { useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { playMessageSound } from '../lib/sounds';

const dmParticipantsCache = new Map<string, { participants: string[], fetchedAt: number }>();
const CACHE_TTL = 60000; // 1 minute

async function isParticipantWithCache(dmId: string, userId: string): Promise<boolean> {
  const cached = dmParticipantsCache.get(dmId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.participants.includes(userId);
  }

  const { data: dm } = await supabase.from('dms').select('participants').eq('id', dmId).maybeSingle();
  if (!dm || !dm.participants) return false;

  dmParticipantsCache.set(dmId, { participants: dm.participants, fetchedAt: Date.now() });
  return dm.participants.includes(userId);
}

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
         (window as any).electron.showNotification(title, body, '/favicon.png');
      } else if ('Notification' in window && Notification.permission === 'granted') {
         new Notification(title, { body, icon: '/favicon.png', badge: '/favicon.png' });
      }
    };

    // Subscribe to notifications globally
    const notifChannelName = `global_notifs_${user.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${notifChannelName}`) supabase.removeChannel(c);
      if (c.topic === `realtime:global_messages_${user.id}`) supabase.removeChannel(c);
    });

    // 1) Notifications table (Mentions, DMs, requests, etc.)
    const notifSub = supabase.channel(notifChannelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, async (payload) => {
        const n = payload.new as any;
        
        let nData = n.data;
        if (typeof nData === 'string') {
          try {
            nData = JSON.parse(nData);
          } catch(e) {}
        }
        
        // Don't notify if server is muted
        const serverId = nData?.server_id || n.server_id;
        const channelId = nData?.channel_id || n.channel_id;
        if (serverId && mutedServers.includes(serverId)) return;

        // Apply notification preferences
        if (n.type === 'mention' && !notificationSettings.notifyMentions) return;
        const isDmType = n.type === 'dm' || (n.type === 'reply' && nData?.is_dm);
        if (isDmType && !notificationSettings.notifyDms) return;

        // For DMs, check if it's muted or currently being viewed
        if (isDmType && channelId) {
          if (mutedDms.includes(channelId)) return;
          const windowIsFocused = document.hasFocus();
          if (selectedDmId === channelId && windowIsFocused) return;
        }

        if (!n.notified) {
          if (notificationSettings.sounds && n.type !== 'reaction') {
            playMessageSound();
          }
          
          const authorName = nData?.author_name || n.author_name || 'Utilisateur';
          const content = nData?.content || n.content || '';
          
          let title = 'Notification';
          let finalContent = content;
          if (n.type === 'mention') title = `Mention de ${authorName}`;
          else if (n.type === 'reply') title = `${authorName} a répondu à votre message`;
          else if (n.type === 'dm') title = `Nouveau message de ${authorName}`;
          else if (n.type === 'reaction') title = `${authorName} a réagi à votre message : ${content}`;
          else if (n.type === 'friend_request') title = `Demande d'ami de ${authorName}`;
          else if (n.type === 'friend_accept') {
             title = `${authorName} a accepté votre demande d'ami`;
             finalContent = '';
          }

          showDesktopNotification(title, finalContent);
          
          supabase.from('notifications').update({ notified: true }).eq('id', n.id).then();
        }
      })
      .subscribe();

    // 2) Global Messages for "Simple chat messages"
    // Listen to all new messages inserted (RLS will filter to where the user is a member, ideally)
    const messagesSub = supabase.channel(`global_messages_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        if (!notificationSettings.notifyChatMessages) return;

        const message = payload.new as any;
        if (message.author_id === user.id) return; // Don't notify for own messages

        // We only want 'simple' messages here. Mentions/Replies are handled by the notifications table.
        // But since we can't easily know if we are mentioned without parsing, we can just notify. 
        // If they have notifyChatMessages enabled, it overrides everything anyway.
        
        // Don't notify if the server is muted (we need to fetch the server id of this channel if not in cache)
        // This is a bit heavy for global, but we can do a quick check via channel id
        if (selectedChannelId === message.channel_id && document.hasFocus()) return;

        // Fetch author name
        const { data: profile } = await supabase.from('profiles').select('username, display_name').eq('id', message.author_id).maybeSingle();
        const authorName = profile?.display_name || profile?.username || 'Utilisateur';
        
        if (notificationSettings.sounds) {
          playMessageSound();
        }
        
        showDesktopNotification(`Nouveau message de ${authorName}`, message.content);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notifSub);
      supabase.removeChannel(messagesSub);
    };
  }, [user, selectedDmId, notificationSettings]);

  return null;
}
