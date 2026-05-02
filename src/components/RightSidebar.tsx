import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { MessageSquare, Bell, Check, AtSign, X } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { format } from 'date-fns';
import clsx from 'clsx';
import UserProfileModal from './ui/UserProfileModal';
import UserAvatar from './ui/UserAvatar';
import UserContextMenu from './ui/UserContextMenu';
import { useTranslation } from 'react-i18next';

export default function RightSidebar() {
  const { t } = useTranslation();
  const [serverRoles, setServerRoles] = useState<any[]>([]);
  const [serverMembers, setServerMembers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'notifications'>('users');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadDMs, setUnreadDMs] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number } | null>(null);
  const [localUsers, setLocalUsers] = useState<any[]>([]);
  
  const { user: currentUser } = useAuthStore();
  const { setSelectedServerId, setSelectedChannelId, setSelectedDmId, setIsRightSidebarOpen, selectedDmId, onlineUserIds, selectedServerId, setHighlightedMessageId, globalProfiles } = useAppStore();

  const users = Object.values(globalProfiles).filter(p => localUsers.includes(p.id));

  useEffect(() => {
    const fetchUsers = async () => {
      if (selectedServerId) {
        // Fetch server specific data
        const [rolesRes, membersRes] = await Promise.all([
          supabase.from('roles').select('*').eq('server_id', selectedServerId).order('order', { ascending: true }),
          supabase.from('server_members').select('*').eq('server_id', selectedServerId)
        ]);

        if (rolesRes.data) setServerRoles(rolesRes.data);
        if (membersRes.data) setServerMembers(membersRes.data);

        // Fetch profiles only for these members
        if (membersRes.data && membersRes.data.length > 0) {
          const memberIds = membersRes.data.map(m => m.user_id);
          setLocalUsers(memberIds);
        }
      } else {
        // In DM view, only fetch profiles for DMs you are part of
        const { data: dms } = await supabase.from('dms').select('participants').contains('participants', [currentUser?.id]);
        if (dms) {
          const participants = new Set<string>();
          dms.forEach(dm => dm.participants.forEach((p: string) => participants.add(p)));
          if (participants.size > 0) {
            setLocalUsers(Array.from(participants));
          }
        }
        setServerRoles([]);
        setServerMembers([]);
      }
    };

    fetchUsers();

    const membersSub = supabase.channel('members_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: selectedServerId ? `server_id=eq.${selectedServerId}` : undefined }, () => fetchUsers())
      .subscribe();

    const rolesSub = supabase.channel('roles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles', filter: selectedServerId ? `server_id=eq.${selectedServerId}` : undefined }, () => fetchUsers())
      .subscribe();

    return () => {
      supabase.removeChannel(membersSub);
      supabase.removeChannel(rolesSub);
    };
  }, [selectedServerId]);

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
        // Note: NotificationManager.tsx now handles triggering actual native push notifications for unread/unnotified items.
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

  useEffect(() => {
    if ((window as any).electron) {
      const unreadCount = notifications.filter(n => !n.read).length;
      (window as any).electron.setBadge(unreadCount);
    }
  }, [notifications]);

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

  const getGroupedUsers = () => {
    const onlineUsers = users.filter(u => onlineUserIds.includes(u.id));
    const offlineUsers = users.filter(u => !onlineUserIds.includes(u.id));

    if (!selectedServerId) {
      const groups = [];
      if (onlineUsers.length > 0) {
        groups.push({
          id: 'online',
          name: t('friends.onlineCount', { count: onlineUsers.length }),
          users: onlineUsers,
          isOffline: false
        });
      }
      if (offlineUsers.length > 0) {
        groups.push({
          id: 'offline',
          name: t('friends.offlineCount', { count: offlineUsers.length }),
          users: offlineUsers,
          isOffline: true
        });
      }
      return groups;
    }

    // Server view: Group by role
    const groups: { id: string, name: string, users: any[], isOffline: boolean }[] = [];
    const onlineIdSet = new Set(onlineUserIds);
    
    // Maps userId to its highest role (the one with the lowest order)
    const userHighestRole = new Map<string, any>();
    serverMembers.forEach(member => {
      if (!member.roles || member.roles.length === 0) return;
      const roles = serverRoles.filter(r => member.roles.includes(r.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
      if (roles.length > 0) {
        userHighestRole.set(member.user_id, roles[0]);
      }
    });

    // Online users grouped by roles
    serverRoles.forEach(role => {
      const membersInRole = users.filter(u => {
        const highestRole = userHighestRole.get(u.id);
        return highestRole?.id === role.id && onlineIdSet.has(u.id);
      }).sort((a, b) => a.username.localeCompare(b.username));
      
      if (membersInRole.length > 0) {
        groups.push({
          id: role.id,
          name: `${role.name} — ${membersInRole.length}`,
          users: membersInRole,
          isOffline: false
        });
      }
    });

    // Members with no role and online
    const membersWithNoRoleOnline = users.filter(u => !userHighestRole.has(u.id) && onlineIdSet.has(u.id))
      .sort((a, b) => a.username.localeCompare(b.username));
    
    if (membersWithNoRoleOnline.length > 0) {
      groups.push({
        id: 'online-no-role',
        name: `${t('common.online')} — ${membersWithNoRoleOnline.length}`,
        users: membersWithNoRoleOnline,
        isOffline: false
      });
    }

    // Finally, offline members
    const offlineMembers = users.filter(u => !onlineIdSet.has(u.id))
      .sort((a, b) => a.username.localeCompare(b.username));
    
    if (offlineMembers.length > 0) {
      groups.push({
        id: 'offline',
        name: `${t('common.offline')} — ${offlineMembers.length}`,
        users: offlineMembers,
        isOffline: true
      });
    }

    return groups;
  };

  const groupedUsers = getGroupedUsers();

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
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
            {t('common.sidebar')}
          </h2>
          <button 
            onClick={() => setIsRightSidebarOpen(false)}
            className="p-2 -mr-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 rounded-md transition-colors md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'users' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-300'}`}
          >
            {t('common.members')}
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === 'notifications' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-300'}`}
            title={t('settings.notifications')}
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
            <div className="space-y-6">
              {groupedUsers.map(group => (
                <div key={group.id}>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    {group.name}
                  </h3>
                  <div className="space-y-1">
                    {group.users.map(user => {
                      const status = getDisplayStatus(user);
                      return (
                        <div 
                          key={user.id} 
                          onClick={() => setSelectedUser(user)}
                          onContextMenu={(e) => handleContextMenu(e, user)}
                          className={clsx(
                            "flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800/50 transition-colors cursor-pointer group",
                            group.isOffline && "opacity-60"
                          )}
                        >
                          <UserAvatar 
                            user={{
                              username: user.username,
                              avatar_url: user.avatar_url,
                              status: group.isOffline ? 'offline' : status
                            }} 
                            size="md" 
                            className={group.isOffline ? "opacity-60" : ""}
                          />
                          <span className={clsx(
                            "text-sm font-medium truncate shrink",
                            group.isOffline ? "text-zinc-400" : "text-zinc-300"
                          )}>
                            {user.username}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groupedUsers.length === 0 && (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  {t('common.noMembers')}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {t('notifications.mentionsAndNotifications')}
                </h3>
                {notifications.some(n => !n.read) && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-tight"
                  >
                    {t('notifications.markAllRead')}
                  </button>
                )}
              </div>
              
              {unreadDMsList.length > 0 && (
                <div className="mb-6 space-y-3">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase">{t('notifications.unreadDMs')}</h4>
                  {unreadDMsList.map(dm => {
                    const isGroup = dm.participants.length > 2;
                      const dmName = isGroup 
                        ? t('common.group') 
                        : users.find(u => u.id === dm.participants.find((p: string) => p !== currentUser?.id))?.username || t('common.user');

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
                            <span className="font-medium text-zinc-200">{t('notifications.newMessageFrom', { name: dmName })}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-zinc-500">
                              {format(new Date(dm.last_message_at), 'dd/MM/yyyy HH:mm')}
                            </span>
                            <span className="text-xs text-indigo-400 font-medium">{t('common.open')}</span>
                          </div>
                        </div>
                      );
                  })}
                </div>
              )}

              {notifications.length > 0 ? (
                <div className="space-y-3">
                  {notifications.map(notif => (
                    <div 
                      key={notif.id} 
                      className={clsx(
                        "bg-zinc-800/50 p-3 rounded-md border transition-colors cursor-pointer hover:bg-zinc-700/50 group",
                        notif.read ? "border-zinc-700/30 opacity-70" : "border-indigo-500/50 bg-indigo-500/5"
                      )}
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
                          <span>{t('notifications.mentionedBy')} <span className="font-medium text-zinc-300">{notif.author_name}</span></span>
                        </div>
                        {!notif.read && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notif.id);
                            }}
                            className="text-zinc-500 hover:text-indigo-400 transition-colors"
                            title={t('notifications.markAsRead')}
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
                          {t('notifications.viewMessage')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : unreadDMsList.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  {t('notifications.noNotifications')}
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
          onViewProfile={() => {
            const u = users.find(u => u.id === contextMenu.userId);
            if (u) setSelectedUser(u);
          }}
        />
      )}
    </>
  );
}
