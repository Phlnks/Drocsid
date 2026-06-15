import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { Users, MessageSquare, Check, X, UserPlus, MoreVertical, ArrowLeft } from 'lucide-react';
import UserAvatar from './ui/UserAvatar';
import { useTranslation } from 'react-i18next';

type Tab = 'online' | 'all' | 'pending' | 'add';

export default function FriendsDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('online');
  const [relationships, setRelationships] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addMessage, setAddMessage] = useState({ type: '', text: '' });
  
  const { user, currentUserProfile } = useAuthStore();
  const { setSelectedDmId, setIsMobileNavOpen, connectedVoiceChannelId, addNotification, onlineUserIds } = useAppStore();

  useEffect(() => {
    const searchUsers = async () => {
      if (searchUsername.trim().length < 3) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .ilike('username', `%${searchUsername.trim()}%`)
          .limit(10);

        if (error) throw error;
        
        // Filter out current user
        setSearchResults(data.filter(u => u.id !== user?.id));
      } catch (error) {
        console.error("Error searching users:", error);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchUsername, user]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      // Fetch relationships
      const { data: relsData, error: relsError } = await supabase
        .from('relationships')
        .select('*')
        .contains('participants', [user.id]);
      
      if (relsError) {
        console.error("Error fetching relationships:", relsError);
        return;
      }

      setRelationships(relsData || []);

      // Fetch profiles for all participants in relationships
      const participantIds = new Set<string>();
      relsData?.forEach(rel => {
        rel.participants.forEach((id: string) => participantIds.add(id));
      });

      if (participantIds.size > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', Array.from(participantIds));

        if (usersError) {
          console.error("Error fetching profiles:", usersError);
          return;
        }

        const uMap: Record<string, any> = {};
        usersData?.forEach(u => {
          uMap[u.id] = u;
        });
        setUsersMap(uMap);
      }
    };

    fetchData();

    const channelName = 'friends_dashboard_' + (user?.id || 'anon');
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    });
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleAccept = async (relId: string) => {
    try {
      const { error } = await supabase.from('relationships').update({
        status: 'accepted',
        updated_at: new Date().toISOString()
      }).eq('id', relId);
      
      if (error) throw error;

      // Add notification for the requester
      const rel = relationships.find(r => r.id === relId);
      const requesterId = rel?.requester_id;
      if (requesterId && requesterId !== user?.id) {
        const { error: notifErr } = await supabase.from('notifications').insert({
          user_id: requesterId,
          type: 'friend_accept',
          data: {
            author_id: user?.id,
            author_name: currentUserProfile?.username || user?.user_metadata?.username || user?.user_metadata?.display_name || 'Utilisateur',
            content: t('friends.notificationFriendAccepted')
          },
          read: false,
          notified: false
        });
        if (notifErr) {
          console.error("❌ [Db Notifications] Friend acceptance insert failed:", notifErr);
        } else {
          console.log("✅ [Db Notifications] Friend acceptance inserted for:", requesterId);
        }
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
      addNotification(t('friends.acceptError'), "error");
    }
  };

  const handleDeclineOrCancel = async (relId: string) => {
    try {
      const { error } = await supabase.from('relationships').delete().eq('id', relId);
      if (error) throw error;
    } catch (error) {
      console.error("Error declining friend request:", error);
      addNotification(t('friends.declineError'), "error");
    }
  };

  const sendFriendRequest = async (targetUserId: string) => {
    setAddMessage({ type: '', text: '' });
    if (!user) return;

    try {
      // Check if relationship already exists
      const existingRel = relationships.find(r => r.participants && r.participants.includes(targetUserId));
      
      if (existingRel) {
        if (existingRel.status === 'accepted') {
          setAddMessage({ type: 'error', text: t('friends.alreadyFriends') });
        } else {
          setAddMessage({ type: 'error', text: t('friends.requestInProgress') });
        }
        return;
      }

      const { error } = await supabase.from('relationships').insert({
        participants: [user.id, targetUserId],
        status: 'pending',
        requester_id: user.id
      });

      if (error) throw error;

      // Add notification for the target user
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: targetUserId,
        type: 'friend_request',
        data: {
          author_id: user.id,
          author_name: currentUserProfile?.username || user.user_metadata?.username || user.user_metadata?.display_name || 'Utilisateur',
          content: t('friends.notificationFriendRequest')
        },
        read: false,
        notified: false
      });
      if (notifErr) {
        console.error("❌ [Db Notifications] Friend request insert failed:", notifErr);
      } else {
        console.log("✅ [Db Notifications] Friend request inserted for:", targetUserId);
      }

      setAddMessage({ type: 'success', text: t('friends.addFriendSuccess') });
    } catch (error) {
      console.error("Error sending friend request:", error);
      setAddMessage({ type: 'error', text: t('common.errorOccurred') });
    }
  };

  const handleMessage = async (otherUserId: string) => {
    if (!user) return;
    
    // Check if DM exists
    const { data: dmsData } = await supabase.from('dms').select('*').contains('participants', [user.id]);
    
    let existingDmId = null;
    if (dmsData) {
      for (const dm of dmsData) {
        if (dm.participants && dm.participants.includes(otherUserId) && dm.participants.length === 2) {
          existingDmId = dm.id;
          break;
        }
      }
    }

    if (existingDmId) {
      setSelectedDmId(existingDmId);
    } else {
      const { data: newDm, error } = await supabase.from('dms').insert({
        participants: [user.id, otherUserId]
      }).select().single();
      
      if (error) {
        console.error("Error creating DM:", error);
        return;
      }
      setSelectedDmId(newDm.id);
    }
    
    if (window.innerWidth < 768) {
      setIsMobileNavOpen(false);
    }
  };

  const getOtherUserId = (rel: any) => rel.participants.find((id: string) => id !== user?.id);

  const getDisplayStatus = (u: any) => {
    if (!u) return 'offline';
    if (!onlineUserIds.includes(u.id)) return 'offline';
    return u.status || 'online';
  };

  const friends = relationships.filter(r => r.status === 'accepted');
  const onlineFriends = friends.filter(r => {
    const otherUser = usersMap[getOtherUserId(r)];
    return getDisplayStatus(otherUser) !== 'offline';
  });
  const pendingRequests = relationships.filter(r => r.status === 'pending');

  const renderFriendList = (list: any[], emptyMessage: string) => {
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500">
          <div className="w-48 h-48 mb-4 opacity-50 bg-zinc-800 rounded-full flex items-center justify-center">
            <Users className="w-20 h-20" />
          </div>
          <p>{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="space-y-1 mt-4">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 px-2">
          {t('friends.friendsCount', { count: list.length })}
        </h2>
        {list.map(rel => {
          const otherUserId = getOtherUserId(rel);
          const otherUser = usersMap[otherUserId];
          if (!otherUser) return null;
          
          const displayStatus = getDisplayStatus(otherUser);

          return (
            <div 
              key={rel.id} 
              onClick={() => handleMessage(otherUserId)}
              className="flex items-center justify-between p-3 hover:bg-zinc-800/50 rounded-lg group border-t border-zinc-800/50 first:border-0 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <UserAvatar user={{...otherUser, status: displayStatus}} size="md" />
                <div>
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    {otherUser.username}
                  </div>
                  <div className="text-sm text-zinc-400 capitalize">
                    {displayStatus === 'dnd' ? t('common.dnd') : 
                     displayStatus === 'idle' ? t('common.idle') : 
                     displayStatus === 'offline' ? t('common.offline') : t('common.online')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleMessage(otherUserId); }}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full transition-colors"
                  title={t('friends.message')}
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeclineOrCancel(rel.id); }}
                  className="p-2 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 rounded-full transition-colors"
                  title={t('friends.removeFriend')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 bg-zinc-800 flex flex-col min-w-0">
      {/* Header */}
      <div className="h-12 border-b border-zinc-700 flex items-center px-4 shadow-sm shrink-0 gap-4 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 text-zinc-100 font-semibold border-r border-zinc-700 pr-4 shrink-0">
          <button 
            onClick={() => setIsMobileNavOpen(true)}
            className="md:hidden p-1.5 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Users className="w-5 h-5 text-zinc-400 hidden md:block" />
          {t('friends.title')}
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTab('online')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'online' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-300'}`}
          >
            {t('friends.online')}
          </button>
          <button 
            onClick={() => setActiveTab('all')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-300'}`}
          >
            {t('friends.all')}
          </button>
          <button 
            onClick={() => setActiveTab('pending')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors flex items-center gap-1 ${activeTab === 'pending' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-300'}`}
          >
            {t('friends.pending')}
                {pendingRequests.filter(r => r.requester_id !== user?.id).length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingRequests.filter(r => r.requester_id !== user?.id).length}
                  </span>
                )}
          </button>
          <button 
            onClick={() => setActiveTab('add')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${activeTab === 'add' ? 'bg-emerald-600 text-white' : 'bg-emerald-600/20 text-emerald-500 hover:bg-emerald-600/30'}`}
          >
            {t('friends.addFriend')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto p-6 pb-safe ${connectedVoiceChannelId ? 'pt-16 md:pt-6' : ''}`}>
        {activeTab === 'online' && renderFriendList(onlineFriends, t('friends.noOnlineFriends'))}
        {activeTab === 'all' && renderFriendList(friends, t('friends.noFriends'))}
        
        {activeTab === 'pending' && (
          pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <div className="w-48 h-48 mb-4 opacity-50 bg-zinc-800 rounded-full flex items-center justify-center">
                <UserPlus className="w-20 h-20" />
              </div>
              <p>{t('friends.noPending')}</p>
            </div>
          ) : (
            <div className="space-y-1 mt-4">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 px-2">
                {t('friends.pendingCount', { count: pendingRequests.length })}
              </h2>
              {pendingRequests.map(rel => {
                const otherUserId = getOtherUserId(rel);
                const otherUser = usersMap[otherUserId];
                const isIncoming = rel.requester_id !== user?.id;
                
                if (!otherUser) return null;

                return (
                  <div key={rel.id} className="flex items-center justify-between p-3 hover:bg-zinc-800/50 rounded-lg group border-t border-zinc-800/50 first:border-0">
                    <div className="flex items-center gap-3">
                      <UserAvatar user={otherUser} size="md" />
                      <div>
                        <div className="font-semibold text-zinc-100 flex items-center gap-2">
                          {otherUser.username}
                        </div>
                        <div className="text-sm text-zinc-400">
                          {isIncoming ? t('friends.incomingRequest') : t('friends.outgoingRequest')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isIncoming && (
                        <button 
                          onClick={() => handleAccept(rel.id)}
                          className="p-2 bg-zinc-800 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-400 rounded-full transition-colors"
                          title={t('common.accept')}
                        >
                          <Check className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDeclineOrCancel(rel.id)}
                        className="p-2 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 rounded-full transition-colors"
                        title={isIncoming ? t('common.ignore') : t('common.cancel')}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === 'add' && (
          <div className="max-w-2xl">
            <h2 className="text-base font-bold text-zinc-100 mb-2">{t('friends.addFriendTitle')}</h2>
            <p className="text-sm text-zinc-400 mb-4">
              {t('friends.addFriendDesc')}
            </p>
            
            <div className="relative mb-4">
              <input
                type="text"
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                placeholder={t('friends.addFriendPlaceholder')}
                className={`w-full bg-zinc-900 border ${addMessage.type === 'success' ? 'border-emerald-500' : addMessage.type === 'error' ? 'border-red-500' : 'border-zinc-700 focus:border-indigo-500'} rounded-lg px-4 py-3 text-zinc-100 focus:outline-none`}
              />
              {isSearching && (
                <div className="absolute right-4 top-3.5">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            
            {addMessage.text && (
              <p className={`text-sm mb-4 ${addMessage.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                {addMessage.text}
              </p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-2">
                  {t('friends.searchResults')}
                </h3>
                {searchResults.map(targetUser => {
                  const existingRel = relationships.find(r => r.participants && r.participants.includes(targetUser.id));
                  const isPending = existingRel?.status === 'pending';
                  const isAccepted = existingRel?.status === 'accepted';

                  return (
                    <div key={targetUser.id} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/50">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={targetUser} size="md" />
                        <span className="font-semibold text-zinc-100">{targetUser.username}</span>
                      </div>
                      <button
                        disabled={!!existingRel}
                        onClick={() => sendFriendRequest(targetUser.id)}
                        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                          isAccepted ? 'bg-zinc-700 text-zinc-400 cursor-default' :
                          isPending ? 'bg-zinc-700 text-zinc-400 cursor-default' :
                          'bg-indigo-500 hover:bg-indigo-600 text-white'
                        }`}
                      >
                        {isAccepted ? t('friends.friends') : isPending ? t('friends.pending') : t('common.add')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {searchUsername.length >= 3 && !isSearching && searchResults.length === 0 && (
              <p className="text-center text-zinc-500 py-8">{t('friends.noUsersFound')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
