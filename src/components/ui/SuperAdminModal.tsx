import { useState, useEffect } from 'react';
import { X, Shield, Search, Check, AlertTriangle, Trash2, Server, Users as UsersIcon, LogIn, Ban } from 'lucide-react';
import { supabase } from '../../supabase';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';

interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SuperAdminModal({ isOpen, onClose }: SuperAdminModalProps) {
  const { t } = useTranslation();
  const { user: currentUser, currentUserProfile } = useAuthStore();
  const { addNotification, setSelectedServerId } = useAppStore();
  
  const [activeTab, setActiveTab] = useState<'users' | 'servers'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && currentUserProfile?.is_super_admin) {
      loadData();
    }
  }, [isOpen, currentUserProfile, activeTab]);

  const loadData = async () => {
    setLoading(true);
    setSelectedUserIds(new Set());
    try {
      if (activeTab === 'users') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const baseUrl = window.location.origin;
          const res = await fetch(`${baseUrl}/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          setUsers(data || []);
        }
      } else {
        const { data: serversData, error } = await supabase
          .from('servers')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        
        if (serversData && serversData.length > 0) {
          const ownerIds = [...new Set(serversData.map(s => s.owner_id))].filter(Boolean);
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', ownerIds);
            
          const mappedServers = serversData.map((s: any) => {
            const profile = profilesData?.find(p => p.id === s.owner_id);
            return {
              ...s,
              profiles: profile ? { username: profile.username } : null
            };
          });
          setServers(mappedServers || []);
        } else {
          setServers([]);
        }
      }
    } catch (err: any) {
      console.error(err);
      addNotification(`Error loading ${activeTab}: ` + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserCreationRights = async (userId: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ can_create_servers: !current })
        .eq('id', userId);
      if (error) throw error;
      
      setUsers(users.map(u => u.id === userId ? { ...u, can_create_servers: !current } : u));
      addNotification("User rights updated", "success");
    } catch (err: any) {
      addNotification("Update failed: " + err.message, "error");
    }
  };

  const handleBulkBan = async (ban: boolean) => {
    if (selectedUserIds.size === 0) return;
    if (!confirm(`Are you sure you want to ${ban ? 'ban' : 'unban'} ${selectedUserIds.size} user(s)?`)) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/admin/ban`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userIds: Array.from(selectedUserIds), ban })
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      addNotification(`Users ${ban ? 'banned' : 'unbanned'} successfully`, "success");
      loadData();
    } catch (err: any) {
      addNotification("Failed to update ban status: " + err.message, "error");
    }
  };

  const toggleUserSelection = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelectedUserIds(next);
  };

  const toggleAllUsers = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.filter(u => !u.is_super_admin).map(u => u.id)));
    }
  };

  const deleteServer = async (serverId: string) => {
    if (!confirm("Are you sure you want to delete this server as a Super Admin?")) return;
    try {
      const { error } = await supabase
        .from('servers')
        .delete()
        .eq('id', serverId);
      if (error) throw error;
      
      setServers(servers.filter(s => s.id !== serverId));
      addNotification("Server deleted successfully", "success");
    } catch (err: any) {
      addNotification("Failed to delete server: " + err.message, "error");
    }
  };

  const joinServer = async (serverId: string) => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('server_members')
        .insert({ server_id: serverId, user_id: currentUser.id, roles: [] });
      
      if (error && error.code !== '23505') throw error; // ignore duplicate key if already joined
      
      setSelectedServerId(serverId);
      addNotification("Joined server automatically", "success");
      onClose();
    } catch (err: any) {
      addNotification("Failed to join server: " + err.message, "error");
    }
  };

  if (!isOpen) return null;
  if (!currentUserProfile?.is_super_admin) return null;

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase()) || 
    u.id.includes(search)
  );
  const filteredServers = servers.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()) || s.id.includes(search));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-zinc-800 w-full max-w-5xl h-full md:h-[85vh] rounded-none md:rounded-lg shadow-2xl flex flex-col md:flex-row overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-full md:w-60 bg-zinc-900/50 flex md:flex-col p-4 border-b md:border-b-0 md:border-r border-zinc-700/50 shrink-0 gap-2">
          <div className="hidden md:flex items-center gap-2 mb-4 px-2 text-indigo-400">
            <Shield className="w-5 h-5" />
            <span className="font-bold uppercase tracking-wider text-sm">Super Admin</span>
          </div>
          
          <button
            onClick={() => setActiveTab('users')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'users' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <UsersIcon className="w-4 h-4" />
            <span className="font-medium">Users Mgmt</span>
          </button>
          
          <button
            onClick={() => setActiveTab('servers')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'servers' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <Server className="w-4 h-4" />
            <span className="font-medium">Servers Mgmt</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-zinc-800 relative min-h-0 min-w-0">
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded-full transition-colors flex flex-col items-center gap-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 md:p-10 flex-1 overflow-hidden flex flex-col min-w-0">
            <h2 className="text-xl font-bold text-zinc-100 mb-6">
              {activeTab === 'users' ? 'User Management' : 'Server Management'}
            </h2>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-md py-2 pl-10 pr-4 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              {activeTab === 'users' && selectedUserIds.size > 0 && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleBulkBan(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors rounded-md text-sm font-medium"
                  >
                    <Ban className="w-4 h-4" />
                    Ban Selected
                  </button>
                  <button 
                    onClick={() => handleBulkBan(false)}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors rounded-md text-sm font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Unban Selected
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-w-0">
              {loading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
                </div>
              ) : activeTab === 'users' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase">
                    <input 
                      type="checkbox" 
                      onChange={toggleAllUsers}
                      checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.filter(u => !u.is_super_admin).length}
                      className="rounded border-zinc-600 cursor-pointer"
                    />
                    <div className="flex-1">User Info</div>
                    <div className="w-32 text-center">Status</div>
                    <div className="w-24 text-right">Create Srv</div>
                  </div>
                  {filteredUsers.map(u => (
                    <div key={u.id} className={clsx(
                      "bg-zinc-900/50 border border-zinc-700/50 p-4 rounded-lg flex items-center justify-between group gap-4 transition-colors",
                      selectedUserIds.has(u.id) && "border-indigo-500/50 bg-indigo-500/10"
                    )}>
                      <input 
                        type="checkbox"
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
                        disabled={u.is_super_admin}
                        className="rounded border-zinc-600 bg-zinc-800 shrink-0 cursor-pointer disabled:opacity-50"
                      />
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <img src={u.avatar_url || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full bg-zinc-800 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-zinc-100 flex items-center gap-2 truncate">
                            <span className={clsx("truncate", u.is_banned && "text-zinc-500 line-through")}>{u.username}</span>
                            {u.is_super_admin && <span title="Super Admin" className="shrink-0"><Shield className="w-3.5 h-3.5 text-rose-500" /></span>}
                          </div>
                          <div className="text-xs text-zinc-500 font-mono flex items-center gap-2 truncate">
                            {u.email && <span className="truncate">{u.email}</span>}
                            {u.email && <span className="text-zinc-700 shrink-0">•</span>}
                            <span className="truncate">ID: {u.id}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-32 shrink-0 flex justify-center">
                        {u.is_banned ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-red-400/10 text-red-400 border border-red-400/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Banned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-end w-24 shrink-0">
                        <button
                          onClick={() => toggleUserCreationRights(u.id, !!u.can_create_servers)}
                          disabled={u.is_super_admin}
                          className={clsx(
                            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                            u.can_create_servers ? "bg-emerald-500" : "bg-zinc-600",
                            u.is_super_admin && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <span className={clsx("inline-block h-3 w-3 transform rounded-full bg-white transition-transform", u.can_create_servers ? "translate-x-5" : "translate-x-1")} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="text-center p-8 text-zinc-500">No users found.</div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredServers.map(s => (
                    <div key={s.id} className="bg-zinc-900/50 border border-zinc-700/50 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between group gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                          {s.icon_url ? <img src={s.icon_url} alt="" className="w-full h-full object-cover" /> : <Server className="w-5 h-5 text-zinc-500" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-zinc-100 truncate">{s.name}</div>
                          <div className="text-xs text-zinc-500 truncate mt-0.5">Owner: {s.profiles?.username || s.owner_id} • ID: {s.id}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => joinServer(s.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded transition-colors text-sm font-medium"
                          title="Join Server automatically"
                        >
                          <LogIn className="w-4 h-4" />
                          <span className="hidden sm:inline">Join</span>
                        </button>
                        <button
                          onClick={() => deleteServer(s.id)}
                          className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors"
                          title="Delete Server globally"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredServers.length === 0 && (
                    <div className="text-center p-8 text-zinc-500">No servers found.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

