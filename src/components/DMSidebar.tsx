import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { MessageSquare, Search, User, Settings, Pin, Save, Database } from 'lucide-react';
import clsx from 'clsx';
import UserSettingsModal from './ui/UserSettingsModal';
import { InstanceSettingsModal } from './InstanceSettingsModal';
import UserAvatar from './ui/UserAvatar';
import UserContextMenu from './ui/UserContextMenu';
import { useInstanceStore } from '../store/instanceStore';
import { useTranslation } from 'react-i18next';

export default function DMSidebar() {
  const { t } = useTranslation();
  const { user, currentUserProfile, setCurrentUserProfile } = useAuthStore();
  const { selectedDmId, setSelectedDmId, connectedVoiceChannelId, onlineUserIds, mutedDms, toggleMuteDm } = useAppStore();
  const [dms, setDms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number, dmId?: string } | null>(null);
  const [pinnedDmIds, setPinnedDmIds] = useState<string[]>(JSON.parse(localStorage.getItem(`drocsid-pinned-dms-${user?.id}`) || '[]'));
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const togglePinDm = (e: React.MouseEvent, dmId: string) => {
    e.stopPropagation();
    setPinnedDmIds(prev => {
      const newPinned = prev.includes(dmId) ? prev.filter(id => id !== dmId) : [...prev, dmId];
      localStorage.setItem(`drocsid-pinned-dms-${user?.id}`, JSON.stringify(newPinned));
      return newPinned;
    });
  };

  const fetchUnreadCounts = async (dmList: any[]) => {
    if (!user || dmList.length === 0) return;
    
    try {
      const counts: Record<string, number> = {};
      const promises = dmList.map(async (dm) => {
        const lastRead = currentUserProfile?.last_read?.[dm.id] || 0;
        
        if (dm.last_message_at && new Date(dm.last_message_at).getTime() <= lastRead) {
          counts[dm.id] = 0;
          return;
        }

        const { count } = await supabase
          .from('dm_messages')
          .select('*', { count: 'exact', head: true })
          .eq('dm_id', dm.id)
          .neq('author_id', user.id)
          .gt('created_at', new Date(lastRead).toISOString());
        
        counts[dm.id] = count || 0;
      });

      await Promise.all(promises);
      setUnreadCounts(counts);
    } catch (e) {
      console.error("Error fetching unread counts", e);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, target: any, dmId?: string) => {
    e.preventDefault();
    setContextMenu({
      userId: target.id,
      username: target.username || target.displayName || t('common.user'),
      x: e.clientX,
      y: e.clientY,
      dmId: dmId
    });
  };

  useEffect(() => {
    if (!user) return;

    const fetchDMs = async () => {
      const { data: dmList } = await supabase.from('dms').select('*').contains('participants', [user.id]);
      if (dmList && dmList.length > 0) {
        const allOtherUserIds = Array.from(new Set(dmList.flatMap(dm => dm.participants.filter((id: string) => id !== user.id))));
        const { data: allOtherUsers } = await supabase.from('profiles').select('*').in('id', allOtherUserIds);
        const usersMap = new Map((allOtherUsers || []).map(u => [u.id, u]));

        const resolvedDms = dmList.map((dm) => {
          const otherUserIds = dm.participants.filter((id: string) => id !== user.id);
          const otherUsers = otherUserIds.map((id: string) => usersMap.get(id)).filter(Boolean);
          
          let otherUser;
          if (otherUsers.length > 0) {
            otherUser = otherUsers[0];
          } else if (dm.participants.length === 1 || (dm.participants.length === 2 && dm.participants[0] === dm.participants[1])) {
            // Self DM / Saved Messages
            otherUser = { 
              id: user.id,
              username: t('friends.savedMessages'), 
              avatar_url: 'SAVED_MESSAGES_ICON',
              status: 'online',
              is_saved_messages: true
            };
          } else {
            otherUser = { username: 'Unknown User', avatar_url: '', status: 'offline' };
          }
          
          return { ...dm, otherUsers, otherUser };
        });
        resolvedDms.sort((a, b) => {
          const aTime = Math.max(
            a.last_message_at ? new Date(a.last_message_at).getTime() : 0,
            a.updated_at ? new Date(a.updated_at).getTime() : 0,
            a.created_at ? new Date(a.created_at).getTime() : 0
          );
          const bTime = Math.max(
            b.last_message_at ? new Date(b.last_message_at).getTime() : 0,
            b.updated_at ? new Date(b.updated_at).getTime() : 0,
            b.created_at ? new Date(b.created_at).getTime() : 0
          );
          return bTime - aTime;
        });
        setDms(resolvedDms);
      } else {
        setDms([]);
        setUnreadCounts({});
      }
    };

    fetchDMs();

    const channelName = `dm-changes-${user.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    });
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dms' }, () => fetchDMs())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, (payload) => {
        if (payload.new.author_id !== user.id) {
          fetchDMs();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (dms.length > 0) {
      fetchUnreadCounts(dms);
    }
  }, [currentUserProfile?.last_read, dms]);

  useEffect(() => {
    if (selectedDmId) {
      setUnreadCounts(prev => ({ ...prev, [selectedDmId]: 0 }));
    }
  }, [selectedDmId]);

  useEffect(() => {
    if (!user) return;
    
    // Fetch all users for the search list (in a real app, this would be paginated or server-side searched)
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, status').neq('id', user.id);
      if (data) setUsers(data);
    };
    fetchUsers();

    const channelName = `user-changes-${user.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    });
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleStartDM = async (otherUserId: string) => {
    if (!user) return;

    // Check if a 1-on-1 DM already exists
    // Handle self-DM (Saved Messages) case more specifically
    const isSelfDM = otherUserId === user.id;
    const existingDm = dms.find(dm => {
      if (isSelfDM) {
        return dm.participants && (
          (dm.participants.length === 1 && dm.participants[0] === user.id) ||
          (dm.participants.length === 2 && dm.participants[0] === user.id && dm.participants[1] === user.id)
        );
      }
      return dm.participants && 
             dm.participants.length === 2 && 
             dm.participants.includes(otherUserId) &&
             dm.participants.includes(user.id) &&
             dm.participants[0] !== dm.participants[1];
    });

    if (existingDm) {
      setSelectedDmId(existingDm.id);
      setSearchQuery('');
      return;
    }

    // Create new DM
    try {
      const participants = isSelfDM ? [user.id] : [user.id, otherUserId];
      const { data: newDm, error } = await supabase.from('dms').insert({
        participants
      }).select().maybeSingle();
      
      if (error || !newDm) throw error || new Error("Failed to create DM");
      setSelectedDmId(newDm.id);
      setSearchQuery('');
    } catch (error) {
      console.error("Error creating DM:", error);
    }
  };

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchPending = async () => {
      const { data } = await supabase.from('relationships')
        .select('*')
        .contains('participants', [user.id])
        .eq('status', 'pending');
      
      if (data) {
        const count = data.filter(r => r.requester_id !== user.id).length;
        setPendingCount(count);
      }
    };
    fetchPending();

    const channelName = `relationship-changes-${user.id}-${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, (payload) => {
        const rel = payload.new as any || payload.old as any;
        if (rel && rel.participants && rel.participants.includes(user.id)) {
          fetchPending();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filteredUsers = users.filter(u => 
    (u.username || u.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderDmItem = (dm: any) => {
    const isGroup = dm.participants.length > 2;
    const dmName = isGroup 
      ? dm.otherUsers.map((u: any) => u.username).join(', ') 
      : dm.otherUser?.username || t('common.user');
    
    const unreadCount = unreadCounts[dm.id] || 0;
    const isUnread = unreadCount > 0 && selectedDmId !== dm.id;
    
    const getDisplayStatus = (u: any) => {
      if (!u) return 'offline';
      if (!onlineUserIds.includes(u.id)) return 'offline';
      return u.status || 'online';
    };

    const isPinned = pinnedDmIds.includes(dm.id);

    return (
      <div
        key={dm.id}
        onClick={() => setSelectedDmId(dm.id)}
        onContextMenu={(e) => handleContextMenu(e, isGroup ? { id: dm.id, username: dmName } : dm.otherUser, dm.id)}
        className={clsx(
          "flex items-center gap-3 px-3 py-3 md:px-2 md:py-2 text-lg md:text-base rounded cursor-pointer group mb-1 md:mb-0.5 relative",
          selectedDmId === dm.id 
            ? "bg-zinc-800 text-zinc-100" 
            : isUnread 
              ? "text-zinc-100 font-semibold" 
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        )}
      >
        {isGroup ? (
          <div className="w-10 h-10 md:w-8 md:h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
            <User className="w-6 h-6 md:w-5 md:h-5" />
          </div>
        ) : (
          <div className="relative">
            <div className="md:hidden">
              <UserAvatar user={{ username: dm.otherUser?.username, avatarUrl: dm.otherUser?.avatar_url, status: getDisplayStatus(dm.otherUser) }} size="lg" />
            </div>
            <div className="hidden md:block">
              <UserAvatar user={{ username: dm.otherUser?.username, avatarUrl: dm.otherUser?.avatar_url, status: getDisplayStatus(dm.otherUser) }} size="md" />
            </div>
            {mutedDms.includes(dm.id) && (
              <div className="absolute -bottom-0.5 -right-0.5 bg-zinc-900 rounded-full border border-zinc-800 p-0.5 shadow-lg">
                <div className="w-1.5 h-1.5 md:w-1.5 md:h-1.5 bg-red-500 rounded-full" />
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2 overflow-hidden">
          <div className="font-medium truncate shrink min-w-0">
            {dmName}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={(e) => togglePinDm(e, dm.id)}
              className={clsx(
                "w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700/50 transition-all",
                isPinned ? "text-indigo-400 opacity-100" : "text-zinc-500 opacity-0 group-hover:opacity-100"
              )}
              title={isPinned ? t('common.unpin') : t('common.pin')}
            >
              <Pin className={clsx("w-3.5 h-3.5", isPinned && "rotate-45")} />
            </button>
            {isUnread && (
              <div className="bg-red-500 text-white text-[11px] font-bold min-w-[20px] h-[20px] flex items-center justify-center px-1 rounded-full border-2 border-zinc-900 shadow-[0_0_10px_rgba(239,68,68,0.5)] ring-1 ring-white/10 animate-in zoom-in duration-300">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const pinnedDms = dms.filter(dm => pinnedDmIds.includes(dm.id) && !dm.otherUser?.is_saved_messages);
  const unpinnedDms = dms.filter(dm => !pinnedDmIds.includes(dm.id) && !dm.otherUser?.is_saved_messages);

  return (
    <>
      <div className="flex-1 min-h-0 md:w-60 bg-zinc-900 flex flex-col flex-shrink-0">
        <div className="h-12 border-b border-zinc-800 flex items-center px-4 shadow-sm">
          <div className="relative w-full">
            <input
              type="text"
              placeholder={t('friends.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 text-zinc-200 text-sm rounded-md py-1 pl-8 pr-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Search className="w-4 h-4 text-zinc-400 absolute left-2 top-1.5" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 py-2 custom-scrollbar">
          {!searchQuery && (
            <div className="px-2 mb-4 space-y-1">
              <button
                onClick={() => setSelectedDmId(null)}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-3 md:py-2.5 text-lg md:text-base rounded-md transition-colors",
                  selectedDmId === null ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                )}
              >
                <div className="flex items-center gap-3">
                  <User className="w-6 h-6 md:w-5 md:h-5" />
                  <span className="font-medium">{t('friends.title')}</span>
                </div>
                {pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-[13px] md:text-[11px] font-bold px-2 py-0.5 md:px-1.5 md:py-0.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-white/10">
                    {pendingCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => user && handleStartDM(user.id)}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-lg md:text-base rounded-md transition-colors",
                  dms.find(dm => dm.id === selectedDmId)?.otherUser?.is_saved_messages ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                )}
              >
                <div className="w-6 h-6 md:w-5 md:h-5 flex items-center justify-center">
                  <Save className="w-5 h-5 md:w-4 md:h-4" />
                </div>
                <span className="font-medium">{t('friends.savedMessages')}</span>
              </button>
            </div>
          )}

          {searchQuery ? (
            <div className="px-2">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-2">
                {t('common.users')}
              </div>
              {filteredUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => handleStartDM(u.id)}
                  onContextMenu={(e) => handleContextMenu(e, u)}
                  className="flex items-center gap-3 px-2 py-2 rounded hover:bg-zinc-800 cursor-pointer group"
                >
                  <UserAvatar user={{ username: u.username, avatar_url: u.avatar_url, status: onlineUserIds.includes(u.id) ? (u.status || 'online') : 'offline' }} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-300 font-medium truncate group-hover:text-zinc-100">
                      {u.username || t('common.user')}
                    </div>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-zinc-500 text-sm px-2 py-4 text-center">
                  {t('friends.noUsersFound')}
                </div>
              )}
            </div>
          ) : (
            <>
              {pinnedDms.length > 0 && (
                <div className="px-2 mb-4">
                  <div className="flex items-center justify-between px-2 mb-2">
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      {t('friends.pinned')}
                    </div>
                  </div>
                  {pinnedDms.map(dm => renderDmItem(dm))}
                </div>
              )}
              
              <div className="px-2">
                <div className="flex items-center justify-between px-2 mb-2">
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {t('friends.directMessages')}
                  </div>
                </div>
                
                {unpinnedDms.map(dm => renderDmItem(dm))}
                
                {unpinnedDms.length === 0 && (
                  <div className="text-zinc-500 text-sm px-2 py-4 text-center">
                    {t('friends.noDirectMessages')}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          dmId={contextMenu.dmId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
