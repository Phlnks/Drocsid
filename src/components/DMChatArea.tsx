import React, { useEffect, useState, useRef, lazy, Suspense, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { User, FileIcon, Download, Pencil, Trash2, SmilePlus, Reply, UserPlus, Users, ArrowDown, ArrowLeft, Check, CheckCheck, Loader2, Pin, Bell, Plus } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { fr, enUS, es } from 'date-fns/locale';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
const EmojiPicker = lazy(() => import('emoji-picker-react'));
import { useTranslation } from 'react-i18next';
import MessageInput from './MessageInput';
import UserAvatar from './ui/UserAvatar';
import SearchBar from './ui/SearchBar';
import UserProfileModal from './ui/UserProfileModal';
import UserContextMenu from './ui/UserContextMenu';
import VoicePlayer from './VoicePlayer';
import PollDisplay from './PollDisplay';
import AddFriendsToDMModal from './ui/AddFriendsToDMModal';
import MessageContent from './MessageContent';
import VoiceParticipants from './VoiceParticipants';
import ImageModal from './ui/ImageModal';
import PinnedMessagesPopover from './PinnedMessagesPopover';
import { playMessageSound, playConnectSound } from '../lib/sounds';
import socket from '../lib/socket';

export default function DMChatArea() {
  const { t, i18n } = useTranslation();
  const { user, currentUserProfile, setCurrentUserProfile: setLocalProfile, isImpersonating } = useAuthStore();
  const { 
    selectedDmId, 
    setSelectedDmId, 
    connectedVoiceChannelId, 
    setConnectedVoiceChannelId, 
    isRightSidebarOpen, 
    setIsRightSidebarOpen, 
    setIsMobileNavOpen, 
    highlightedMessageId: globalHighlightedMessageId, 
    setHighlightedMessageId: setGlobalHighlightedMessageId,
    voiceParticipants: voiceParticipantsMap,
    appSettings,
    onlineUserIds
  } = useAppStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUsers, setOtherUsers] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);

  const getDisplayStatus = (u: any) => {
    if (!u) return 'offline';
    if (!onlineUserIds.includes(u.id)) return 'offline';
    return u.status || 'online';
  };
  const [dmData, setDmData] = useState<any>(null);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const dmDataRef = useRef<any>(null);
  const participantsRef = useRef<string[]>([]);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [mobileActionMessageId, setMobileActionMessageId] = useState<string | null>(null);
  const touchTimerRef = useRef<any>(null);
  const [editContent, setEditContent] = useState('');
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingMessageId && editInputRef.current) {
      editInputRef.current.focus();
      // Set cursor to end
      const length = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(length, length);
      
      // Initial auto-resize
      editInputRef.current.style.height = "auto";
      editInputRef.current.style.height = `${editInputRef.current.scrollHeight}px`;
    }
  }, [editingMessageId]);

  const handleEditContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
  };

  React.useLayoutEffect(() => {
    if (editingMessageId && editInputRef.current) {
      editInputRef.current.style.height = "auto";
      editInputRef.current.style.height = `${editInputRef.current.scrollHeight}px`;
    }
  }, [editContent, editingMessageId]);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showFullEmojiPicker, setShowFullEmojiPicker] = useState<string | null>(null);
  const [emojiPickerDirection, setEmojiPickerDirection] = useState<'up' | 'down'>('up');
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if ((showEmojiPicker || showFullEmojiPicker) && emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(null);
        setShowFullEmojiPicker(null);
      }
    };

    if (showEmojiPicker || showFullEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker, showFullEmojiPicker]);

  const handleEmojiPickerToggle = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (showEmojiPicker === msgId || showFullEmojiPicker === msgId) {
      setShowEmojiPicker(null);
      setShowFullEmojiPicker(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceAbove = rect.top;
      const spaceBelow = windowHeight - rect.bottom;
      const pickerHeight = 300;

      if (spaceAbove < pickerHeight + 10 && spaceBelow > pickerHeight) {
        setEmojiPickerDirection('down');
      } else {
        setEmojiPickerDirection('up');
      }
      setShowEmojiPicker(msgId);
    }
  };
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  const [showPins, setShowPins] = useState(false);
  const [isAddFriendsModalOpen, setIsAddFriendsModalOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const showScrollButtonRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    showScrollButtonRef.current = showScrollButton;
    if (!showScrollButton) {
      setUnreadCount(0);
    }
  }, [showScrollButton]);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number | null>(null);
  const [messageLimit, setMessageLimit] = useState(50);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const loadMore = async () => {
    if (!hasMore || isFetchingMore || messages.length === 0 || !selectedDmId) return;
    
    setIsFetchingMore(true);
    const oldestTimestamp = messages[0].created_at;
    
    const { data: moreMessages, error } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('dm_id', selectedDmId)
      .lt('created_at', oldestTimestamp)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (moreMessages && moreMessages.length > 0) {
      const sorted = [...moreMessages].reverse();
      setMessages(prev => [...sorted, ...prev]);
      if (moreMessages.length < 50) setHasMore(false);
    } else {
      setHasMore(false);
    }
    setIsFetchingMore(false);
  };

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' });
  };

  const scrollToMessage = async (messageId: string) => {
    let index = messages.findIndex(m => m.id === messageId);
    
    // If message is not loaded, fetch missing gap
    if (index === -1) {
      const { data: targetMsg } = await supabase.from('dm_messages').select('created_at').eq('id', messageId).single();
      if (targetMsg) {
        const { data: gapMessages } = await supabase
          .from('dm_messages')
          .select('*')
          .eq('dm_id', selectedDmId)
          .gte('created_at', targetMsg.created_at)
          .order('created_at', { ascending: true });
          
        if (gapMessages && gapMessages.length > 0) {
          setMessages(prev => {
            const newMap = new Map(prev.map(m => [m.id, m]));
            gapMessages.forEach(m => newMap.set(m.id, m));
            return Array.from(newMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          });
          
          setTimeout(() => {
            setGlobalHighlightedMessageId(messageId);
          }, 100);
          return;
        }
      }
    }

    if (index !== -1) {
      virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  useEffect(() => {
    if (globalHighlightedMessageId) {
      setTimeout(() => {
        scrollToMessage(globalHighlightedMessageId);
        setGlobalHighlightedMessageId(null);
      }, 500);
    }
  }, [globalHighlightedMessageId]);

  const handleEditLastMessage = () => {
    const userMessages = messages.filter(m => m.author_id === user?.id);
    if (userMessages.length > 0) {
      const lastMsg = userMessages[userMessages.length - 1];
      handleEditStart(lastMsg);
    }
  };

  useEffect(() => {
    const handleGlobalEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingMessageId(null);
        setReplyingTo(null);
      }
    };
    window.addEventListener('keydown', handleGlobalEsc);
    return () => window.removeEventListener('keydown', handleGlobalEsc);
  }, []);

  const updateLastRead = useCallback(async () => {
    if (!user || !selectedDmId) return;
    const now = Date.now();
    try {
      const { data: profile } = await supabase.from('profiles').select('last_read').eq('id', user.id).single();
      const currentLastRead = profile?.last_read || {};
      const newLastRead = { ...currentLastRead, [selectedDmId]: now };
      
      // Only update if it's actually been a while or we have new messages
      // to avoid excessive DB writes. But for simplicity and real-time correctness, we do it.
      await supabase.from('profiles').update({
        last_read: newLastRead
      }).eq('id', user.id);
      
      // Update local store immediately for UI responsiveness
      setLocalProfile((prev: any) => ({ ...prev, last_read: newLastRead }));

      // Notify others immediately via socket for real-time checkmarks
      socket.emit('dm-read', {
        dmId: selectedDmId,
        userId: user.id,
        timestamp: now
      });

      // Also mark notifications for this DM as read
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .contains('data', { channel_id: selectedDmId });
    } catch (error) {
      console.error("Error updating last_read:", error);
    }
  }, [user, selectedDmId]);

  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        updateLastRead();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [updateLastRead]);

  const lastDmIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedDmId || !user) return;

    // Only reset state if DM actually changed
    if (lastDmIdRef.current === selectedDmId) {
      return;
    }
    lastDmIdRef.current = selectedDmId;

    // Reset state immediately to prevent flickering
    setMessageLimit(100);
    setHasMore(true);
    setIsFetchingMore(false);
    setIsInitialLoading(true);
    setMessages([]); 
    setReplyingTo(null);
    setShowPins(false);
    setTypingUsers([]);

    // Removed nested updateLastRead definition

    const fetchInitialData = async () => {
      // Fetch DM info
      const { data: dmData } = await supabase.from('dms').select('*').eq('id', selectedDmId).maybeSingle();
      if (dmData) {
        setDmData(dmData);
        dmDataRef.current = dmData;
        participantsRef.current = dmData.participants || [];
        const otherIds = dmData.participants.filter((id: string) => id !== user.id);
        
        if (otherIds.length === 0 && dmData.participants.includes(user.id)) {
          // Self DM / Saved Messages
          setOtherUsers([]);
          setOtherUser({ 
            id: user.id,
            username: t('friends.savedMessages'), 
            avatar_url: 'SAVED_MESSAGES_ICON',
            status: 'online',
            is_saved_messages: true
          });
        } else {
          const { data: fetchedUsers } = await supabase.from('profiles').select('*').in('id', otherIds);
          if (fetchedUsers) {
            setOtherUsers(fetchedUsers);
            if (fetchedUsers.length > 0) {
              setOtherUser(fetchedUsers[0]);
            }
          }
        }
      }

      // Fetch Users - Only fetch profiles for participants of this DM
      if (dmData && dmData.participants && dmData.participants.length > 0) {
        const { data: usersData } = await supabase.from('profiles').select('*').in('id', dmData.participants);
        if (usersData) {
          const uMap: Record<string, any> = {};
          usersData.forEach(u => uMap[u.id] = u);
          setUsersMap(uMap);

          // Get last read for this DM
          const currentUserProfile = usersData.find(u => u.id === user.id);
          if (currentUserProfile?.last_read?.[selectedDmId]) {
            setLastReadTimestamp(currentUserProfile.last_read[selectedDmId]);
          }
        }
      }

      // Fetch Messages - Get NEWEST first, then reverse
      const { data: messagesData } = await supabase
        .from('dm_messages')
        .select('*')
        .eq('dm_id', selectedDmId)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (messagesData) {
        const sortedMessages = [...messagesData].reverse();
        setMessages(sortedMessages);
        if (messagesData.length < 50) setHasMore(false);

        if (isInitialLoading) {
          if (messagesData.length > 0) {
            setTimeout(() => {
              virtuosoRef.current?.scrollToIndex({ 
                index: sortedMessages.length - 1, 
                align: 'end',
                behavior: 'auto'
              });
              setIsInitialLoading(false);
            }, 100);
          } else {
            setIsInitialLoading(false);
          }
        }
      } else if (isInitialLoading) {
        setIsInitialLoading(false);
      }
      
      setIsFetchingMore(false);
      // Update lastRead after fetching messages
      updateLastRead();
    };

    fetchInitialData();

    const handleNewMessage = (message: any) => {
      if (message.dm_id === selectedDmId) {
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, message];
        });

        if (showScrollButtonRef.current && message.author_id !== user?.id) {
          setUnreadCount(c => c + 1);
        }
        
        // Update lastRead for any new message in the active chat
        updateLastRead();

        if (message.author_id !== user.id) {
          playMessageSound();
        } else {
          setTimeout(() => {
            virtuosoRef.current?.scrollToIndex({ index: 9999999, align: 'end', behavior: 'smooth' });
          }, 100);
        }
      }
    };

    const handleUpdateMessage = (message: any) => {
      if (message.dm_id === selectedDmId) {
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message } : m));
      }
    };

    const handleDeleteMessage = (messageId: string) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const typingTimeouts: { [key: string]: NodeJS.Timeout } = {};

    const handleTyping = (data: any) => {
      if (data.channelId === selectedDmId && data.userId !== user.id) {
        setTypingUsers(prev => {
          const filtered = prev.filter(u => u.id !== data.userId);

          if (typingTimeouts[data.userId]) {
            clearTimeout(typingTimeouts[data.userId]);
          }

          if (data.isTyping) {
            typingTimeouts[data.userId] = setTimeout(() => {
              setTypingUsers(current => current.filter(u => u.id !== data.userId));
            }, 3000);
            return [...filtered, { id: data.userId, username: data.username }];
          }
          return filtered;
        });
      }
    };

    const handleDmRead = (data: any) => {
      console.log("DM Read received:", data);
      if (data.dmId === selectedDmId) {
        setUsersMap(prev => {
          const u = prev[data.userId];
          if (!u) return prev;
          return {
            ...prev,
            [data.userId]: {
              ...u,
              last_read: {
                ...(u.last_read || {}),
                [data.dmId]: data.timestamp
              }
            }
          };
        });
        
        // Force a re-render of messages if they depend on this
        setOtherUsers(prev => prev.map(u => 
          u.id === data.userId 
            ? { ...u, last_read: { ...(u.last_read || {}), [data.dmId]: data.timestamp } }
            : u
        ));
      }
    };

    const channelName = `dm_chat_${selectedDmId}_${user.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    });
    const dmSub = supabase.channel(channelName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dms', filter: `id=eq.${selectedDmId}` }, () => {
        fetchInitialData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload: any) => {
        if (participantsRef.current.includes(payload.new.id)) {
          setUsersMap(prev => ({ ...prev, [payload.new.id]: payload.new }));
          setOtherUsers(prev => prev.map(u => u.id === payload.new.id ? { ...u, ...payload.new } : u));
        }
      })
      .subscribe();

    socket.on('dm-message', handleNewMessage);
    socket.on('dm-message-updated', handleUpdateMessage);
    socket.on('dm-message-deleted', handleDeleteMessage);
    socket.on('dm-read', handleDmRead);
    socket.on('typing', handleTyping);
    socket.emit('join-channel', selectedDmId);

    return () => {
      Object.values(typingTimeouts).forEach(clearTimeout);
      socket.off('dm-message', handleNewMessage);
      socket.off('dm-message-updated', handleUpdateMessage);
      socket.off('dm-message-deleted', handleDeleteMessage);
      socket.off('dm-read', handleDmRead);
      socket.off('typing', handleTyping);
      socket.emit('leave-channel', selectedDmId);
      supabase.removeChannel(dmSub);
    };
  }, [selectedDmId, user]);

  const handleDelete = async (msgId: string) => {
    try {
      await supabase.from('dm_messages').delete().eq('id', msgId);
      socket.emit('delete-message', { id: msgId, dmId: selectedDmId, isDM: true });
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const handleEditStart = (msg: any) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content || '');
  };

  const handleEditSave = async (msgId: string) => {
    const trimmedContent = editContent.trim();
    if (!trimmedContent) return;
    try {
      const { data } = await supabase.from('dm_messages').update({
        content: trimmedContent,
        is_edited: true
      }).eq('id', msgId).select().single();
      
      if (data) {
        socket.emit('update-message', data);
      }
      setEditingMessageId(null);
    } catch (error) {
      console.error("Error updating message:", error);
    }
  };

  const handlePin = async (msgId: string, isPinned: boolean) => {
    try {
      const { data } = await supabase.from('dm_messages').update({
        is_pinned: !isPinned
      }).eq('id', msgId).select().maybeSingle();
      
      if (data) {
        socket.emit('update-message', data);
      }
    } catch (error) {
      console.error("Error pinning message:", error);
    }
  };

  const handleReaction = async (msgId: string, emoji: string, currentReactions: any) => {
    if (!user) return;
    const uid = user.id;
    
    const reactions = { ...(currentReactions || {}) };
    const users = [...(reactions[emoji] || [])];
    
    try {
      let isAdding = false;
      if (users.includes(uid)) {
        reactions[emoji] = users.filter(id => id !== uid);
      } else {
        reactions[emoji] = [...users, uid];
        isAdding = true;
      }

      // Optimistic update
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m));

      await supabase.from('dm_messages').update({
        reactions: reactions
      }).eq('id', msgId);

      socket.emit('message-reaction', {
        messageId: msgId,
        dmId: selectedDmId,
        reactions,
        isDM: true
      });

      if (isAdding) {
        const targetMsg = messages.find(m => m.id === msgId);
        if (targetMsg && targetMsg.author_id !== uid) {
          const authorProfile = usersMap[uid];
          const authorName = authorProfile?.display_name || authorProfile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Utilisateur';

          const { error: notifErr } = await supabase.from('notifications').insert({
             user_id: targetMsg.author_id,
             type: 'reaction',
             data: {
               author_id: uid,
               author_name: authorName,
               content: emoji,
               channel_id: selectedDmId,
               message_id: msgId,
               is_dm: true
             },
             read: false,
             notified: false
          });
          if (notifErr) {
            console.error("❌ [Db Notifications] DM Reaction insert failed:", notifErr);
          } else {
            console.log("✅ [Db Notifications] DM Reaction inserted for:", targetMsg.author_id);
          }
        }
      }
    } catch (error) {
      console.error("Error updating reaction:", error);
    }
    setShowEmojiPicker(null);
    setShowFullEmojiPicker(null);
  };

  const getUserData = (userId: string, fallbackName: string, fallbackAvatar: string) => {
    // Priority 1: Check usersMap (synced from profiles)
    let u = usersMap[userId];
    
    // Priority 2: If current user, check currentUserProfile from appStore or auth metadata
    if (user?.id === userId) {
      const profile = currentUserProfile || u;
      return {
        username: profile?.display_name || profile?.username || user.user_metadata?.username || user.user_metadata?.display_name || user.email?.split('@')[0] || fallbackName || 'User',
        avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || fallbackAvatar || '',
        status: profile?.status || user.user_metadata?.status || 'online',
        bio: profile?.bio || '',
        color: '#f4f4f5'
      };
    }

    return {
      username: u?.display_name || u?.username || fallbackName || 'User',
      avatarUrl: u?.avatar_url || fallbackAvatar || '',
      status: u?.status || 'offline',
      bio: u?.bio || '',
      color: '#f4f4f5'
    };
  };

  const dateLocale = i18n.language === 'fr' ? fr : i18n.language === 'es' ? es : enUS;

  const getDayLabel = (date: Date) => {
    if (isToday(date)) return t('chatArea.today');
    if (isYesterday(date)) return t('chatArea.yesterday');
    return format(date, appSettings.dateFormat, { locale: dateLocale });
  };

  const MessageSkeleton = () => (
    <div className="px-4 py-3 flex gap-4 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-zinc-700/50 flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <div className="h-4 w-24 bg-zinc-700/50 rounded" />
          <div className="h-3 w-16 bg-zinc-700/30 rounded" />
        </div>
        <div className="h-4 w-3/4 bg-zinc-700/40 rounded" />
      </div>
    </div>
  );



  const handleLeaveGroup = async () => {
    if (!user || !selectedDmId || !dmData) return;
    try {
      const newParticipants = dmData.participants.filter((id: string) => id !== user.id);
      await supabase.from('dms').update({
        participants: newParticipants
      }).eq('id', selectedDmId);
      setSelectedDmId(null);
    } catch (error) {
      console.error("Error leaving group:", error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, userId: string, username: string) => {
    e.preventDefault();
    setContextMenu({
      userId,
      username,
      x: e.clientX,
      y: e.clientY
    });
  };

  const allAttachedImages = messages.flatMap(m => 
    (m.attachments || [])
      .filter((a: any) => a.type === 'image')
      .map((a: any) => ({ url: a.url, name: a.name, messageId: m.id }))
  );

  if (!selectedDmId) {
    return (
      <div className="flex-1 bg-zinc-800 flex items-center justify-center text-zinc-500">
        {t('chatArea.selectFriend')}
      </div>
    );
  }

  if (isImpersonating) {
    return (
      <div className="flex-1 bg-zinc-800 flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-full bg-zinc-700/50 flex items-center justify-center mb-4">
          <User className="w-8 h-8 text-zinc-500" />
        </div>
        <h3 className="text-xl font-bold text-zinc-100 mb-2">
          Contenu privé masqué
        </h3>
        <p className="text-zinc-400 max-w-sm">
          Pour des raisons de confidentialité, le contenu des messages privés est inaccessible lorsque vous empruntez l'identité d'un autre utilisateur.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-zinc-800 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDmId}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex-1 flex flex-col min-h-0 relative"
        >
          <div className="h-12 border-b border-zinc-700 flex items-center justify-between px-4 shadow-sm shrink-0">
            <div className="flex items-center">
              <button 
                onClick={() => setIsMobileNavOpen(true)}
                className="md:hidden p-1.5 mr-2 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 rounded-md transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="mr-3">
                {otherUsers.length > 1 ? (
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Users className="w-5 h-5" />
                  </div>
                ) : (
                  <UserAvatar 
                    user={{
                      username: otherUser?.username || t('common.user'),
                      avatar_url: otherUser?.avatar_url,
                      status: getDisplayStatus(otherUser)
                    }} 
                    size="md" 
                  />
                )}
              </div>
              <span className="font-semibold text-zinc-100">
                {otherUsers.length > 1 
                  ? otherUsers.map(u => u.username || u.displayName).join(', ')
                  : (otherUser?.username || otherUser?.displayName || (otherUser?.is_saved_messages ? t('friends.savedMessages') : t('common.loading')))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!otherUser?.is_saved_messages && (
                <>
                  <button 
                    className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
                    title={t('friends.addFriends')}
                    onClick={() => setIsAddFriendsModalOpen(true)}
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                </>
              )}
              
              <SearchBar 
                channelId={selectedDmId!} 
                isDM={true}
                onJumpToMessage={(id) => {
                  scrollToMessage(id);
                }} 
                usersMap={usersMap} 
              />

              <div className="relative">
                <button 
                  onClick={() => setShowPins(!showPins)}
                  className={`p-2 rounded-md transition-colors ${showPins ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50'}`}
                  title={t('chatArea.pinnedMessages')}
                >
                  <Pin className="w-5 h-5" />
                </button>
                
                <AnimatePresence>
                  {showPins && (
                    <PinnedMessagesPopover 
                      channelId={selectedDmId!} 
                      isDM={true}
                      onClose={() => setShowPins(false)}
                      onJumpToMessage={(id) => {
                        scrollToMessage(id);
                        setShowPins(false);
                      }}
                      usersMap={usersMap}
                    />
                  )}
                </AnimatePresence>
              </div>

              <button 
                onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                className={`hidden md:block p-2 rounded-md transition-colors ${isRightSidebarOpen ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50'}`}
                title={t('chatArea.toggleMemberList')}
              >
                <Users className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
            {messages.length === 0 ? (
              isInitialLoading ? (
                <div className="flex-1 flex flex-col py-4 overflow-hidden bg-zinc-800">
                  {[...Array(6)].map((_, i) => (
                    <MessageSkeleton key={i} />
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-800">
                  <div className="w-20 h-20 rounded-full bg-zinc-700/30 flex items-center justify-center mb-4">
                    {otherUsers.length > 1 ? (
                      <Users className="w-10 h-10 text-zinc-500" />
                    ) : (
                      <UserAvatar 
                        user={{
                          username: otherUser?.username || t('common.user'),
                          avatar_url: otherUser?.avatar_url,
                          status: otherUser?.status || 'offline'
                        }} 
                        size="xl" 
                        showStatus={false}
                      />
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-zinc-100 mb-2">
                    {otherUsers.length > 1 
                      ? t('chatArea.welcomeToGroup', { name: otherUsers.map(u => u.username || u.displayName).join(', ') })
                      : t('chatArea.welcomeToDM', { name: otherUser?.username || otherUser?.displayName || t('common.user') })}
                  </h3>
                  <p className="text-zinc-400 max-w-sm">
                    {otherUsers.length > 1
                      ? t('chatArea.groupStartDesc')
                      : t('chatArea.dmStartDesc', { name: otherUser?.username || otherUser?.displayName || t('common.user') })}
                  </p>
                </div>
              )
            ) : (
              <Virtuoso
            ref={virtuosoRef}
            className="flex-1"
            style={{ overscrollBehaviorY: 'contain' }}
            initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
            data={messages}
            computeItemKey={(index, item) => item.id}
            increaseViewportBy={1500}
            startReached={loadMore}
            alignToBottom
            followOutput={(isAtBottom: boolean) => isAtBottom ? 'smooth' : false}
            atBottomStateChange={(atBottom) => {
              setShowScrollButton(!atBottom);
              if (atBottom) setUnreadCount(0);
            }}
            itemContent={(idx, msg) => {
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const showHeader = idx === 0 || prevMsg?.author_id !== msg.author_id || 
                (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000) ||
                !!msg.reply_to;
                
              const showDaySeparator = !prevMsg || format(new Date(prevMsg.created_at), 'yyyy-MM-dd') !== format(new Date(msg.created_at), 'yyyy-MM-dd');
              
              // Find first unread message from others
              const firstUnreadIdx = messages.findIndex(m => lastReadTimestamp && new Date(m.created_at).getTime() > lastReadTimestamp && m.author_id !== user?.id);
              const showNewSeparator = idx === firstUnreadIdx;

              const isOwner = msg.author_id === user?.id;
              const userData = getUserData(msg.author_id, msg.author_name, msg.author_avatar);
              const repliedMsg = msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null;
              
              const isRead = otherUsers.length > 0 && otherUsers.every(u => {
                const lastRead = usersMap[u.id]?.last_read?.[selectedDmId!];
                return lastRead && lastRead >= new Date(msg.created_at).getTime();
              });

              const readByUsers = otherUsers.filter(u => {
                const lastRead = usersMap[u.id]?.last_read?.[selectedDmId!];
                if (!lastRead) return false;
                
                const msgTime = new Date(msg.created_at).getTime();
                const nextMsg = messages[idx + 1];
                const nextMsgTime = nextMsg ? new Date(nextMsg.created_at).getTime() : Infinity;
                
                return msgTime <= lastRead && nextMsgTime > lastRead;
              });

              return (
                <div className="flex flex-col">
                  {showDaySeparator && (
                    <div className="flex items-center gap-4 my-6 px-4">
                      <div className="h-[1px] flex-1 bg-zinc-700/50"></div>
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider bg-zinc-800 px-2 text-center min-w-[120px]">
                        {getDayLabel(new Date(msg.created_at))}
                      </span>
                      <div className="h-[1px] flex-1 bg-zinc-700/50"></div>
                    </div>
                  )}

                  {showNewSeparator && (
                    <div className="flex items-center gap-2 my-4 px-4">
                      <div className="h-[1px] flex-1 bg-red-500/50"></div>
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest bg-zinc-800 px-2 flex items-center gap-1">
                        <Bell className="w-3 h-3" /> {t('chatArea.newMessages')}
                      </span>
                      <div className="h-[1px] flex-2 bg-red-500/50"></div>
                    </div>
                  )}

                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      type: "spring",
                      stiffness: 400,
                      damping: 30
                    }}
                    className="px-4 pb-0.5"
                  >
                    <div 
                      key={msg.id} 
                      id={`message-${msg.id}`}
                      className={`relative group flex flex-col md:hover:bg-zinc-700/30 px-2 pr-2 md:pr-24 py-0.5 -mx-2 rounded transition-colors duration-200 ${showHeader && !showDaySeparator && idx !== 0 ? 'mt-3' : ''} ${highlightedMessageId === msg.id || mobileActionMessageId === msg.id ? 'bg-zinc-700/50 md:bg-transparent md:hover:bg-zinc-700/30' : ''} ${highlightedMessageId === msg.id ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50' : ''}`}
                      onTouchStart={() => {
                        touchTimerRef.current = setTimeout(() => {
                          setMobileActionMessageId(msg.id);
                        }, 500);
                      }}
                      onTouchEnd={() => {
                        if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                      }}
                      onTouchMove={() => {
                        if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                      }}
                      onClick={() => {
                        if (mobileActionMessageId && mobileActionMessageId !== msg.id) {
                          setMobileActionMessageId(null);
                        }
                      }}
                    >
              {repliedMsg && (
                <div 
                  onClick={() => scrollToMessage(repliedMsg.id)}
                  className="flex items-center gap-2 text-xs text-zinc-400 mb-1 ml-12 relative cursor-pointer hover:text-zinc-300 group/reply before:content-[''] before:absolute before:-left-8 before:top-1/2 before:w-6 before:h-4 before:border-l-2 before:border-t-2 before:border-zinc-600 before:rounded-tl-md"
                >
                  {(() => {
                    const rData = getUserData(repliedMsg.author_id, repliedMsg.author_name, repliedMsg.author_avatar);
                    return (
                      <>
                        <UserAvatar user={rData} size="xs" showStatus={false} />
                        <span className="font-medium group-hover/reply:underline">@{rData.username}</span>
                      </>
                    );
                  })()}
                  <span className="truncate max-w-md opacity-80">{repliedMsg.content}</span>
                </div>
              )}
              
              <div className="flex gap-4">
                {showHeader ? (
                  <div 
                    className="mt-0.5 cursor-pointer"
                    onClick={() => setSelectedUser({ id: msg.author_id, ...userData })}
                    onContextMenu={(e) => handleContextMenu(e, msg.author_id, userData.username)}
                  >
                    <UserAvatar user={userData} size="lg" showStatus={false} />
                  </div>
                ) : (
                  <div className={clsx("w-10 flex-shrink-0 text-xs text-zinc-500 text-center pt-1 flex items-center justify-center gap-1 cursor-default", mobileActionMessageId === msg.id ? "opacity-100 md:opacity-0 md:group-hover:opacity-100" : "opacity-0 md:group-hover:opacity-100")}>
                    {format(new Date(msg.created_at), appSettings.timeFormat)}
                    {isOwner && (
                      isRead ? <CheckCheck className="w-3 h-3 text-blue-400" /> : <Check className="w-3 h-3 text-zinc-500" />
                    )}
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  {showHeader && (
                    <div className="flex items-baseline gap-2 mb-1">
                      <span 
                        className="font-medium cursor-pointer hover:underline text-zinc-100"
                        onClick={() => setSelectedUser({ id: msg.author_id, ...userData })}
                        onContextMenu={(e) => handleContextMenu(e, msg.author_id, userData.username)}
                      >
                        {userData.username}
                      </span>
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        {isToday(new Date(msg.created_at)) 
                          ? `${t('chatArea.today')} ${format(new Date(msg.created_at), appSettings.timeFormat)}`
                          : isYesterday(new Date(msg.created_at))
                          ? `${t('chatArea.yesterday')} ${format(new Date(msg.created_at), appSettings.timeFormat)}`
                          : format(new Date(msg.created_at), `${appSettings.dateFormat} ${appSettings.timeFormat}`)}
                        {isOwner && (
                          isRead ? <CheckCheck className="w-3 h-3 text-blue-400" /> : <Check className="w-3 h-3 text-zinc-500" />
                        )}
                      </span>
                    </div>
                  )}
                  
                  {editingMessageId === msg.id ? (
                    <div className="mt-1">
                      <textarea 
                        ref={editInputRef}
                        value={editContent}
                        onChange={handleEditContentChange}
                        className="w-full bg-zinc-900 text-zinc-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none max-h-[300px] overflow-y-auto leading-snug"
                        maxLength={2000}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleEditSave(msg.id);
                          }
                          if (e.key === 'Escape') setEditingMessageId(null);
                        }}
                      />
                      <div className="text-xs text-zinc-400 mt-1">
                        {t('chatArea.editInstructions')}
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.content && (
                        <div className="text-zinc-300 break-words whitespace-pre-wrap">
                          <MessageContent content={msg.content} usersMap={usersMap} />
                          {msg.is_edited && <span className="text-[10px] text-zinc-500 ml-2">{t('chatArea.edited')}</span>}
                        </div>
                      )}
                      {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.map((attachment: any, i: number) => {
                        let renderType = attachment.type || '';
                        
                        // Normalize standard mime types or generic strings
                        if (renderType.startsWith('image/') || renderType === 'image') {
                          renderType = 'image';
                        } else if (renderType.startsWith('audio/') || renderType.startsWith('voice/') || renderType === 'audio' || renderType === 'voice') {
                          renderType = 'audio';
                        } else if (renderType.startsWith('video/') || renderType === 'video') {
                          renderType = 'video';
                        }
                        
                        // Fallback checking by filename or URL extension if the type is still generic or not recognized
                        if (!['image', 'audio', 'video', 'voice', 'poll'].includes(renderType)) {
                          const url = attachment.url || '';
                          const name = attachment.name || '';
                          const isAudio = /\.(m4a|mp3|wav|ogg|aac|flac|opus|amr|3gp|caf|m4r)(\?.*)?$/i.test(url) || /\.(m4a|mp3|wav|ogg|aac|flac|opus|amr|3gp|caf|m4r)$/i.test(name);
                          const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|heic|tiff|svg)(\?.*)?$/i.test(url) || /\.(png|jpg|jpeg|gif|webp|bmp|heic|tiff|svg)$/i.test(name);
                          const isVideo = /\.(mp4|webm|mov|mkv|avi|3gp|m4v)(\?.*)?$/i.test(url) || /\.(mp4|webm|mov|mkv|avi|3gp|m4v)$/i.test(name);
                          
                          if (isAudio) {
                            renderType = 'audio';
                          } else if (isImage) {
                            renderType = 'image';
                          } else if (isVideo) {
                            renderType = 'video';
                          } else {
                            renderType = 'file';
                          }
                        }
                        
                        return (
                        <div key={i} className="mt-2">
                          {renderType === 'image' ? (
                            <div 
                              className="cursor-pointer inline-block min-h-[200px] min-w-[200px] bg-zinc-900/50 rounded-md animate-pulse"
                              onClick={() => setPreviewImage(attachment.url)}
                            >
                              <img 
                                src={attachment.url} 
                                alt="Attachment" 
                                className="max-w-sm max-h-80 rounded-md object-contain hover:opacity-90 transition-opacity"
                                loading="lazy"
                                onLoad={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.parentElement?.classList.remove('animate-pulse', 'min-h-[200px]', 'min-w-[200px]', 'bg-zinc-900/50');
                                }}
                              />
                            </div>
                          ) : renderType === 'video' ? (
                            <video 
                              src={attachment.url} 
                              controls 
                              className="max-w-sm max-h-80 rounded-md bg-zinc-900/50 outline-none hover:ring-2 hover:ring-indigo-500/50 transition-all"
                            />
                          ) : renderType === 'audio' || renderType === 'voice' ? (
                            <VoicePlayer url={attachment.url} filename={attachment.name} />
                          ) : renderType === 'poll' ? (
                            <PollDisplay 
                              messageId={msg.id} 
                              pollData={attachment.data} 
                              isDM={true}
                              isAuthor={msg.sender_id === user?.id}
                            />
                          ) : (
                            <a 
                              href={attachment.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              download={attachment.name || true}
                              className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-md max-w-sm hover:bg-zinc-900 transition-colors border border-zinc-700"
                            >
                              <div className="bg-indigo-500/20 p-2 rounded shrink-0">
                                <FileIcon className="w-6 h-6 text-indigo-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-200 truncate">
                                  {attachment.name || t('chatArea.attachedFile')}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {attachment.size ? (attachment.size / 1024 / 1024).toFixed(2) + ' MB' : t('chatArea.unknown')}
                                </div>
                              </div>
                              <Download className="w-5 h-5 text-zinc-400 shrink-0" />
                            </a>
                          )}
                        </div>
                      );
                    })}

                      {/* Reactions Display */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => {
                            if (!Array.isArray(users) || users.length === 0) return null;
                            const hasReacted = users.includes(user?.id);
                            const reactionUsernames = users.map((uid: string) => usersMap[uid]?.username || t('chatArea.unknownUser')).join(', ');
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(msg.id, emoji, msg.reactions)}
                                title={reactionUsernames}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors ${hasReacted ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/50' : 'bg-zinc-700/50 text-zinc-300 border border-transparent hover:bg-zinc-700'}`}
                              >
                                <span>{emoji}</span>
                                <span>{users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Action Menu */}
                {!editingMessageId && (
                  <div 
                    className={clsx(
                      "absolute right-4 -top-3 transition-opacity bg-zinc-800 border border-zinc-700 rounded-md shadow-sm flex items-center overflow-visible z-10",
                      (showEmojiPicker === msg.id || showFullEmojiPicker === msg.id) ? "opacity-100 ring-2 ring-indigo-500/30" : 
                      mobileActionMessageId === msg.id ? "opacity-100 ring-1 ring-zinc-600 shadow-md md:opacity-0 md:group-hover:opacity-100" : 
                      "opacity-0 md:group-hover:opacity-100"
                    )}
                  >
                    <div className="relative" ref={(showEmojiPicker === msg.id || showFullEmojiPicker === msg.id) ? emojiPickerRef : null}>
                      <button 
                        onClick={(e) => handleEmojiPickerToggle(e, msg.id)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors rounded-l-md"
                        title={t('chatArea.addReaction')}
                      >
                        <SmilePlus className="w-4 h-4" />
                      </button>
                      
                      {/* Quick Reaction Bar */}
                      {showEmojiPicker === msg.id && (
                        <div className={`absolute right-0 z-50 shadow-xl ring-1 ring-zinc-700 rounded-lg overflow-hidden flex items-center bg-zinc-800 p-1 ${emojiPickerDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                          {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => {
                                handleReaction(msg.id, emoji, msg.reactions);
                                setShowEmojiPicker(null);
                              }}
                              className="p-2 hover:bg-zinc-700 rounded text-xl transition-transform hover:scale-110"
                            >
                              {emoji}
                            </button>
                          ))}
                          <div className="w-px h-6 bg-zinc-700 mx-1"></div>
                          <button 
                            onClick={() => {
                              setShowEmojiPicker(null);
                              setShowFullEmojiPicker(msg.id);
                            }}
                            className="p-2 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                            title={t('chatArea.moreEmojis')}
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      )}

                      {/* Full Emoji Picker */}
                      {showFullEmojiPicker === msg.id && (
                        <div className={`absolute right-0 z-50 shadow-xl ring-1 ring-zinc-700 rounded-lg overflow-hidden ${emojiPickerDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                          <Suspense fallback={<div className="w-[250px] h-[300px] bg-zinc-800 rounded-lg flex items-center justify-center"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>}>
                            <EmojiPicker 
                              theme={'dark' as any} 
                              onEmojiClick={(emojiData: any) => {
                                handleReaction(msg.id, emojiData.emoji, msg.reactions);
                                setShowFullEmojiPicker(null);
                              }}
                              lazyLoadEmojis={true}
                              height={350}
                              width={280}
                              searchPlaceholder={t('chatArea.searchPlaceholder')}
                              skinTonesDisabled={true}
                              previewConfig={{ showPreview: false }}
                              style={{ '--epr-emoji-size': '22px' } as any}
                            />
                          </Suspense>
                        </div>
                      )}
                    </div>
                    
                    <button 
                      onClick={() => setReplyingTo(msg)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                      title={t('chatArea.replyingTo')}
                    >
                      <Reply className="w-4 h-4" />
                    </button>
                    
                    <button 
                      onClick={() => handlePin(msg.id, msg.is_pinned)}
                      className={`p-1.5 hover:bg-zinc-700 transition-colors ${msg.is_pinned ? 'text-indigo-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                      title={msg.is_pinned ? t('chatArea.unpinMessage') : t('chatArea.pinMessage')}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    
                    {isOwner && (
                      <>
                        <button 
                          onClick={() => handleEditStart(msg)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                          title={t('chatArea.editMessage')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(msg.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-zinc-700 transition-colors rounded-r-md"
                          title={t('chatArea.deleteMessage')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      }}
    />
  )}

      <div className="relative z-10 bg-zinc-800">
        <AnimatePresence>
          {showScrollButton && (
            <motion.button 
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              onClick={scrollToBottom}
              className={`absolute -top-12 right-4 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 p-2 rounded-full shadow-lg transition-all z-20 flex items-center gap-2 ${unreadCount > 0 ? 'px-4 bg-indigo-500 hover:bg-indigo-600 text-white' : ''}`}
              title={t('chatArea.goToRecent')}
            >
              {unreadCount > 0 && <span className="text-xs font-bold">{unreadCount} {unreadCount > 1 ? t('chatArea.newNouveaux') : t('chatArea.newNouveau')}</span>}
              <ArrowDown className="w-5 h-5 transition-transform group-hover:translate-y-0.5" />
            </motion.button>
          )}
        </AnimatePresence>
        {typingUsers.length > 0 && (
          <div className="h-6 px-4 flex items-center gap-2 text-xs text-zinc-300 bg-zinc-800 shrink-0">
            <span className="flex gap-1" aria-hidden="true">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </span>
            <span className="font-medium">
              <span className="text-white">{typingUsers.map(u => usersMap[u.id]?.username || u.username).join(', ')}</span>
              <span className="text-zinc-400 font-normal ml-1">
                {typingUsers.length === 1 ? t('chatArea.isTyping') : t('chatArea.areTyping')}
              </span>
            </span>
          </div>
        )}
        <MessageInput 
          channelId={selectedDmId} 
          serverId="DM" 
          isDM={true} 
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onEditLastMessage={handleEditLastMessage}
        />
      </div>
    </div>
  </motion.div>
</AnimatePresence>
      
      <UserProfileModal 
        isOpen={!!selectedUser} 
        onClose={() => setSelectedUser(null)} 
        user={selectedUser} 
      />

      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onViewProfile={() => {
            const u = usersMap[contextMenu.userId];
            if (u) {
              const userData = getUserData(u.id, u.username, u.avatar_url);
              setSelectedUser({ id: u.id, ...userData });
            }
          }}
        />
      )}

      <AddFriendsToDMModal
        isOpen={isAddFriendsModalOpen}
        onClose={() => setIsAddFriendsModalOpen(false)}
        dmId={selectedDmId}
        currentParticipants={dmData?.participants || []}
      />

      {previewImage && (
        <ImageModal 
          images={allAttachedImages}
          initialIndex={allAttachedImages.findIndex(img => img.url === previewImage)}
          onClose={() => setPreviewImage(null)} 
        />
      )}
    </div>
  );
}
