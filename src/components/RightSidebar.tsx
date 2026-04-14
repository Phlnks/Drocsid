import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { Search, Hash, MessageSquare, User, Loader2, Bell, Check, AtSign, X } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { format } from 'date-fns';
import UserProfileModal from './ui/UserProfileModal';
import UserAvatar from './ui/UserAvatar';
import UserContextMenu from './ui/UserContextMenu';

export default function RightSidebar() {
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'search' | 'notifications'>('users');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadDMs, setUnreadDMs] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number } | null>(null);
  
  const { user: currentUser } = useAuthStore();
  const { setSelectedServerId, setSelectedChannelId, setSelectedDmId, setIsRightSidebarOpen, selectedDmId, onlineUserIds, selectedServerId, setHighlightedMessageId } = useAppStore();

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (data) setUsers(data);
    };

    fetchUsers();

    const channel = supabase.channel('profiles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchUsers())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      // Fetch current user profile
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
      if (profile) setCurrentUserProfile(profile);

      // Fetch DMs
      const { data: dms } = await supabase.from('dms').select('*').contains('participants', [currentUser.id]);
      if (dms) setUnreadDMs(dms);

      // Fetch notifications
      const { data: notifs } = await supabase.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
      if (notifs) {
        setNotifications(notifs);
        
        // Trigger browser notification for new unread mentions
        notifs.forEach(async (n) => {
          if (!n.read && !n.notified) {
            if (Notification.permission === 'granted') {
              new Notification(`Mention from ${n.author_name}`, {
                body: n.content,
              });
            }
            await supabase.from('notifications').update({ notified: true }).eq('id', n.id);
          }
        });
      }
    };

    fetchData();

    const notifSub = supabase.channel(`notifs_${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dms' }, (payload) => {
        const dm = payload.new as any || payload.old as any;
        if (dm && dm.participants && dm.participants.includes(currentUser.id)) {
          fetchData();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${currentUser.id}` }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(notifSub);
    };
  }, [currentUser]);

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const markAsRead = async (notifId: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true }).eq('id', notifId);
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setActiveTab('search');
    
    try {
      const results: any[] = [];
      
      // Search in server channels
      const { data: messages } = await supabase.from('messages')
        .select('*, channels(name)')
        .ilike('content', `%${searchQuery}%`);

      if (messages) {
        messages.forEach(msg => {
          results.push({
            id: msg.id,
            type: 'channel',
            channelId: msg.channel_id,
            serverId: msg.server_id,
            channelName: msg.channels?.name,
            content: msg.content,
            authorId: msg.author_id,
            createdAt: msg.created_at
          });
        });
      }

      // Search in DMs
      if (currentUser) {
        const { data: dmMessages } = await supabase.from('dm_messages')
          .select('*')
          .ilike('content', `%${searchQuery}%`);
        
        if (dmMessages) {
          // Filter DMs where user is participant
          const { data: userDms } = await supabase.from('dms').select('id').contains('participants', [currentUser.id]);
          const userDmIds = new Set(userDms?.map(dm => dm.id) || []);

          dmMessages.forEach(msg => {
            if (userDmIds.has(msg.dm_id)) {
              results.push({
                id: msg.id,
                type: 'dm',
                dmId: msg.dm_id,
                content: msg.content,
                authorId: msg.author_id,
                createdAt: msg.created_at
              });
            }
          });
        }
      }

      // Sort by date descending
      results.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const jumpToMessage = (result: any) => {
    if (result.type === 'channel') {
      setSelectedServerId(result.serverId);
      setSelectedChannelId(result.channelId);
    } else if (result.type === 'dm') {
      setSelectedServerId(null);
      setSelectedDmId(result.dmId);
    }
    setHighlightedMessageId(result.id);
  };

  const getUser = (userId: string) => users.find(u => u.id === userId);

  const unreadCount = notifications.filter(n => !n.read).length;

  const unreadDMsList = unreadDMs.filter(dm => {
    return dm.last_message_at && 
           (!currentUserProfile?.last_read?.[dm.id] || dm.last_message_at > currentUserProfile.last_read[dm.id]) &&
           selectedDmId !== dm.id;
  });

  const totalUnreadCount = unreadCount + unreadDMsList.length;

  const getDisplayStatus = (user: any) => {
    if (!onlineUserIds.includes(user.id)) return 'offline';
    return user.status || 'online';
  };

  const onlineUsers = users.filter(u => getDisplayStatus(u) !== 'offline');
  const offlineUsers = users.filter(u => getDisplayStatus(u) === 'offline');

  const handleContextMenu = (e: React.MouseEvent, user: any) => {
    e.preventDefault();
    setContextMenu({
      userId: user.id,
      username: user.username,
      x: e.clientX,
      y: e.clientY
    });
  };

  return (
    <>
      <div className="w-full md:w-72 bg-zinc-800/50 border-l border-zinc-800 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
          <button 
            onClick={() => setIsRightSidebarOpen(false)}
            className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <form onSubmit={handleSearch} className="relative flex-1">
            <input
              type="text"
              placeholder="Search all chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 text-zinc-100 text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          </form>
        </div>

        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'users' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'search' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === 'notifications' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-300'}`}
            title="Notifications"
          >
            <div className="flex items-center justify-center gap-1">
              <Bell className="w-4 h-4" />
              {totalUnreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {totalUnreadCount}
                </span>
              )}
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col">
          {activeTab === 'users' ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  En ligne — {onlineUsers.length}
                </h3>
                <div className="space-y-2">
                  {onlineUsers.map(user => {
                    const status = getDisplayStatus(user);
                    return (
                      <div 
                        key={user.id} 
                        onClick={() => setSelectedUser(user)}
                        onContextMenu={(e) => handleContextMenu(e, user)}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800/50 transition-colors cursor-pointer"
                      >
                        <UserAvatar 
                          user={{
                            username: user.username,
                            avatarUrl: user.avatar_url,
                            status: status
                          }} 
                          size="md" 
                        />
                        <span className="text-sm font-medium text-zinc-300">{user.username}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {offlineUsers.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 mt-6">
                    Hors ligne — {offlineUsers.length}
                  </h3>
                  <div className="space-y-2">
                    {offlineUsers.map(user => (
                      <div 
                        key={user.id} 
                        onClick={() => setSelectedUser(user)}
                        onContextMenu={(e) => handleContextMenu(e, user)}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800/50 transition-colors opacity-60 cursor-pointer"
                      >
                        <UserAvatar 
                          user={{
                            username: user.username,
                            avatarUrl: user.avatar_url,
                            status: 'offline'
                          }} 
                          size="md" 
                          className="opacity-60"
                        />
                        <span className="text-sm font-medium text-zinc-400">{user.username}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'search' ? (
            <div className="space-y-4">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                  <p className="text-sm">Searching messages...</p>
                </div>
              ) : hasSearched ? (
                searchResults.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                      {searchResults.length} Results
                    </h3>
                    {searchResults.map(result => {
                      const author = getUser(result.authorId);
                      return (
                        <div 
                          key={result.id} 
                          onClick={() => jumpToMessage(result)}
                          className="bg-zinc-800/50 p-3 rounded-md hover:bg-zinc-700/50 cursor-pointer transition-colors border border-zinc-700/50"
                        >
                          <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400">
                            {result.type === 'channel' ? (
                              <><Hash className="w-3 h-3" /> {result.channelName}</>
                            ) : (
                              <><MessageSquare className="w-3 h-3" /> Direct Message</>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-zinc-200">{author?.username || 'Unknown User'}</span>
                            <span className="text-[10px] text-zinc-500">
                              {result.createdAt ? format(new Date(result.createdAt), 'dd/MM/yyyy') : ''}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-300 line-clamp-3 break-words">
                            {result.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 text-zinc-500 text-sm">
                    No messages found for "{searchQuery}"
                  </div>
                )
              ) : (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  Type in the search box above to find messages.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Mentions & Notifications
                </h3>
                {notifications.some(n => !n.read) && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-tight"
                  >
                    Tout lire
                  </button>
                )}
              </div>
              
              {unreadDMsList.length > 0 && (
                <div className="mb-6 space-y-3">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase">Messages Privés Non Lus</h4>
                  {unreadDMsList.map(dm => {
                    const isGroup = dm.participants.length > 2;
                      const dmName = isGroup 
                        ? "Groupe" 
                        : users.find(u => u.id === dm.participants.find((p: string) => p !== currentUser?.id))?.username || 'Utilisateur';

                      return (
                        <div 
                          key={dm.id} 
                          className="bg-zinc-800/50 p-3 rounded-md border border-indigo-500/50 bg-indigo-500/5 transition-colors cursor-pointer hover:bg-zinc-700/50"
                          onClick={() => {
                            setSelectedServerId(null);
                            setSelectedDmId(dm.id);
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="w-4 h-4 text-indigo-400" />
                            <span className="font-medium text-zinc-200">Nouveau message de {dmName}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-zinc-500">
                              {format(new Date(dm.last_message_at), 'dd/MM/yyyy HH:mm')}
                            </span>
                            <span className="text-xs text-indigo-400 font-medium">Ouvrir</span>
                          </div>
                        </div>
                      );
                  })}
                </div>
              )}

              {notifications.filter(n => !n.read).length > 0 ? (
                <div className="space-y-3">
                  {notifications.filter(n => !n.read).map(notif => (
                    <div 
                      key={notif.id} 
                      className="bg-zinc-800/50 p-3 rounded-md border border-indigo-500/50 bg-indigo-500/5 transition-colors cursor-pointer hover:bg-zinc-700/50 group"
                      onClick={() => {
                        markAsRead(notif.id);
                        jumpToMessage({
                          type: notif.is_dm ? 'dm' : 'channel',
                          serverId: notif.server_id,
                          channelId: notif.channel_id,
                          dmId: notif.channel_id,
                          id: notif.message_id
                        });
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <AtSign className="w-3 h-3 text-indigo-400" />
                          <span>Mentioned by <span className="font-medium text-zinc-300">{notif.author_name}</span></span>
                        </div>
                        {!notif.read && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notif.id);
                            }}
                            className="text-zinc-500 hover:text-indigo-400 transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-zinc-300 line-clamp-3 break-words mb-2">
                        {notif.content}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-zinc-500">
                          {notif.created_at ? format(new Date(notif.created_at), 'dd/MM/yyyy HH:mm') : ''}
                        </span>
                        <span className="text-[10px] text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          View Message
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : unreadDMsList.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  No notifications yet.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <UserProfileModal 
        isOpen={selectedUser !== null}
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
    </>
  );
}
