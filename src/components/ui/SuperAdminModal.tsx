import { useState, useEffect } from 'react';
import { X, Shield, Search, Check, AlertTriangle, Trash2, Server, Users as UsersIcon, LogIn, Ban, Link2, Ghost, BarChart2, Bell, Edit, MessageSquare, History, Flag, Database, Key } from 'lucide-react';
import { supabase } from '../../supabase';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { useInstanceStore } from '../../store/instanceStore';
import { copyToClipboard } from '../../lib/utils';
import clsx from 'clsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SuperAdminModal({ isOpen, onClose }: SuperAdminModalProps) {
  const { t } = useTranslation();
  const { user: currentUser, currentUserProfile, startImpersonation } = useAuthStore();
  const { addNotification, setSelectedServerId } = useAppStore();
  const { getCurrentInstance } = useInstanceStore();
  
  const [activeTab, setActiveTab] = useState<'users' | 'servers' | 'dashboard' | 'messages' | 'audit' | 'reports'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageSearch, setMessageSearch] = useState('');
  const [announcement, setAnnouncement] = useState('');
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');

      if (activeTab === 'users') {
        const res = await fetch(`${baseUrl}/api/admin/users`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setUsers(data || []);
      } else if (activeTab === 'servers') {
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
      } else if (activeTab === 'dashboard') {
        const resStats = await fetch(`${baseUrl}/api/admin/dashboard`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!resStats.ok) throw new Error(await resStats.text());
        setStats(await resStats.json());

        const resChart = await fetch(`${baseUrl}/api/admin/dashboard/chart`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (resChart.ok) setChartData(await resChart.json());

        const resStorage = await fetch(`${baseUrl}/api/admin/storage`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (resStorage.ok) setStorageStats(await resStorage.json());

      } else if (activeTab === 'audit') {
        const res = await fetch(`${baseUrl}/api/admin/audit`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        setAuditLogs(await res.json() || []);
      } else if (activeTab === 'reports') {
        const res = await fetch(`${baseUrl}/api/admin/reports`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        setReports(await res.json() || []);
      }
    } catch (err: any) {
      console.error(err);
      addNotification(`Error loading ${activeTab}: ` + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalAnnounce = async () => {
    if (!announcement.trim()) return;
    if (!confirm("Are you sure you want to send this global announcement to ALL servers?")) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin;
      if (baseUrl.includes('file://') || baseUrl.includes('drocsid://')) {
        baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
      }
      baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/announce`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: announcement })
      });
      
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      
      addNotification(`Global announcement sent to ${data.serversReached} servers!`, "success");
      setAnnouncement('');
    } catch (err: any) {
      addNotification("Failed to send announcement: " + err.message, "error");
    }
  };

  const handleImpersonate = (u: any) => {
    if (confirm(`Are you sure you want to impersonate ${u.username}? You will see the app as them temporarily.`)) {
      const mockUser = {
        id: u.id,
        email: u.email,
        user_metadata: { username: u.username, avatar_url: u.avatar_url },
        app_metadata: {},
        aud: 'authenticated',
        created_at: u.created_at || new Date().toISOString(),
        role: 'authenticated',
        updated_at: u.updated_at || new Date().toISOString()
      };
      startImpersonation(mockUser as any, u);
      addNotification(`Started impersonating ${u.username}`, "success");
      onClose();
    }
  };

  const handleUserEdit = async (u: any) => {
    const newUsername = prompt("New username:", u.username);
    const resetAvatar = confirm("Do you want to reset their avatar?");
    
    if (newUsername === null && !resetAvatar) return; // cancelled
    if (newUsername?.trim() === '' && !resetAvatar) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/user/${u.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          username: newUsername !== u.username ? newUsername : undefined, 
          resetAvatar 
        })
      });
      if (!res.ok) throw new Error(await res.text());
      addNotification("User profile updated", "success");
      loadData();
    } catch (e: any) {
      addNotification("Failed to edit user: " + e.message, "error");
    }
  };

  const handleResetPassword = async (u: any) => {
    const newPassword = prompt(`Enter a new password for ${u.username} (minimum 6 characters):`);
    if (newPassword === null) return; // cancelled
    if (newPassword.trim().length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/reset-password`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          userId: u.id, 
          newPassword: newPassword.trim() 
        })
      });
      if (!res.ok) throw new Error(await res.text());
      addNotification(`Password for ${u.username} has been successfully reset.`, "success");
    } catch (e: any) {
      addNotification("Failed to reset password: " + e.message, "error");
    }
  };

  const handleServerEdit = async (s: any) => {
    const newName = prompt("New server name:", s.name);
    const newOwnerId = prompt("New Owner ID (uuid):", s.owner_id);
    
    if (!newName && !newOwnerId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/server/${s.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          name: newName !== s.name ? newName : undefined, 
          owner_id: newOwnerId !== s.owner_id ? newOwnerId : undefined 
        })
      });
      if (!res.ok) throw new Error(await res.text());
      addNotification("Server updated", "success");
      loadData();
    } catch (e: any) {
      addNotification("Failed to edit server: " + e.message, "error");
    }
  };

  const handleMessageSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageSearch.trim()) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/messages/search?q=${encodeURIComponent(messageSearch)}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessages(data || []);
    } catch (e: any) {
      addNotification("Message search failed: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm("Are you sure you want to forcibly delete this message?")) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/messages/${msgId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      addNotification("Message deleted successfully", "success");
      setMessages(messages.filter(m => m.id !== msgId));
    } catch (e: any) {
      addNotification("Failed to delete message: " + e.message, "error");
    }
  };

  const handleReportStatus = async (reportId: string, status: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/reports/${reportId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text());
      addNotification(`Report marked as ${status}`, "success");
      setReports(reports.map(r => r.id === reportId ? { ...r, details: JSON.stringify({ ...JSON.parse(r.details || '{}'), status }) } : r));
    } catch (e: any) {
      addNotification("Failed to update report: " + e.message, "error");
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
      
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
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

  const handleSingleBan = async (userId: string, ban: boolean) => {
    if (!confirm(`Are you sure you want to ${ban ? 'ban' : 'unban'} this user?`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin; if(baseUrl.includes('file://') || baseUrl.includes('drocsid://')) baseUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; baseUrl = baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/admin/ban`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userIds: [userId], ban })
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      addNotification(`User ${ban ? 'banned' : 'unbanned'} successfully`, "success");
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
    const selectableUsers = filteredUsers.filter(u => !u.is_super_admin);
    if (selectedUserIds.size === selectableUsers.length && selectableUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(selectableUsers.map(u => u.id)));
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

  const copyInvite = async (serverId: string) => {
    if (!currentUser) return;
    try {
      const { data: invites } = await supabase
        .from('invites')
        .select('code')
        .eq('server_id', serverId)
        .order('created_at', { ascending: false })
        .limit(1);

      let inviteCode = '';
      if (invites && invites.length > 0) {
        inviteCode = invites[0].code;
      } else {
        inviteCode = Math.random().toString(36).substring(2, 8);
        await supabase.from('invites').insert({
          server_id: serverId,
          creator_id: currentUser.id,
          code: inviteCode,
          uses: 0,
          max_uses: 0
        });
      }

      await copyToClipboard(inviteCode);
      addNotification("Invite code copied to clipboard", "success");
    } catch (err: any) {
      addNotification("Failed to copy invite code: " + err.message, "error");
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
            <span className="font-bold uppercase tracking-wider text-sm">{t('superAdmin.title', 'Super Admin')}</span>
          </div>
          
          <button
            onClick={() => setActiveTab('users')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'users' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <UsersIcon className="w-4 h-4" />
            <span className="font-medium">{t('superAdmin.usersMgmt', 'Users Mgmt')}</span>
          </button>
          
          <button
            onClick={() => setActiveTab('servers')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'servers' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <Server className="w-4 h-4" />
            <span className="font-medium">{t('superAdmin.serversMgmt', 'Servers Mgmt')}</span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'dashboard' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <BarChart2 className="w-4 h-4" />
            <span className="font-medium">{t('superAdmin.dashboard', 'Dashboard')}</span>
          </button>

          <button
            onClick={() => setActiveTab('messages')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'messages' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="font-medium">{t('superAdmin.globalMod', 'Modération Globale')}</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'audit' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <History className="w-4 h-4" />
            <span className="font-medium">{t('superAdmin.auditLogs', 'Audit Logs')}</span>
          </button>
          
          <button
            onClick={() => setActiveTab('reports')}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
              activeTab === 'reports' ? "bg-zinc-700/50 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
            )}
          >
            <Flag className="w-4 h-4" />
            <span className="font-medium">{t('reports.menuTitle', 'Signalements')}</span>
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
              {activeTab === 'users' ? t('superAdmin.userManagement', 'User Management') : 
               activeTab === 'servers' ? t('superAdmin.serverManagement', 'Server Management') : 
               activeTab === 'dashboard' ? t('superAdmin.dashboard', 'Dashboard') :
               activeTab === 'audit' ? t('superAdmin.auditLogs', 'Audit Logs') : 
               activeTab === 'reports' ? t('reports.headerTitle', 'Signalements Utilisateurs') : t('superAdmin.globalMessagesSearch', 'Global Messages Search')}
            </h2>

            {activeTab !== 'dashboard' && activeTab !== 'audit' && activeTab !== 'messages' && activeTab !== 'reports' && (
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
            )}

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-w-0">
              {loading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
                </div>
              ) : activeTab === 'dashboard' ? (
                <div className="space-y-8">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-zinc-900/50 border border-zinc-700/50 p-6 rounded-xl flex flex-col gap-2">
                      <div className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Messages Today</div>
                      <div className="text-3xl font-bold text-white">{stats?.messagesToday ?? '-'}</div>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-700/50 p-6 rounded-xl flex flex-col gap-2">
                      <div className="text-zinc-400 text-sm font-medium uppercase tracking-wider">New Accounts Today</div>
                      <div className="text-3xl font-bold text-white">{stats?.accountsToday ?? '-'}</div>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-700/50 p-6 rounded-xl flex flex-col gap-2">
                      <div className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Total Servers</div>
                      <div className="text-3xl font-bold text-white">{stats?.totalServers ?? '-'}</div>
                    </div>
                  </div>

                  {chartData.length > 0 && (
                    <div className="bg-zinc-900/50 border border-zinc-700/50 p-6 rounded-xl">
                      <h3 className="text-lg font-bold text-zinc-100 mb-6 flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-indigo-400" />
                        Activity Overview (14 Days)
                      </h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                            <XAxis dataKey="date" stroke="#a1a1aa" fontSize={12} tickMargin={10} />
                            <YAxis stroke="#a1a1aa" fontSize={12} />
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#f4f4f5' }}
                              itemStyle={{ color: '#818cf8' }}
                            />
                            <Line type="monotone" dataKey="messages" name="Messages" stroke="#818cf8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="users" name="New Users" stroke="#34d399" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Global Announcement Section */}
                  <div className="bg-zinc-900/50 border border-zinc-700/50 p-6 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-indigo-400 mb-2">
                      <Bell className="w-5 h-5" />
                      <h3 className="text-lg font-bold text-zinc-100">Global Announcement</h3>
                    </div>
                    <p className="text-sm text-zinc-400">
                      Send a system message to the default text channel of every server on the platform. Use this for maintenance warnings or platform updates.
                    </p>
                    <textarea 
                      value={announcement}
                      onChange={e => setAnnouncement(e.target.value)}
                      placeholder="Type your global announcement here..."
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-md p-3 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 min-h-[100px] resize-y"
                    />
                    <div className="flex justify-end">
                      <button 
                        onClick={handleGlobalAnnounce}
                        disabled={!announcement.trim()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded transition-colors flex items-center gap-2"
                      >
                        <Bell className="w-4 h-4" />
                        Send to All Servers
                      </button>
                    </div>
                  </div>
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
                    <div className="w-56 text-right">Actions</div>
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

                      <div className="flex items-center justify-end w-56 shrink-0 gap-2">
                        <button
                          onClick={() => handleUserEdit(u)}
                          disabled={u.is_super_admin}
                          title="Edit User Profile"
                          className={clsx(
                            "p-1.5 rounded transition-colors block",
                            "bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white",
                            u.is_super_admin && "opacity-50 cursor-not-allowed hidden"
                          )}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResetPassword(u)}
                          disabled={u.is_super_admin || !u.is_local_user}
                          title={u.is_local_user ? "Reset Password" : "Password reset only available for local accounts"}
                          className={clsx(
                            "p-1.5 rounded transition-colors block",
                            u.is_local_user 
                              ? "bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white"
                              : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                            u.is_super_admin && "opacity-50 cursor-not-allowed hidden"
                          )}
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleImpersonate(u)}
                          disabled={u.is_super_admin}
                          title="Impersonate User"
                          className={clsx(
                            "p-1.5 rounded transition-colors block", // block forces display
                            "bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white",
                            u.is_super_admin && "opacity-50 cursor-not-allowed hidden"
                          )}
                        >
                          <Ghost className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSingleBan(u.id, !u.is_banned)}
                          disabled={u.is_super_admin}
                          title={u.is_banned ? "Unban User" : "Ban User"}
                          className={clsx(
                            "p-1.5 rounded transition-colors block", // block forces display
                            u.is_banned 
                              ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white" 
                               : "bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white",
                            u.is_super_admin && "opacity-50 cursor-not-allowed hidden"
                          )}
                        >
                          {u.is_banned ? <Check className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => toggleUserCreationRights(u.id, !!u.can_create_servers)}
                          disabled={u.is_super_admin}
                          title={u.can_create_servers ? "Revoke rights to create servers" : "Grant rights to create servers"}
                          className={clsx(
                            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                            u.can_create_servers ? "bg-emerald-500" : "bg-zinc-600",
                            u.is_super_admin && "opacity-50 cursor-not-allowed hidden"
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
              ) : activeTab === 'messages' ? (
                <div className="space-y-4">
                  <form onSubmit={handleMessageSearch} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Search messages across all servers (Hit enter)..."
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md p-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
                      value={messageSearch}
                      onChange={(e) => setMessageSearch(e.target.value)}
                    />
                    <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium flex items-center justify-center">
                      <Search className="w-4 h-4" />
                    </button>
                  </form>
                  <div className="space-y-2 mt-4">
                    {messages.map(m => (
                      <div key={m.id} className="bg-zinc-900/50 border border-zinc-700/50 p-4 rounded-lg flex flex-col group gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-xs">
                            <strong className="text-zinc-200">{m.profiles?.username || 'Unknown'}</strong> 
                            &nbsp;in {m.channels?.servers?.name} #{m.channels?.name}
                          </span>
                          <span className="text-zinc-600 text-xs">{new Date(m.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-zinc-100">
                          {m.content}
                        </div>
                        <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleDeleteMessage(m.id)} className="text-xs flex items-center gap-1 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 rounded">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    {messages.length === 0 && !loading && (
                      <div className="text-center text-zinc-500 py-8">No messages found. Try searching.</div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'audit' ? (
                <div className="space-y-2">
                  {auditLogs.map((log, i) => (
                    <div key={i} className="bg-zinc-900/50 border border-zinc-700/50 p-4 rounded-lg flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                        {log.type === 'user_joined' ? <UsersIcon className="w-5 h-5 text-indigo-400" /> : <Server className="w-5 h-5 text-emerald-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-zinc-100 truncate">{log.title}</div>
                        <div className="text-xs text-zinc-500">{new Date(log.date).toLocaleString()} • ID: {log.details}</div>
                      </div>
                    </div>
                  ))}
                  {auditLogs.length === 0 && !loading && (
                    <div className="text-center text-zinc-500 py-8">No events found.</div>
                  )}
                </div>
              ) : activeTab === 'reports' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase">
                    <div className="flex-1">Report Details</div>
                    <div className="w-32 text-center">Status</div>
                    <div className="w-48 text-right">Actions</div>
                  </div>
                  {reports.map((r) => {
                    let details: any = {};
                    try { details = JSON.parse(r.details || '{}') } catch(e){}
                    return (
                      <div key={r.id} className="bg-zinc-900/50 border border-zinc-700/50 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-zinc-200 text-sm mb-1">
                            Reported by: <span className="text-indigo-400">{r.profiles?.username}</span>
                            <span className="text-zinc-500 font-normal ml-2 text-xs">{new Date(r.created_at).toLocaleString()}</span>
                          </div>
                          <div className="text-sm text-zinc-300 bg-zinc-950 p-3 rounded-md mb-2 border border-zinc-800">
                            <strong>Reason:</strong> {details.reason}
                          </div>
                          {details.content && (
                            <div className="text-xs text-zinc-400 border-l-2 border-zinc-700 pl-3 italic">
                              Message ({details.authorName}): "{details.content}"
                            </div>
                          )}
                        </div>
                        
                        <div className="w-32 flex justify-center shrink-0">
                          <span className={clsx(
                            "px-2.5 py-1 rounded text-xs font-medium uppercase tracking-wide",
                            details.status === 'resolved' ? "bg-emerald-500/10 text-emerald-400" :
                            details.status === 'dismissed' ? "bg-zinc-500/10 text-zinc-400" :
                            "bg-amber-500/10 text-amber-400"
                          )}>
                            {details.status || 'pending'}
                          </span>
                        </div>

                        <div className="w-48 flex justify-end gap-2 shrink-0">
                          {(!details.status || details.status === 'pending') && (
                            <>
                              <button
                                onClick={() => handleReportStatus(r.id, 'resolved')}
                                className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors rounded text-sm font-medium flex items-center gap-1"
                              >
                                <Check className="w-4 h-4" /> Resolve
                              </button>
                              <button
                                onClick={() => handleReportStatus(r.id, 'dismissed')}
                                className="px-3 py-1.5 bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors rounded text-sm font-medium flex items-center gap-1"
                              >
                                <X className="w-4 h-4" /> Dismiss
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {reports.length === 0 && !loading && (
                    <div className="text-center text-zinc-500 py-8">No reports found.</div>
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
                          onClick={() => handleServerEdit(s)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600 hover:text-white rounded transition-colors text-sm font-medium"
                          title="Edit Server"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => copyInvite(s.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600 hover:text-white rounded transition-colors text-sm font-medium"
                          title="Copy Invite Code"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
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

