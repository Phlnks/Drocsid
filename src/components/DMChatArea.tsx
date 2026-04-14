import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { User, FileIcon, Download, Pencil, Trash2, SmilePlus, Reply, Phone, UserPlus, Users, ArrowDown, ArrowLeft, LogOut, Check, CheckCheck, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
const EmojiPicker = lazy(() => import('emoji-picker-react'));
import MessageInput from './MessageInput';
import UserAvatar from './ui/UserAvatar';
import UserProfileModal from './ui/UserProfileModal';
import UserContextMenu from './ui/UserContextMenu';
import AddFriendsToDMModal from './ui/AddFriendsToDMModal';
import MessageContent from './MessageContent';
import VoiceParticipants from './VoiceParticipants';
import ImageModal from './ui/ImageModal';
import { playMessageSound } from '../lib/sounds';
import socket from '../lib/socket';

export default function DMChatArea() {
  const { user } = useAuthStore();
  const { selectedDmId, setSelectedDmId, connectedVoiceChannelId, setConnectedVoiceChannelId, isRightSidebarOpen, setIsRightSidebarOpen, setIsMobileNavOpen, highlightedMessageId: globalHighlightedMessageId, setHighlightedMessageId: setGlobalHighlightedMessageId } = useAppStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUsers, setOtherUsers] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [dmData, setDmData] = useState<any>(null);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(true);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  const [isAddFriendsModalOpen, setIsAddFriendsModalOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [messageLimit, setMessageLimit] = useState(50);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const loadMore = () => {
    if (hasMore && !isFetchingMore && messages.length >= messageLimit) {
      setIsFetchingMore(true);
      setMessageLimit(prev => prev + 50);
    }
  };

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' });
  };

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
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

  useEffect(() => {
    setMessageLimit(50);
    setHasMore(true);
    setIsFetchingMore(false);
  }, [selectedDmId]);

  useEffect(() => {
    if (!selectedDmId || !user) return;

    initialLoadRef.current = true;
    setReplyingTo(null);

    const updateLastRead = async () => {
      if (!user || !selectedDmId) return;
      try {
        const { data: profile } = await supabase.from('profiles').select('last_read').eq('id', user.id).single();
        const currentLastRead = profile?.last_read || {};
        await supabase.from('profiles').update({
          last_read: { ...currentLastRead, [selectedDmId]: Date.now() }
        }).eq('id', user.id);
      } catch (error) {
        console.error("Error updating last_read:", error);
      }
    };

    const fetchInitialData = async () => {
      // Fetch DM info
      const { data: dmData } = await supabase.from('dms').select('*').eq('id', selectedDmId).maybeSingle();
      if (dmData) {
        setDmData(dmData);
        const otherIds = dmData.participants.filter((id: string) => id !== user.id);
        
        const { data: fetchedUsers } = await supabase.from('profiles').select('*').in('id', otherIds);
        if (fetchedUsers) {
          setOtherUsers(fetchedUsers);
          if (fetchedUsers.length > 0) {
            setOtherUser(fetchedUsers[0]);
          }
        }
      }

      // Fetch Call
      const { data: callData } = await supabase.from('calls').select('*').eq('id', selectedDmId).maybeSingle();
      if (callData) setActiveCall(callData);

      // Fetch Users
      const { data: usersData } = await supabase.from('profiles').select('*');
      if (usersData) {
        const uMap: Record<string, any> = {};
        usersData.forEach(u => uMap[u.id] = u);
        setUsersMap(uMap);
      }

      // Fetch Messages
      const { data: messagesData } = await supabase
        .from('dm_messages')
        .select('*')
        .eq('dm_id', selectedDmId)
        .order('created_at', { ascending: true })
        .limit(messageLimit);
      
      if (messagesData) {
        setMessages(messagesData);
        if (messagesData.length < messageLimit) setHasMore(false);
        
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({ index: messagesData.length - 1, align: 'end' });
          initialLoadRef.current = false;
        }, 100);
      }

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
        
        // Update lastRead for any new message in the active chat
        updateLastRead();

        if (message.author_id !== user.id) {
          playMessageSound();
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

    const handleTyping = (data: any) => {
      if (data.channelId === selectedDmId && data.userId !== user.id) {
        setTypingUsers(prev => {
          const filtered = prev.filter(u => u.id !== data.userId);
          if (data.isTyping) {
            return [...filtered, { id: data.userId, username: data.username }];
          }
          return filtered;
        });
      }
    };

    const dmSub = supabase.channel(`dm_chat_${selectedDmId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dms', filter: `id=eq.${selectedDmId}` }, () => {
        fetchInitialData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `id=eq.${selectedDmId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setActiveCall(null);
        } else {
          setActiveCall(payload.new);
        }
      })
      .subscribe();

    socket.on('dm-message', handleNewMessage);
    socket.on('dm-message-updated', handleUpdateMessage);
    socket.on('dm-message-deleted', handleDeleteMessage);
    socket.on('typing', handleTyping);
    socket.emit('join-channel', selectedDmId);

    return () => {
      socket.off('dm-message', handleNewMessage);
      socket.off('dm-message-updated', handleUpdateMessage);
      socket.off('dm-message-deleted', handleDeleteMessage);
      socket.off('typing', handleTyping);
      socket.emit('leave-channel', selectedDmId);
      supabase.removeChannel(dmSub);
    };
  }, [selectedDmId, user, messageLimit]);

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
    if (!editContent.trim()) return;
    try {
      const { data } = await supabase.from('dm_messages').update({
        content: editContent.trim(),
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

  const handleReaction = async (msgId: string, emoji: string, currentReactions: any) => {
    if (!user) return;
    const uid = user.id;
    
    const reactions = { ...(currentReactions || {}) };
    const users = [...(reactions[emoji] || [])];
    
    try {
      if (users.includes(uid)) {
        reactions[emoji] = users.filter(id => id !== uid);
      } else {
        reactions[emoji] = [...users, uid];
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
    } catch (error) {
      console.error("Error updating reaction:", error);
    }
    setShowEmojiPicker(null);
  };

  const getUserData = (userId: string, fallbackName: string, fallbackAvatar: string) => {
    const u = usersMap[userId];
    return {
      username: u?.username || fallbackName || 'User',
      avatarUrl: u?.avatar_url || fallbackAvatar || '',
      status: u?.status || 'offline',
      color: '#f4f4f5'
    };
  };

  const handleCall = async () => {
    if (!selectedDmId || !user || !dmData) return;
    
    if (activeCall) {
      // If there's already a call, just join it
      setConnectedVoiceChannelId(selectedDmId);
      return;
    }
    
    try {
      await supabase.from('calls').insert({
        id: selectedDmId,
        dm_id: selectedDmId,
        caller_id: user.id,
        participants: dmData.participants,
        status: 'ringing'
      });

      // Emit socket event for real-time notification
      socket.emit('start-call', {
        callId: selectedDmId,
        dmId: selectedDmId,
        callerId: user.id,
        participants: dmData.participants
      });

      // Join the call immediately
      setConnectedVoiceChannelId(selectedDmId);
    } catch (error) {
      console.error("Error starting call:", error);
    }
  };

  const handleJoinCall = () => {
    setConnectedVoiceChannelId(selectedDmId);
  };

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

  if (!selectedDmId) {
    return (
      <div className="flex-1 bg-zinc-800 flex items-center justify-center text-zinc-500">
        Sélectionnez un ami pour commencer à discuter
      </div>
    );
  }

  return (
    <div className="flex-1 bg-zinc-800 flex flex-col min-w-0">
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
                <User className="w-5 h-5" />
              </div>
            ) : (
              <UserAvatar 
                user={{
                  username: otherUser?.username || otherUser?.displayName || 'User',
                  avatarUrl: otherUser?.avatarUrl || otherUser?.photoURL || '',
                  status: otherUser?.status || 'offline'
                }} 
                size="md" 
              />
            )}
          </div>
          <span className="font-semibold text-zinc-100">
            {otherUsers.length > 1 
              ? otherUsers.map(u => u.username || u.displayName).join(', ')
              : otherUser?.username || otherUser?.displayName || 'Chargement...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {otherUsers.length > 1 && (
            <button 
              className="p-2 hover:bg-red-500/20 rounded-md text-red-400 hover:text-red-300 transition-colors"
              title="Quitter le groupe"
              onClick={handleLeaveGroup}
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={handleCall}
            className={`p-2 rounded-md transition-colors ${activeCall ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100'}`}
            title={activeCall ? "Rejoindre l'appel" : "Appel vocal"}
          >
            <Phone className="w-5 h-5" />
          </button>
          <button 
            className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Ajouter des amis"
            onClick={() => setIsAddFriendsModalOpen(true)}
          >
            <UserPlus className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            className={`hidden md:block p-2 rounded-md transition-colors ${isRightSidebarOpen ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50'}`}
            title="Toggle Members List"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      {activeCall && connectedVoiceChannelId !== selectedDmId && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 p-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-emerald-400">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center animate-pulse">
              <Phone className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-sm">Appel en cours</span>
              <span className="text-xs opacity-80">Rejoignez la conversation vocale</span>
            </div>
          </div>
          <button 
            onClick={handleJoinCall}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            Rejoindre
          </button>
        </div>
      )}

      {connectedVoiceChannelId === selectedDmId && (
        <VoiceParticipants channelId={selectedDmId} />
      )}

      <Virtuoso
        ref={virtuosoRef}
        className={`flex-1 ${connectedVoiceChannelId ? 'pt-16 md:pt-4' : ''}`}
        data={messages}
        startReached={loadMore}
        initialTopMostItemIndex={messages.length - 1}
        alignToBottom
        followOutput="smooth"
        atBottomStateChange={(atBottom) => {
          setShowScrollButton(!atBottom);
        }}
        itemContent={(idx, msg) => {
          const showHeader = idx === 0 || messages[idx - 1].author_id !== msg.author_id || 
            (new Date(msg.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 5 * 60 * 1000) ||
            !!msg.reply_to;
            
          const isOwner = msg.author_id === user?.id;
          const userData = getUserData(msg.author_id, msg.author_name, msg.author_avatar);
          const repliedMsg = msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null;
          
          const isRead = otherUsers.length > 0 && otherUsers.every(u => {
            const lastRead = usersMap[u.id]?.last_read?.[selectedDmId!];
            return lastRead && lastRead >= new Date(msg.created_at).getTime();
          });

          return (
            <div className="px-4 pb-1">
              <div 
                key={msg.id} 
                id={`message-${msg.id}`}
                className={`relative group flex flex-col hover:bg-zinc-700/30 px-2 pr-32 md:pr-2 py-0.5 -mx-2 rounded transition-colors duration-500 ${showHeader && idx !== 0 ? 'mt-3' : ''} ${highlightedMessageId === msg.id ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50' : ''}`}
              >
              {repliedMsg && (
                <div 
                  onClick={() => scrollToMessage(repliedMsg.id)}
                  className="flex items-center gap-2 text-xs text-zinc-400 mb-1 ml-12 relative cursor-pointer hover:text-zinc-300 group/reply before:content-[''] before:absolute before:-left-8 before:top-1/2 before:w-6 before:h-4 before:border-l-2 before:border-t-2 before:border-zinc-600 before:rounded-tl-md"
                >
                  <UserAvatar user={getUserData(repliedMsg.authorId, repliedMsg.authorName, repliedMsg.authorAvatar)} size="xs" showStatus={false} />
                  <span className="font-medium group-hover/reply:underline">@{repliedMsg.authorName}</span>
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
                  <div className="w-10 flex-shrink-0 text-xs text-zinc-500 opacity-0 group-hover:opacity-100 text-center pt-1 flex items-center justify-center gap-1">
                    {format(new Date(msg.created_at), 'HH:mm')}
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
                        {format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm')}
                        {isOwner && (
                          isRead ? <CheckCheck className="w-3 h-3 text-blue-400" /> : <Check className="w-3 h-3 text-zinc-500" />
                        )}
                      </span>
                    </div>
                  )}
                  
                  {editingMessageId === msg.id ? (
                    <div className="mt-1">
                      <input 
                        type="text" 
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-zinc-900 text-zinc-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(msg.id);
                          if (e.key === 'Escape') setEditingMessageId(null);
                        }}
                        autoFocus
                      />
                      <div className="text-xs text-zinc-400 mt-1">
                        Échap pour annuler, Entrée pour valider
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.content && (
                        <div className="text-zinc-300 break-words whitespace-pre-wrap">
                          <MessageContent content={msg.content} />
                          {msg.is_edited && <span className="text-[10px] text-zinc-500 ml-2">(modifié)</span>}
                        </div>
                      )}
                      {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.map((attachment: any, i: number) => (
                        <div key={i} className="mt-2">
                          {attachment.type === 'image' ? (
                            <div 
                              className="cursor-pointer inline-block"
                              onClick={() => setPreviewImage(attachment.url)}
                            >
                              <img 
                                src={attachment.url} 
                                alt="Attachment" 
                                className="max-w-sm max-h-80 rounded-md object-contain bg-zinc-900/50 hover:opacity-90 transition-opacity"
                                loading="lazy"
                              />
                            </div>
                          ) : attachment.type === 'video' ? (
                            <video 
                              src={attachment.url} 
                              controls 
                              className="max-w-sm max-h-80 rounded-md bg-zinc-900/50"
                            />
                          ) : (
                            <a 
                              href={attachment.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-md max-w-sm hover:bg-zinc-900 transition-colors border border-zinc-700"
                            >
                              <div className="bg-indigo-500/20 p-2 rounded shrink-0">
                                <FileIcon className="w-6 h-6 text-indigo-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-200 truncate">
                                  {attachment.name || 'Fichier joint'}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {attachment.size ? (attachment.size / 1024 / 1024).toFixed(2) + ' MB' : 'Inconnu'}
                                </div>
                              </div>
                              <Download className="w-5 h-5 text-zinc-400 shrink-0" />
                            </a>
                          )}
                        </div>
                      ))}

                      {/* Reactions Display */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => {
                            if (!users || users.length === 0) return null;
                            const hasReacted = users.includes(user?.id);
                            const reactionUsernames = users.map((uid: string) => usersMap[uid]?.username || 'Utilisateur inconnu').join(', ');
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

                {/* Action Menu */}
                {!editingMessageId && (
                  <div className="absolute right-4 -top-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-zinc-800 border border-zinc-700 rounded-md shadow-sm flex items-center overflow-visible z-10">
                    <div className="relative">
                      <button 
                        onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors rounded-l-md"
                        title="Ajouter une réaction"
                      >
                        <SmilePlus className="w-4 h-4" />
                      </button>
                      {showEmojiPicker === msg.id && (
                        <div className="absolute right-0 bottom-full mb-2 z-50">
                          <Suspense fallback={<div className="w-[300px] h-[350px] bg-zinc-800 rounded-lg flex items-center justify-center"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>}>
                            <EmojiPicker 
                              theme={'dark' as any} 
                              onEmojiClick={(emojiData: any) => handleReaction(msg.id, emojiData.emoji, msg.reactions)}
                              lazyLoadEmojis={true}
                              height={350}
                              width={300}
                            />
                          </Suspense>
                        </div>
                      )}
                    </div>
                    
                    <button 
                      onClick={() => setReplyingTo(msg)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                      title="Répondre"
                    >
                      <Reply className="w-4 h-4" />
                    </button>
                    
                    {isOwner && (
                      <>
                        <button 
                          onClick={() => handleEditStart(msg)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(msg.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-zinc-700 transition-colors rounded-r-md"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            </div>
          );
        }}
      />

      <div className="relative">
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute -top-12 right-4 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 p-2 rounded-full shadow-lg transition-all z-20"
            title="Aller aux messages récents"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}
        {typingUsers.length > 0 && (
          <div className="absolute -top-6 left-4 text-xs text-zinc-400 flex items-center gap-1 z-10">
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </span>
            <span className="ml-1 font-medium">
              {typingUsers.map(u => usersMap[u.id]?.username || u.username).join(', ')} {typingUsers.length === 1 ? 'est en train d\'écrire...' : 'sont en train d\'écrire...'}
            </span>
          </div>
        )}
        <MessageInput 
          channelId={selectedDmId} 
          serverId="DM" 
          isDM={true} 
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </div>
      
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
          imageUrl={previewImage} 
          onClose={() => setPreviewImage(null)} 
        />
      )}
    </div>
  );
}
