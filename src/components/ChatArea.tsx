import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { Hash, Volume2, FileIcon, Download, Pencil, Trash2, SmilePlus, Reply, ArrowDown, Users, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
const EmojiPicker = lazy(() => import('emoji-picker-react'));
import MessageInput from './MessageInput';
import VoiceParticipants from './VoiceParticipants';
import UserAvatar from './ui/UserAvatar';
import UserProfileModal from './ui/UserProfileModal';
import UserContextMenu from './ui/UserContextMenu';
import MessageContent from './MessageContent';
import ImageModal from './ui/ImageModal';
import { playMessageSound } from '../lib/sounds';
import socket from '../lib/socket';

export default function ChatArea() {
  const { user } = useAuthStore();
  const { selectedChannelId, selectedServerId, isRightSidebarOpen, setIsRightSidebarOpen, setIsMobileNavOpen, connectedVoiceChannelId, highlightedMessageId: globalHighlightedMessageId, setHighlightedMessageId: setGlobalHighlightedMessageId } = useAppStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [channel, setChannel] = useState<any>(null);
  const [server, setServer] = useState<any>(null);
  const [currentUserMember, setCurrentUserMember] = useState<any>(null);
  const [serverRoles, setServerRoles] = useState<any[]>([]);
  const [serverMembers, setServerMembers] = useState<any[]>([]);
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
      // Wait a bit for messages to load if needed
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
  }, [selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId || !selectedServerId || !user) return;

    initialLoadRef.current = true;
    setReplyingTo(null);

    const fetchInitialData = async () => {
      // Fetch Channel
      const { data: channelData } = await supabase.from('channels').select('*').eq('id', selectedChannelId).maybeSingle();
      if (channelData) setChannel(channelData);

      // Fetch Server
      const { data: serverData } = await supabase.from('servers').select('*').eq('id', selectedServerId).maybeSingle();
      if (serverData) setServer(serverData);

      // Fetch Member
      const { data: memberData } = await supabase.from('server_members').select('*').eq('server_id', selectedServerId).eq('user_id', user.id).maybeSingle();
      if (memberData) setCurrentUserMember(memberData);

      // Fetch Roles
      const { data: rolesData } = await supabase.from('roles').select('*').eq('server_id', selectedServerId);
      if (rolesData) setServerRoles(rolesData);

      // Fetch Members
      const { data: membersData } = await supabase.from('server_members').select('*').eq('server_id', selectedServerId);
      if (membersData) setServerMembers(membersData);

      // Fetch Users
      const { data: usersData } = await supabase.from('profiles').select('*');
      if (usersData) {
        const uMap: Record<string, any> = {};
        usersData.forEach(u => uMap[u.id] = u);
        setUsersMap(uMap);
      }

      // Fetch Messages
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', selectedChannelId)
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
    };

    fetchInitialData();

    const updateLastRead = async () => {
      if (!user || !selectedChannelId) return;
      try {
        const { data: profile } = await supabase.from('profiles').select('last_read').eq('id', user.id).single();
        const currentLastRead = profile?.last_read || {};
        await supabase.from('profiles').update({
          last_read: { ...currentLastRead, [selectedChannelId]: Date.now() }
        }).eq('id', user.id);
      } catch (e) {
        console.error("Error updating last read", e);
      }
    };

    updateLastRead();

    const handleNewMessage = (message: any) => {
      if (message.channel_id === selectedChannelId) {
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
        updateLastRead();
        if (message.author_id !== user.id) {
          playMessageSound();
        }
      }
    };

    const handleUpdateMessage = (message: any) => {
      if (message.channel_id === selectedChannelId) {
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message } : m));
      }
    };

    const handleDeleteMessage = (messageId: string) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const handleTyping = (data: any) => {
      if (data.channelId === selectedChannelId && data.userId !== user.id) {
        setTypingUsers(prev => {
          const filtered = prev.filter(u => u.id !== data.userId);
          if (data.isTyping) {
            return [...filtered, { id: data.userId, username: data.username }];
          }
          return filtered;
        });
      }
    };

    const serverSub = supabase.channel(`server_chat_${selectedServerId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers', filter: `id=eq.${selectedServerId}` }, (payload) => {
        setServer(payload.new);
      })
      .subscribe();

    socket.on('message', handleNewMessage);
    socket.on('message-updated', handleUpdateMessage);
    socket.on('message-deleted', handleDeleteMessage);
    socket.on('typing', handleTyping);
    socket.emit('join-channel', selectedChannelId);

    return () => {
      socket.off('message', handleNewMessage);
      socket.off('message-updated', handleUpdateMessage);
      socket.off('message-deleted', handleDeleteMessage);
      socket.off('typing', handleTyping);
      socket.emit('leave-channel', selectedChannelId);
      supabase.removeChannel(serverSub);
    };
  }, [selectedChannelId, selectedServerId, user, messageLimit]);

  const handleDelete = async (msgId: string) => {
    try {
      await supabase.from('messages').delete().eq('id', msgId);
      socket.emit('delete-message', { id: msgId, channelId: selectedChannelId });
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
      const { data } = await supabase.from('messages').update({
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

      await supabase.from('messages').update({
        reactions: reactions
      }).eq('id', msgId);

      socket.emit('message-reaction', {
        messageId: msgId,
        channelId: selectedChannelId,
        reactions,
        isDM: false
      });
    } catch (error) {
      console.error("Error updating reaction:", error);
    }
    setShowEmojiPicker(null);
  };

  if (!selectedChannelId) {
    return (
      <div className="flex-1 bg-zinc-800 flex items-center justify-center text-zinc-500">
        Select a channel to start chatting
      </div>
    );
  }

  const isServerOwner = server?.owner_id === user?.id;
  let hasManageMessages = isServerOwner;

  const handleContextMenu = (e: React.MouseEvent, userId: string, username: string) => {
    e.preventDefault();
    setContextMenu({
      userId,
      username,
      x: e.clientX,
      y: e.clientY
    });
  };

  if (currentUserMember && Array.isArray(currentUserMember.roles)) {
    if (currentUserMember.roles.includes('owner')) {
      hasManageMessages = true;
    } else {
      const userRoles = serverRoles.filter(r => currentUserMember.roles.includes(r.id));
      for (const role of userRoles) {
        if (role.permissions?.includes('ADMINISTRATOR') || role.permissions?.includes('MANAGE_MESSAGES')) {
          hasManageMessages = true;
          break;
        }
      }
    }
  }

  const getUserData = (userId: string, fallbackName: string, fallbackAvatar: string) => {
    const u = usersMap[userId];
    const member = serverMembers.find(m => m.user_id === userId);
    
    let color = '#f4f4f5'; // zinc-100
    if (member && Array.isArray(member.roles) && member.roles.length > 0) {
      const userRoles = serverRoles.filter(r => member.roles.includes(r.id));
      const roleWithColor = userRoles.find(r => r.color && r.color !== '#99aab5');
      if (roleWithColor) color = roleWithColor.color;
    }
    
    return {
      username: u?.username || fallbackName || 'User',
      avatarUrl: u?.avatar_url || fallbackAvatar || '',
      status: u?.status || 'offline',
      color
    };
  };

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
          {channel?.type === 'VOICE' ? (
            <Volume2 className="w-5 h-5 text-zinc-400 mr-2" />
          ) : (
            <Hash className="w-5 h-5 text-zinc-400 mr-2" />
          )}
          <span className="font-semibold text-zinc-100">{channel?.name || 'Loading...'}</span>
        </div>
        <button 
          onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
          className={`hidden md:block p-1.5 rounded-md transition-colors ${isRightSidebarOpen ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50'}`}
          title="Toggle Members List"
        >
          <Users className="w-5 h-5" />
        </button>
      </div>

      {channel?.type === 'VOICE' ? (
        <div className="flex-1 flex flex-col">
          <VoiceParticipants />
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Les salons vocaux ne disposent pas de chat textuel.
          </div>
        </div>
      ) : (
        <>
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
                
              const isMessageAuthor = msg.author_id === user?.id;
              const canDelete = isMessageAuthor || hasManageMessages;
              
              const userData = getUserData(msg.author_id, msg.author_name, msg.author_avatar);
              const repliedMsg = msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null;

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
                  <UserAvatar user={getUserData(repliedMsg.author_id, repliedMsg.author_name, repliedMsg.author_avatar)} size="xs" showStatus={false} />
                  <span className="font-medium group-hover/reply:underline">@{repliedMsg.author_name}</span>
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
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  {showHeader && (
                    <div className="flex items-baseline gap-2 mb-1">
                      <span 
                        className="font-medium cursor-pointer hover:underline" 
                        style={{ color: userData.color }}
                        onClick={() => setSelectedUser({ id: msg.author_id, ...userData })}
                        onContextMenu={(e) => handleContextMenu(e, msg.author_id, userData.username)}
                      >
                        {userData.username}
                      </span>
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        {format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm')}
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
                    
                    {isMessageAuthor && (
                      <button 
                        onClick={() => handleEditStart(msg)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button 
                        onClick={() => handleDelete(msg.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-zinc-700 transition-colors rounded-r-md"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          channelId={selectedChannelId} 
          serverId={selectedServerId!} 
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </div>
      </>
      )}
      
      <UserProfileModal 
        isOpen={!!selectedUser} 
        onClose={() => setSelectedUser(null)} 
        user={selectedUser} 
      />

      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          serverId={selectedServerId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {previewImage && (
        <ImageModal 
          imageUrl={previewImage} 
          onClose={() => setPreviewImage(null)} 
        />
      )}
    </div>
  );
}
