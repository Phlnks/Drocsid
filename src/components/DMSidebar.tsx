import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { MessageSquare, Search, User, Settings } from 'lucide-react';
import clsx from 'clsx';
import VoicePanel from './VoicePanel';
import UserSettingsModal from './ui/UserSettingsModal';
import UserAvatar from './ui/UserAvatar';
import UserContextMenu from './ui/UserContextMenu';

export default function DMSidebar() {
  const { user } = useAuthStore();
  const { selectedDmId, setSelectedDmId, connectedVoiceChannelId, onlineUserIds } = useAppStore();
  const [dms, setDms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number } | null>(null);

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
          const otherUser = otherUsers.length > 0 ? otherUsers[0] : { username: 'Unknown User', avatar_url: '', status: 'offline' };
          return { ...dm, otherUsers, otherUser };
        });
        resolvedDms.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
        setDms(resolvedDms);
      } else {
        setDms([]);
      }
    };

    fetchDMs();

    const channel = supabase.channel('dm_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dms' }, () => fetchDMs())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, (payload) => {
        setCurrentUserProfile(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    // Fetch all users for the search list (in a real app, this would be paginated or server-side searched)
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('*').neq('id', user.id);
      if (data) setUsers(data);
    };
    fetchUsers();

    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) setCurrentUserProfile(data);
    };
    fetchProfile();

    const channel = supabase.channel('user_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
        fetchProfile();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleStartDM = async (otherUserId: string) => {
    if (!user) return;

    // Check if a 1-on-1 DM already exists
    const existingDm = dms.find(dm => 
      dm.participants && 
      dm.participants.length === 2 && 
      dm.participants.includes(otherUserId)
    );
    if (existingDm) {
      setSelectedDmId(existingDm.id);
      setSearchQuery('');
      return;
    }

    // Create new DM
    try {
      const { data: newDm, error } = await supabase.from('dms').insert({
        participants: [user.id, otherUserId]
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

    const channel = supabase.channel('relationship_changes')
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

  const handleContextMenu = (e: React.MouseEvent, u: any) => {
    e.preventDefault();
    setContextMenu({
      userId: u.id,
      username: u.username || u.displayName,
      x: e.clientX,
      y: e.clientY
    });
  };

  return (
    <>
      <div className="flex-1 md:w-60 bg-zinc-900 flex flex-col flex-shrink-0 border-r border-zinc-800">
        <div className="h-12 border-b border-zinc-800 flex items-center px-4 shadow-sm">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Rechercher ou démarrer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 text-zinc-200 text-sm rounded-md py-1 pl-8 pr-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Search className="w-4 h-4 text-zinc-400 absolute left-2 top-1.5" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {!searchQuery && (
            <div className="px-2 mb-4">
              <button
                onClick={() => setSelectedDmId(null)}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors",
                  selectedDmId === null ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                )}
              >
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5" />
                  <span className="font-medium">Amis</span>
                </div>
                {pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {searchQuery ? (
            <div className="px-2">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-2">
                Utilisateurs
              </div>
              {filteredUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => handleStartDM(u.id)}
                  onContextMenu={(e) => handleContextMenu(e, u)}
                  className="flex items-center gap-3 px-2 py-2 rounded hover:bg-zinc-800 cursor-pointer group"
                >
                  <UserAvatar user={{ username: u.username || u.displayName, avatarUrl: u.avatarUrl || u.photoURL, status: onlineUserIds.includes(u.id) ? (u.status || 'online') : 'offline' }} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-300 font-medium truncate group-hover:text-zinc-100">
                      {u.username || u.displayName || 'Utilisateur'}
                    </div>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-zinc-500 text-sm px-2 py-4 text-center">
                  Aucun utilisateur trouvé
                </div>
              )}
            </div>
          ) : (
            <div className="px-2">
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Messages Privés
                </div>
              </div>
              
              {dms.map(dm => {
                const isGroup = dm.participants.length > 2;
                const dmName = isGroup 
                  ? dm.otherUsers.map((u: any) => u.username).join(', ') 
                  : dm.otherUser?.username || 'Utilisateur';
                
                const isUnread = dm.last_message_at && 
                                 (!currentUserProfile?.last_read?.[dm.id] || new Date(dm.last_message_at).getTime() > currentUserProfile.last_read[dm.id]) &&
                                 selectedDmId !== dm.id;
                
                const getDisplayStatus = (u: any) => {
                  if (!u) return 'offline';
                  if (!onlineUserIds.includes(u.id)) return 'offline';
                  return u.status || 'online';
                };

                return (
                  <div
                    key={dm.id}
                    onClick={() => setSelectedDmId(dm.id)}
                    onContextMenu={(e) => !isGroup && handleContextMenu(e, dm.otherUser)}
                    className={clsx(
                      "flex items-center gap-3 px-2 py-2 rounded cursor-pointer group mb-0.5",
                      selectedDmId === dm.id 
                        ? "bg-zinc-800 text-zinc-100" 
                        : isUnread 
                          ? "text-zinc-100 font-semibold" 
                          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                    )}
                  >
                    {isGroup ? (
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                    ) : (
                      <UserAvatar user={{ username: dm.otherUser?.username, avatarUrl: dm.otherUser?.avatar_url, status: getDisplayStatus(dm.otherUser) }} size="md" />
                    )}
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <div className="font-medium truncate">
                        {dmName}
                      </div>
                      {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-white ml-2 shrink-0"></div>}
                    </div>
                  </div>
                );
              })}
              
              {dms.length === 0 && (
                <div className="text-zinc-500 text-sm px-2 py-4 text-center">
                  Aucun message privé
                </div>
              )}
            </div>
          )}
        </div>
        
        {connectedVoiceChannelId && <VoicePanel />}

        {/* User Profile Area at bottom of sidebar */}
        <div 
          className="h-14 bg-zinc-950/50 flex items-center px-2 flex-shrink-0 gap-2 cursor-pointer hover:bg-zinc-800 transition-colors"
          onClick={() => setIsSettingsOpen(true)}
        >
          <UserAvatar 
            user={{
              username: currentUserProfile?.username || user?.user_metadata?.username || 'Moi',
              avatarUrl: currentUserProfile?.avatar_url || user?.user_metadata?.avatar_url || '',
              status: currentUserProfile?.status || 'online'
            }} 
            size="md" 
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-zinc-100 truncate">
              {currentUserProfile?.username || user?.email || 'Moi'}
            </div>
            <div className="text-xs text-zinc-400 truncate capitalize">
              {currentUserProfile?.status === 'dnd' ? 'Ne pas déranger' : 
               currentUserProfile?.status === 'idle' ? 'Absent' : 
               currentUserProfile?.status === 'offline' ? 'Hors ligne' : 'En ligne'}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(true); }} className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-zinc-100">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
