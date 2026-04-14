import { useState, useEffect } from 'react';
import { X, Settings, Users, Shield, Link as LinkIcon, Trash2, Plus, Hash, Folder, UserMinus, Ban, Check } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import PromptModal from './PromptModal';
import ConfirmModal from './ConfirmModal';
import UserAvatar from './UserAvatar';
import { processImageForSupabase } from '../../lib/imageUtils';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: any;
}

export default function ServerSettingsModal({ isOpen, onClose, server }: ServerSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'members' | 'invites' | 'channels' | 'logs'>('overview');
  const [serverName, setServerName] = useState(server?.name || '');
  const [iconUrl, setIconUrl] = useState(server?.icon_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilters, setLogFilters] = useState<string[]>(['all']);
  const [activeRoleMenu, setActiveRoleMenu] = useState<string | null>(null);
  const [roleSearch, setRoleSearch] = useState('');
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [editingChannel, setEditingChannel] = useState<any | null>(null);
  const [currentUserMember, setCurrentUserMember] = useState<any>(null);
  const { user } = useAuthStore();
  const { setSelectedServerId } = useAppStore();

  const [promptConfig, setPromptConfig] = useState<{isOpen: boolean, title: string, label: string, onSubmit: (val: string) => void}>({
    isOpen: false, title: '', label: '', onSubmit: () => {}
  });

  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, description: string, onConfirm: () => void, danger?: boolean}>({
    isOpen: false, title: '', description: '', onConfirm: () => {}
  });

  const AVAILABLE_PERMISSIONS = [
    { id: 'ADMINISTRATOR', label: 'Administrateur', description: 'Donne tous les droits sur le serveur.' },
    { id: 'MANAGE_SERVER', label: 'Gérer le serveur', description: 'Permet de modifier le nom et supprimer le serveur.' },
    { id: 'MANAGE_ROLES', label: 'Gérer les rôles', description: 'Permet de créer, modifier et supprimer des rôles.' },
    { id: 'MANAGE_CHANNELS', label: 'Gérer les salons', description: 'Permet de créer, modifier et supprimer des salons et catégories.' },
    { id: 'KICK_MEMBERS', label: 'Expulser des membres', description: 'Permet d\'expulser des membres du serveur.' },
    { id: 'BAN_MEMBERS', label: 'Bannir des membres', description: 'Permet de bannir des membres du serveur.' },
    { id: 'CREATE_INVITE', label: 'Créer une invitation', description: 'Permet de créer des liens d\'invitation.' },
    { id: 'SEND_MESSAGES', label: 'Envoyer des messages', description: 'Permet d\'envoyer des messages dans les salons textuels.' },
    { id: 'READ_MESSAGES', label: 'Lire les messages', description: 'Permet de voir et lire les salons textuels.' },
    { id: 'CONNECT', label: 'Se connecter', description: 'Permet de se connecter aux salons vocaux.' },
    { id: 'SPEAK', label: 'Parler', description: 'Permet de parler dans les salons vocaux.' },
    { id: 'MOVE_MEMBERS', label: 'Déplacer des membres', description: 'Permet de déplacer des membres entre les salons vocaux.' }
  ];

  useEffect(() => {
    if (server) {
      setServerName(server.name);
      setIconUrl(server.icon_url || '');
    }
  }, [server]);

  useEffect(() => {
    setEditingRole(null);
    setEditingChannel(null);
    setActiveRoleMenu(null);
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen || !server || !user) return;

    const fetchData = async () => {
      // Fetch profiles for mapping
      const { data: profilesData } = await supabase.from('profiles').select('*');
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

      // Fetch roles
      const { data: rolesData } = await supabase.from('roles').select('*').eq('server_id', server.id);
      if (rolesData) setRoles(rolesData);

      // Fetch invites
      const { data: invitesData } = await supabase.from('invites').select('*').eq('server_id', server.id);
      if (invitesData) setInvites(invitesData);

      // Fetch categories
      const { data: catsData } = await supabase.from('categories').select('*').eq('server_id', server.id).order('order', { ascending: true });
      if (catsData) setCategories(catsData);

      // Fetch channels
      const { data: chsData } = await supabase.from('channels').select('*').eq('server_id', server.id);
      if (chsData) setChannels(chsData);

      // Fetch members
      const { data: membersData } = await supabase.from('server_members').select('*').eq('server_id', server.id);
      if (membersData) {
        const resolvedMembers = membersData.map(m => ({
          ...m,
          user: profilesMap.get(m.user_id)
        })).sort((a, b) => {
          // Stable sort: Owner first, then by join date
          if (a.user_id === server.owner_id) return -1;
          if (b.user_id === server.owner_id) return 1;
          return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
        });
        setMembers(resolvedMembers);
        const currentMember = resolvedMembers.find(m => m.user_id === user.id);
        setCurrentUserMember(currentMember);
      }

      // Fetch bans
      const { data: bansData } = await supabase.from('server_bans').select('*').eq('server_id', server.id);
      if (bansData) {
        const resolvedBans = bansData.map(b => ({
          ...b,
          user: profilesMap.get(b.user_id)
        }));
        setBans(resolvedBans);
      }

      // Fetch logs
      const { data: logsData } = await supabase.from('server_logs').select('*').eq('server_id', server.id).order('created_at', { ascending: false });
      if (logsData) {
        const resolvedLogs = logsData.map(l => ({
          ...l,
          user: profilesMap.get(l.user_id)
        }));
        setLogs(resolvedLogs);
      }
    };

    fetchData();

    const channel = supabase.channel(`server_settings_${server.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles', filter: `server_id=eq.${server.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invites', filter: `server_id=eq.${server.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `server_id=eq.${server.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `server_id=eq.${server.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `server_id=eq.${server.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_bans', filter: `server_id=eq.${server.id}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_logs', filter: `server_id=eq.${server.id}` }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, server, user]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen || !server) return null;

  const isOwner = server?.owner_id === user?.id;
  let hasKickMembers = isOwner;
  let hasBanMembers = isOwner;

  if (currentUserMember && Array.isArray(currentUserMember.roles)) {
    if (currentUserMember.roles.includes('owner')) {
      hasKickMembers = true;
      hasBanMembers = true;
    } else {
      const userRoles = roles.filter(r => currentUserMember.roles.includes(r.id));
      for (const role of userRoles) {
        if (role.permissions?.includes('ADMINISTRATOR')) {
          hasKickMembers = true;
          hasBanMembers = true;
          break;
        }
        if (role.permissions?.includes('KICK_MEMBERS')) hasKickMembers = true;
        if (role.permissions?.includes('BAN_MEMBERS')) hasBanMembers = true;
      }
    }
  }

  const logAction = async (action: string, details: string) => {
    if (!user) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
      const username = profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || 'Utilisateur';
      
      await supabase.from('server_logs').insert({
        server_id: server.id,
        action,
        details,
        user_id: user.id,
        username: username
      });
    } catch (e) {
      console.error("Failed to log action:", e);
    }
  };

  const handleUpdateServer = async () => {
    if (!serverName.trim()) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await supabase.from('servers').update({ name: serverName, icon_url: iconUrl }).eq('id', server.id);
      logAction('server_update', `Paramètres du serveur modifiés`);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error updating server:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("L'image est trop grande (max 5 MB)");
      return;
    }

    setIsUploadingIcon(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `server-icons/${server.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        console.warn("Storage upload failed, falling back to base64 compression", uploadError);
        const base64 = await processImageForSupabase(file, 200);
        setIconUrl(base64);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        setIconUrl(publicUrl);
      }
    } catch (error: any) {
      console.error("Error uploading icon:", error);
      if (error.message === "GIF_TOO_LARGE") {
        alert("Ce GIF est trop lourd. Veuillez choisir un GIF plus léger.");
      } else {
        alert("Erreur lors du téléchargement de l'image");
      }
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleDeleteServer = async () => {
    setConfirmConfig({
      isOpen: true,
      title: "Supprimer le serveur",
      description: "Êtes-vous sûr de vouloir supprimer ce serveur ? Cette action est irréversible.",
      danger: true,
      onConfirm: async () => {
        try {
          await supabase.from('servers').delete().eq('id', server.id);
          setSelectedServerId(null);
          onClose();
        } catch (error) {
          console.error("Error deleting server:", error);
        }
      }
    });
  };

  const handleCreateInvite = async () => {
    try {
      const code = Math.random().toString(36).substring(2, 8);
      await supabase.from('invites').insert({
        server_id: server.id,
        creator_id: user?.id,
        code,
        uses: 0,
        max_uses: 0
      });
      logAction('invite_create', `Invitation créée (code: ${code})`);
    } catch (error) {
      console.error("Error creating invite:", error);
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    try {
      await supabase.from('invites').delete().eq('id', inviteId);
      logAction('invite_delete', `Invitation supprimée`);
    } catch (error) {
      console.error("Error deleting invite:", error);
    }
  };

  const handleCreateCategory = async () => {
    setPromptConfig({
      isOpen: true,
      title: "Créer une catégorie",
      label: "Nom de la catégorie",
      onSubmit: async (name) => {
        try {
          await supabase.from('categories').insert({
            server_id: server.id,
            name: name,
            order: categories.length
          });
          logAction('category_create', `Catégorie "${name}" créée`);
        } catch (error) {
          console.error("Error creating category:", error);
        }
      }
    });
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Supprimer la catégorie",
      description: "Supprimer cette catégorie ? Les salons à l'intérieur ne seront pas supprimés.",
      danger: true,
      onConfirm: async () => {
        try {
          const cat = categories.find(c => c.id === categoryId);
          await supabase.from('categories').delete().eq('id', categoryId);
          const channelsToUpdate = channels.filter(c => c.category_id === categoryId);
          for (const channel of channelsToUpdate) {
            await supabase.from('channels').update({ category_id: null }).eq('id', channel.id);
          }
          if (cat) logAction('category_delete', `Catégorie "${cat.name}" supprimée`);
        } catch (error) {
          console.error("Error deleting category:", error);
        }
      }
    });
  };

  const handleDeleteChannel = async (channelId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Supprimer le salon",
      description: "Êtes-vous sûr de vouloir supprimer ce salon ?",
      danger: true,
      onConfirm: async () => {
        try {
          const ch = channels.find(c => c.id === channelId);
          await supabase.from('channels').delete().eq('id', channelId);
          if (ch) logAction('channel_delete', `Salon "${ch.name}" supprimé`);
        } catch (error) {
          console.error("Error deleting channel:", error);
        }
      }
    });
  };

  const handleUpdateChannel = async () => {
    if (!editingChannel || !editingChannel.name.trim()) return;
    try {
      await supabase.from('channels').update({
        name: editingChannel.name,
        category_id: editingChannel.category_id || null
      }).eq('id', editingChannel.id);
      logAction('channel_update', `Salon "${editingChannel.name}" mis à jour`);
      setEditingChannel(null);
    } catch (error) {
      console.error("Error updating channel:", error);
    }
  };

  const handleCreateRole = async () => {
    setPromptConfig({
      isOpen: true,
      title: "Créer un rôle",
      label: "Nom du rôle",
      onSubmit: async (name) => {
        try {
          await supabase.from('roles').insert({
            server_id: server.id,
            name: name,
            color: '#99aab5',
            permissions: ['SEND_MESSAGES', 'READ_MESSAGES', 'CONNECT', 'SPEAK']
          });
          logAction('role_create', `Rôle "${name}" créé`);
        } catch (error) {
          console.error("Error creating role:", error);
        }
      }
    });
  };

  const handleDeleteRole = async (roleId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Supprimer le rôle",
      description: "Êtes-vous sûr de vouloir supprimer ce rôle ?",
      danger: true,
      onConfirm: async () => {
        try {
          const r = roles.find(ro => ro.id === roleId);
          await supabase.from('roles').delete().eq('id', roleId);
          if (r) logAction('role_delete', `Rôle "${r.name}" supprimé`);
        } catch (error) {
          console.error("Error deleting role:", error);
        }
      }
    });
  };

  const handleUpdateRole = async () => {
    if (!editingRole || !editingRole.name.trim()) return;
    try {
      await supabase.from('roles').update({
        name: editingRole.name,
        color: editingRole.color,
        permissions: editingRole.permissions
      }).eq('id', editingRole.id);
      logAction('role_update', `Rôle "${editingRole.name}" mis à jour`);
      setEditingRole(null);
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  const handleTogglePermission = (permId: string) => {
    if (!editingRole) return;
    const hasPerm = editingRole.permissions.includes(permId);
    setEditingRole({
      ...editingRole,
      permissions: hasPerm 
        ? editingRole.permissions.filter((p: string) => p !== permId)
        : [...editingRole.permissions, permId]
    });
  };

  const handleAssignRole = async (userId: string, roleId: string, currentRoles: string[]) => {
    try {
      let newRoles = [...(currentRoles || [])];
      const isRemoving = newRoles.includes(roleId);
      if (isRemoving) {
        newRoles = newRoles.filter(r => r !== roleId);
      } else {
        newRoles.push(roleId);
      }
      
      const { error } = await supabase.from('server_members').update({ roles: newRoles }).eq('server_id', server.id).eq('user_id', userId);
      if (error) throw error;
      
      // If we are adding a role from the menu, we might want to close it or keep it open.
      // The user complained about it being "buggy" and stuck.
      // Let's close it to be safe and clean.
      if (!isRemoving) {
        setActiveRoleMenu(null);
      }

      const member = members.find(m => m.user_id === userId);
      const role = roles.find(r => r.id === roleId);
      if (member && role) {
        logAction('role_assign', `Rôles de ${member.user?.username || 'Utilisateur'} modifiés (${role.name})`);
      }
    } catch (error) {
      console.error("Error updating member roles:", error);
    }
  };

  const handleKickMember = async (userId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Expulser le membre",
      description: "Êtes-vous sûr de vouloir expulser ce membre du serveur ?",
      danger: true,
      onConfirm: async () => {
        try {
          const member = members.find(m => m.user_id === userId);
          await supabase.from('server_members').delete().eq('server_id', server.id).eq('user_id', userId);
          // Force disconnect from voice
          await supabase.from('profiles').update({
            force_voice_move: { channelId: null, timestamp: Date.now() }
          }).eq('id', userId);
          if (member) logAction('member_kick', `Membre ${member.user?.username || 'Utilisateur'} expulsé`);
        } catch (error) {
          console.error("Error kicking member:", error);
        }
      }
    });
  };

  const handleBanMember = async (userId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Bannir le membre",
      description: "Êtes-vous sûr de vouloir bannir ce membre du serveur ?",
      danger: true,
      onConfirm: async () => {
        try {
          const member = members.find(m => m.user_id === userId);
          await supabase.from('server_bans').insert({
            server_id: server.id,
            user_id: userId,
            banned_by: user?.id
          });
          await supabase.from('server_members').delete().eq('server_id', server.id).eq('user_id', userId);
          // Force disconnect from voice
          await supabase.from('profiles').update({
            force_voice_move: { channelId: null, timestamp: Date.now() }
          }).eq('id', userId);
          if (member) logAction('member_ban', `Membre ${member.user?.username || 'Utilisateur'} banni`);
        } catch (error) {
          console.error("Error banning member:", error);
        }
      }
    });
  };

  const handleUnbanMember = async (userId: string) => {
    try {
      const ban = bans.find(b => b.user_id === userId);
      await supabase.from('server_bans').delete().eq('server_id', server.id).eq('user_id', userId);
      if (ban) logAction('member_unban', `Membre ${ban.user?.username || 'Utilisateur'} débanni`);
    } catch (error) {
      console.error("Error unbanning member:", error);
    }
  };

  const LOG_OPTIONS = [
    { value: 'server_update', label: 'Mises à jour du serveur' },
    { value: 'channel_create', label: 'Création de salons' },
    { value: 'channel_delete', label: 'Suppression de salons' },
    { value: 'category_create', label: 'Création de catégories' },
    { value: 'category_delete', label: 'Suppression de catégories' },
    { value: 'role_create', label: 'Création de rôles' },
    { value: 'role_update', label: 'Mises à jour de rôles' },
    { value: 'role_delete', label: 'Suppression de rôles' },
    { value: 'role_assign', label: 'Attribution de rôles' },
    { value: 'member_kick', label: 'Expulsions' },
    { value: 'member_ban', label: 'Bannissements' },
    { value: 'member_unban', label: 'Débannissements' },
    { value: 'member_join', label: 'Arrivées de membres' },
    { value: 'member_leave', label: 'Départs de membres' },
    { value: 'invite_create', label: 'Création d\'invitations' },
    { value: 'invite_delete', label: 'Suppression d\'invitations' },
  ];

  const handleToggleLogFilter = (value: string) => {
    if (value === 'all') {
      setLogFilters(['all']);
      return;
    }

    setLogFilters(prev => {
      const withoutAll = prev.filter(f => f !== 'all');
      if (withoutAll.includes(value)) {
        const next = withoutAll.filter(f => f !== value);
        return next.length === 0 ? ['all'] : next;
      } else {
        return [...withoutAll, value];
      }
    });
  };

  const handleSelectAllLogs = () => {
    if (logFilters.length === LOG_OPTIONS.length) {
      setLogFilters(['all']);
    } else {
      setLogFilters(LOG_OPTIONS.map(o => o.value));
    }
  };

  const filteredLogs = logs.filter(log => 
    logFilters.includes('all') || logFilters.includes(log.action)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-zinc-800 w-full max-w-4xl h-full md:h-[80vh] rounded-none md:rounded-lg shadow-2xl flex flex-col md:flex-row overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-full md:w-60 bg-zinc-900/50 flex md:flex-col p-4 border-b md:border-b-0 md:border-r border-zinc-700/50 shrink-0 overflow-x-auto md:overflow-y-auto no-scrollbar gap-2 md:gap-1">
          <div className="hidden md:block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 px-2 truncate">
            {server.name}
          </div>
          
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'overview' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Settings className="w-4 h-4" />
            <span className="font-medium">Vue d'ensemble</span>
          </button>
          
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'roles' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Shield className="w-4 h-4" />
            <span className="font-medium">Rôles</span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'channels' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Hash className="w-4 h-4" />
            <span className="font-medium">Salons</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'members' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Users className="w-4 h-4" />
            <span className="font-medium">Membres</span>
          </button>

          <button
            onClick={() => setActiveTab('invites')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'invites' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <LinkIcon className="w-4 h-4" />
            <span className="font-medium">Invitations</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md md:mb-4 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Folder className="w-4 h-4" />
            <span className="font-medium">Logs d'audit</span>
          </button>

          <div className="md:mt-auto md:pt-4 md:border-t border-zinc-700/50 flex items-center">
            <button
              onClick={handleDeleteServer}
              className="flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap w-full"
            >
              <Trash2 className="w-4 h-4" />
              <span className="font-medium">Supprimer le serveur</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-zinc-800 relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded-full transition-colors flex flex-col items-center gap-1"
          >
            <X className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase">Échap</span>
          </button>

          <div className={clsx("flex-1 p-10 min-h-0", activeTab !== 'members' && "overflow-y-auto")}>
            {activeTab === 'overview' && (
              <div className="max-w-xl">
                <h2 className="text-xl font-bold text-zinc-100 mb-6">Vue d'ensemble du serveur</h2>
                
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative w-24 h-24 rounded-2xl bg-zinc-700 flex items-center justify-center overflow-hidden border-2 border-dashed border-zinc-600 hover:border-indigo-500 transition-colors group">
                        {iconUrl ? (
                          <img src={iconUrl} alt="Server icon" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl font-bold text-zinc-500 group-hover:text-indigo-400 transition-colors">
                            {serverName.charAt(0).toUpperCase() || 'S'}
                          </span>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-xs font-bold text-white uppercase">Changer</span>
                        </div>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleIconUpload}
                          disabled={isUploadingIcon}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </div>
                      {isUploadingIcon && <span className="text-xs text-indigo-400 animate-pulse">Téléchargement...</span>}
                      {iconUrl && (
                        <button 
                          onClick={() => setIconUrl('')}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Supprimer l'image
                        </button>
                      )}
                    </div>

                    <div className="flex-1 w-full">
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        Nom du serveur
                      </label>
                      <input
                        type="text"
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleUpdateServer}
                      disabled={isSaving}
                      className={clsx(
                        "px-4 py-2 rounded-md font-medium transition-colors",
                        saveSuccess 
                          ? "bg-emerald-500 text-white" 
                          : "bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
                      )}
                    >
                      {isSaving ? 'Enregistrement...' : saveSuccess ? 'Enregistré !' : 'Enregistrer les modifications'}
                    </button>
                    {saveSuccess && (
                      <span className="text-emerald-500 text-sm font-medium animate-fade-in">
                        Modifications enregistrées avec succès
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="max-w-2xl">
                {editingRole ? (
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <button 
                        onClick={() => setEditingRole(null)}
                        className="text-zinc-400 hover:text-zinc-100 transition-colors"
                      >
                        Retour
                      </button>
                      <h2 className="text-xl font-bold text-zinc-100">Modifier le rôle : {editingRole.name}</h2>
                    </div>

                    <div className="space-y-6">
                      <div className="flex gap-6">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                            Nom du rôle
                          </label>
                          <input
                            type="text"
                            value={editingRole.name}
                            onChange={(e) => setEditingRole({...editingRole, name: e.target.value})}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                            Couleur
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={editingRole.color || '#99aab5'}
                              onChange={(e) => setEditingRole({...editingRole, color: e.target.value})}
                              className="w-10 h-10 rounded cursor-pointer bg-zinc-900 border border-zinc-700 p-1"
                            />
                            <span className="text-zinc-300 font-mono text-sm uppercase">{editingRole.color || '#99aab5'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-zinc-700/50">
                        <h3 className="text-lg font-bold text-zinc-100 mb-4">Permissions</h3>
                        <div className="space-y-4">
                          {AVAILABLE_PERMISSIONS.map(perm => {
                            const isEnabled = editingRole.permissions.includes(perm.id);
                            const isAdmin = editingRole.permissions.includes('ADMINISTRATOR') && perm.id !== 'ADMINISTRATOR';
                            return (
                              <div key={perm.id} className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg border border-zinc-700/50">
                                <div>
                                  <div className="text-zinc-100 font-medium mb-1">{perm.label}</div>
                                  <div className="text-zinc-400 text-sm">{perm.description}</div>
                                </div>
                                <button
                                  onClick={() => handleTogglePermission(perm.id)}
                                  disabled={isAdmin}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled || isAdmin ? 'bg-indigo-500' : 'bg-zinc-600'} ${isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled || isAdmin ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-6 flex justify-end">
                        <button
                          onClick={handleUpdateRole}
                          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md font-medium transition-colors"
                        >
                          Enregistrer les modifications
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-zinc-100">Rôles</h2>
                      <button 
                        onClick={handleCreateRole}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Créer un rôle
                      </button>
                    </div>
                    
                    <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                      {roles.length === 0 ? (
                        <div className="p-8 text-center text-zinc-400">
                          Aucun rôle personnalisé.
                        </div>
                      ) : (
                        roles.map(role => (
                          <div 
                            key={role.id} 
                            onClick={() => setEditingRole(role)}
                            className="p-4 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group cursor-pointer hover:bg-zinc-800/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color || '#99aab5' }} />
                              <span className="text-zinc-100 font-medium">{role.name}</span>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRole(role.id);
                              }}
                              className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'channels' && (
              <div className="max-w-2xl">
                {editingChannel ? (
                  <div>
                    <div className="flex items-center gap-4 mb-6">
                      <button 
                        onClick={() => setEditingChannel(null)}
                        className="text-zinc-400 hover:text-zinc-100 transition-colors"
                      >
                        Retour
                      </button>
                      <h2 className="text-xl font-bold text-zinc-100">Modifier le salon : {editingChannel.name}</h2>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          Nom du salon
                        </label>
                        <input
                          type="text"
                          value={editingChannel.name}
                          onChange={(e) => setEditingChannel({...editingChannel, name: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          Catégorie
                        </label>
                        <select
                          value={editingChannel.category_id || ''}
                          onChange={(e) => setEditingChannel({...editingChannel, category_id: e.target.value || null})}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">Sans catégorie</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="pt-6 flex justify-end">
                        <button
                          onClick={handleUpdateChannel}
                          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md font-medium transition-colors"
                        >
                          Enregistrer les modifications
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-zinc-100">Salons et Catégories</h2>
                      <button 
                        onClick={handleCreateCategory}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Créer une catégorie
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {/* Uncategorized */}
                      <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                        <div className="bg-zinc-800/50 px-4 py-2 border-b border-zinc-700/50 font-semibold text-zinc-300 text-sm uppercase tracking-wider">
                          Sans catégorie
                        </div>
                        {channels.filter(c => !c.category_id).map(channel => (
                          <div key={channel.id} className="p-3 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                            <div className="flex items-center gap-2 text-zinc-300">
                              <Hash className="w-4 h-4 text-zinc-500" />
                              <span>{channel.name}</span>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setEditingChannel(channel)}
                                className="p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteChannel(channel.id)}
                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {channels.filter(c => !c.category_id).length === 0 && (
                          <div className="p-4 text-center text-zinc-500 text-sm">Aucun salon.</div>
                        )}
                      </div>

                      {/* Categories */}
                      {categories.map(category => (
                        <div key={category.id} className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                          <div className="bg-zinc-800/50 px-4 py-2 border-b border-zinc-700/50 flex items-center justify-between group">
                            <div className="font-semibold text-zinc-300 text-sm uppercase tracking-wider flex items-center gap-2">
                              <Folder className="w-4 h-4 text-zinc-500" />
                              {category.name}
                            </div>
                            <button 
                              onClick={() => handleDeleteCategory(category.id)}
                              className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {channels.filter(c => c.category_id === category.id).map(channel => (
                            <div key={channel.id} className="p-3 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                              <div className="flex items-center gap-2 text-zinc-300 pl-4">
                                <Hash className="w-4 h-4 text-zinc-500" />
                                <span>{channel.name}</span>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => setEditingChannel(channel)}
                                  className="p-1.5 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
                                >
                                  <Settings className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteChannel(channel.id)}
                                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {channels.filter(c => c.category_id === category.id).length === 0 && (
                            <div className="p-4 text-center text-zinc-500 text-sm">Aucun salon dans cette catégorie.</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="max-w-2xl h-full flex flex-col">
                <h2 className="text-xl font-bold text-zinc-100 mb-6">Membres du serveur</h2>
                
                <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden mb-8 flex-1 flex flex-col min-h-0">
                  <div className="overflow-y-auto flex-1 custom-scrollbar">
                    {members.map((member, index) => (
                      <div key={member.user_id} className="p-4 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <UserAvatar 
                            user={{
                              username: member.user?.username || 'Utilisateur inconnu',
                              avatarUrl: member.user?.avatar_url || '',
                              status: member.user?.status || 'offline'
                            }} 
                            size="lg" 
                            showStatus={false}
                          />
                        <div>
                          <div className="text-zinc-100 font-medium">{member.user?.username || 'Utilisateur inconnu'}</div>
                          <div className="text-xs text-zinc-400">A rejoint le {new Date(member.joined_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-wrap gap-1 justify-end max-w-[250px] relative">
                          {roles.filter(role => Array.isArray(member.roles) && member.roles.includes(role.id)).map(role => (
                            <div
                              key={role.id}
                              className="text-[10px] px-2 py-1 rounded-full border bg-indigo-500/20 border-indigo-500 text-indigo-300 flex items-center gap-1"
                            >
                              {role.name}
                              <button 
                                onClick={() => handleAssignRole(member.user_id, role.id, member.roles)}
                                className="hover:text-white"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                          
                          <div className="relative">
                            <button
                              onClick={() => {
                                setActiveRoleMenu(activeRoleMenu === member.user_id ? null : member.user_id);
                                setRoleSearch('');
                              }}
                              className="p-1 text-zinc-400 hover:text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-full transition-colors"
                              title="Ajouter un rôle"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            
                            {activeRoleMenu === member.user_id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-[60]" 
                                  onClick={() => setActiveRoleMenu(null)} 
                                />
                                <div className={clsx(
                                  "absolute right-0 w-56 bg-zinc-950 border border-zinc-700 rounded-md shadow-xl z-[70] overflow-hidden",
                                  index > members.length - 3 ? "bottom-full mb-2" : "top-full mt-2"
                                )}>
                                  <div className="p-2 border-b border-zinc-800">
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                                      Rôles
                                    </div>
                                    <input 
                                      type="text"
                                      placeholder="Rechercher un rôle..."
                                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      onClick={(e) => e.stopPropagation()}
                                      value={roleSearch}
                                      onChange={(e) => setRoleSearch(e.target.value)}
                                      autoFocus
                                    />
                                  </div>
                                  <div className="max-h-60 overflow-y-auto py-1">
                                    {roles.filter(r => (r.name || '').toLowerCase().includes(roleSearch.toLowerCase())).map(role => {
                                      const hasRole = Array.isArray(member.roles) && member.roles.includes(role.id);
                                      return (
                                        <button
                                          key={role.id}
                                          onClick={() => handleAssignRole(member.user_id, role.id, member.roles)}
                                          className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-zinc-800 transition-colors"
                                        >
                                          <span className={hasRole ? 'text-indigo-400' : 'text-zinc-300'}>
                                            {role.name}
                                          </span>
                                          {hasRole && <Check className="w-3 h-3 text-indigo-400" />}
                                        </button>
                                      );
                                    })}
                                    {roles.length > 0 && roles.filter(r => (r.name || '').toLowerCase().includes(roleSearch.toLowerCase())).length === 0 && (
                                      <div className="px-3 py-2 text-xs text-zinc-500 italic">
                                        Aucun résultat
                                      </div>
                                    )}
                                    {roles.length === 0 && (
                                      <div className="px-3 py-2 text-xs text-zinc-500 italic">
                                        Aucun rôle créé
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        {member.user_id !== server.owner_id && member.user_id !== user?.id && (hasKickMembers || hasBanMembers) && (
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {hasKickMembers && (
                              <button
                                onClick={() => handleKickMember(member.user_id)}
                                className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                                title="Expulser"
                              >
                                <UserMinus className="w-4 h-4" />
                              </button>
                            )}
                            {hasBanMembers && (
                              <button
                                onClick={() => handleBanMember(member.user_id)}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-zinc-800 rounded-md transition-colors"
                                title="Bannir"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>

                {bans.length > 0 && (
                  <>
                    <h2 className="text-xl font-bold text-zinc-100 mb-6">Membres bannis</h2>
                    <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                      {bans.map(ban => (
                        <div key={ban.id} className="p-4 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <UserAvatar 
                              user={{
                                username: ban.user?.username || 'Utilisateur inconnu',
                                avatarUrl: ban.user?.avatar_url || '',
                                status: 'offline'
                              }} 
                              size="lg" 
                            />
                            <div>
                              <div className="text-zinc-100 font-medium">{ban.user?.username || 'Utilisateur inconnu'}</div>
                              <div className="text-xs text-zinc-400">Banni le {new Date(ban.created_at).toLocaleDateString()}</div>
                            </div>
                          </div>
                          {hasBanMembers && (
                            <button
                              onClick={() => handleUnbanMember(ban.user_id)}
                              className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                            >
                              Débannir
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'invites' && (
              <div className="max-w-xl">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-zinc-100">Invitations</h2>
                  <button 
                    onClick={handleCreateInvite}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Générer un lien
                  </button>
                </div>
                
                <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                  {invites.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400">
                      Aucune invitation active.
                    </div>
                  ) : (
                    invites.map(invite => (
                      <div key={invite.id} className="p-4 border-b border-zinc-700/50 last:border-0 flex items-center justify-between">
                        <div>
                          <div className="text-zinc-100 font-medium font-mono">{invite.code}</div>
                          <div className="text-xs text-zinc-400">Créé le {new Date(invite.created_at).toLocaleDateString()}</div>
                        </div>
                        <button 
                          onClick={() => handleDeleteInvite(invite.id)}
                          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="max-w-3xl h-full flex flex-col">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-zinc-100">Logs d'audit</h2>
                    <button
                      onClick={handleSelectAllLogs}
                      className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {logFilters.length === LOG_OPTIONS.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleToggleLogFilter('all')}
                      className={clsx(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                        logFilters.includes('all')
                          ? "bg-indigo-500 border-indigo-500 text-white"
                          : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      )}
                    >
                      Tous
                    </button>
                    {LOG_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        onClick={() => handleToggleLogFilter(option.value)}
                        className={clsx(
                          "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border flex items-center gap-1.5",
                          logFilters.includes(option.value)
                            ? "bg-indigo-500 border-indigo-500 text-white"
                            : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                        )}
                      >
                        {logFilters.includes(option.value) && <Check className="w-3 h-3" />}
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden flex-1 flex flex-col min-h-0">
                  {filteredLogs.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400">
                      Aucun log trouvé pour ces filtres.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-700/50 overflow-y-auto">
                      {filteredLogs.map(log => (
                        <div key={log.id} className="p-4 flex flex-col gap-1 hover:bg-zinc-800/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-200">{log.details}</span>
                            <span className="text-xs text-zinc-500">{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          <div className="text-xs text-zinc-400 flex items-center gap-1">
                            <span>Par</span>
                            <span className="font-medium text-zinc-300">{log.user?.username || log.username}</span>
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] ml-2 text-zinc-500 uppercase font-bold tracking-wider">
                              {log.action.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PromptModal
        isOpen={promptConfig.isOpen}
        onClose={() => setPromptConfig(prev => ({ ...prev, isOpen: false }))}
        onSubmit={promptConfig.onSubmit}
        title={promptConfig.title}
        inputLabel={promptConfig.label}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        description={confirmConfig.description}
        danger={confirmConfig.danger}
      />
    </div>
  );
}
