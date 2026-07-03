import { useState, useEffect } from 'react';
import { X, Settings, Users, Shield, Link as LinkIcon, Trash2, Plus, Hash, Folder, UserMinus, Ban, Check, Copy, Smile, Volume2, Moon, Play, Lock, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import PromptModal from './PromptModal';
import ConfirmModal from './ConfirmModal';
import UserAvatar from './UserAvatar';
import { processImageForSupabase } from '../../lib/imageUtils';
import { copyToClipboard } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import socket from '../../lib/socket';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: any;
  initialTab?: 'overview' | 'roles' | 'members' | 'invites' | 'channels' | 'emojis' | 'logs' | 'soundboard';
}

export default function ServerSettingsModal({ isOpen, onClose, server, initialTab }: ServerSettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'members' | 'invites' | 'channels' | 'emojis' | 'logs' | 'soundboard'>('overview');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);
  const [serverName, setServerName] = useState(server?.name || '');
  const [iconUrl, setIconUrl] = useState(server?.icon_url || '');
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(server?.default_role_id || null);
  const [customEmojis, setCustomEmojis] = useState<{name: string, url: string}[]>(server?.custom_emojis || []);
  const [soundboardSounds, setSoundboardSounds] = useState<{name: string, emoji: string, url: string}[]>(server?.soundboard_sounds || []);
  const [isSaving, setIsSaving] = useState(false);
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
  const [isLogFilterOpen, setIsLogFilterOpen] = useState(false);
  const [currentUserMember, setCurrentUserMember] = useState<any>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const { user, currentUserProfile } = useAuthStore();
  const { setSelectedServerId, addNotification, soundboardVolume, isSoundboardMuted } = useAppStore();

  const [promptConfig, setPromptConfig] = useState<{isOpen: boolean, title: string, label: string, onSubmit: (val: string) => void}>({
    isOpen: false, title: '', label: '', onSubmit: () => {}
  });

  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, description: string, onConfirm: () => void, danger?: boolean}>({
    isOpen: false, title: '', description: '', onConfirm: () => {}
  });

  const AVAILABLE_PERMISSIONS = [
    { id: 'ADMINISTRATOR', label: t('serverSettings.perms.ADMINISTRATOR.label'), description: t('serverSettings.perms.ADMINISTRATOR.description') },
    { id: 'MANAGE_SERVER', label: t('serverSettings.perms.MANAGE_SERVER.label'), description: t('serverSettings.perms.MANAGE_SERVER.description') },
    { id: 'MANAGE_ROLES', label: t('serverSettings.perms.MANAGE_ROLES.label'), description: t('serverSettings.perms.MANAGE_ROLES.description') },
    { id: 'MANAGE_CHANNELS', label: t('serverSettings.perms.MANAGE_CHANNELS.label'), description: t('serverSettings.perms.MANAGE_CHANNELS.description') },
    { id: 'MANAGE_MESSAGES', label: t('serverSettings.perms.MANAGE_MESSAGES.label'), description: t('serverSettings.perms.MANAGE_MESSAGES.description') },
    { id: 'PIN_MESSAGES', label: t('serverSettings.perms.PIN_MESSAGES.label'), description: t('serverSettings.perms.PIN_MESSAGES.description') },
    { id: 'KICK_MEMBERS', label: t('serverSettings.perms.KICK_MEMBERS.label'), description: t('serverSettings.perms.KICK_MEMBERS.description') },
    { id: 'BAN_MEMBERS', label: t('serverSettings.perms.BAN_MEMBERS.label'), description: t('serverSettings.perms.BAN_MEMBERS.description') },
    { id: 'CREATE_INVITE', label: t('serverSettings.perms.CREATE_INVITE.label'), description: t('serverSettings.perms.CREATE_INVITE.description') },
    { id: 'SEND_MESSAGES', label: t('serverSettings.perms.SEND_MESSAGES.label'), description: t('serverSettings.perms.SEND_MESSAGES.description') },
    { id: 'READ_MESSAGES', label: t('serverSettings.perms.READ_MESSAGES.label'), description: t('serverSettings.perms.READ_MESSAGES.description') },
    { id: 'CONNECT', label: t('serverSettings.perms.CONNECT.label'), description: t('serverSettings.perms.CONNECT.description') },
    { id: 'SPEAK', label: t('serverSettings.perms.SPEAK.label'), description: t('serverSettings.perms.SPEAK.description') },
    { id: 'MOVE_MEMBERS', label: t('serverSettings.perms.MOVE_MEMBERS.label'), description: t('serverSettings.perms.MOVE_MEMBERS.description') },
    { id: 'MUTE_MEMBERS', label: t('serverSettings.perms.MUTE_MEMBERS.label', 'Rendre muet les membres'), description: t('serverSettings.perms.MUTE_MEMBERS.description', 'Permet de rendre muet des membres dans les salons vocaux.') },
    { id: 'MANAGE_SOUNDBOARD', label: t('serverSettings.perms.MANAGE_SOUNDBOARD.label', 'Gérer le soundboard'), description: t('serverSettings.perms.MANAGE_SOUNDBOARD.description', 'Permet d\'ajouter et supprimer des sons au soundboard.') },
    { id: 'USE_SOUNDBOARD', label: t('serverSettings.perms.USE_SOUNDBOARD.label', 'Utiliser le soundboard'), description: t('serverSettings.perms.USE_SOUNDBOARD.description', 'Permet de jouer des sons du soundboard.') }
  ];

  useEffect(() => {
    if (server) {
      setServerName(server.name);
      setIconUrl(server.icon_url || '');
      setDefaultRoleId(server.default_role_id || null);
      setCustomEmojis(server.custom_emojis || []);
    }
  }, [server]);

  useEffect(() => {
    setEditingRole(null);
    setEditingChannel(null);
    setActiveRoleMenu(null);
  }, [activeTab]);

  const fetchData = async () => {
    if (!server || !user) return;
    
    // Fetch profiles for mapping
    const { data: profilesData } = await supabase.from('profiles').select('*');
    const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

    // Fetch roles
    const { data: rolesData } = await supabase.from('roles').select('*').eq('server_id', server.id).order('order', { ascending: true });
    if (rolesData) setRoles(rolesData);

    // Fetch invites
    const { data: invitesData } = await supabase.from('invites').select('*').eq('server_id', server.id).order('created_at', { ascending: false });
    if (invitesData) setInvites(invitesData);

    // Fetch categories
    const { data: catsData } = await supabase.from('categories').select('*').eq('server_id', server.id).order('order', { ascending: true });
    if (catsData) setCategories(catsData);

    // Fetch channels
    const { data: chsData } = await supabase.from('channels').select('*').eq('server_id', server.id);
    if (chsData) {
      setChannels(chsData.sort((a, b) => {
        if ((a.order || 0) !== (b.order || 0))
          return (a.order || 0) - (b.order || 0);
        return a.id.localeCompare(b.id);
      }));
    }

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

  useEffect(() => {
    if (!isOpen || !server || !user) return;

    fetchData();

    const channelName = `server_settings_${server.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    });
    const channel = supabase.channel(channelName)
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
  let hasKickMembers = isOwner || !!currentUserProfile?.is_super_admin;
  let hasBanMembers = isOwner || !!currentUserProfile?.is_super_admin;
  // Default to true for everyone as requested
  let hasManageSoundboard = true;

  if (currentUserMember && Array.isArray(currentUserMember.roles)) {
    if (currentUserMember.roles.includes('owner')) {
      hasKickMembers = true;
      hasBanMembers = true;
      hasManageSoundboard = true;
    } else {
      const userRoles = roles.filter(r => currentUserMember.roles.includes(r.id));
      for (const role of userRoles) {
        if (role.permissions?.includes('ADMINISTRATOR')) {
          hasKickMembers = true;
          hasBanMembers = true;
          hasManageSoundboard = true;
          break;
        }
        if (role.permissions?.includes('KICK_MEMBERS')) hasKickMembers = true;
        if (role.permissions?.includes('BAN_MEMBERS')) hasBanMembers = true;
        if (role.permissions?.includes('MANAGE_SOUNDBOARD')) hasManageSoundboard = true;
      }
    }
  }

  const logAction = async (action: string, details: string) => {
    if (!user) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
      const username = profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || t('serverSettings.unknownUser');
      
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

  const handlePreviewSound = (url: string) => {
    if (currentAudio) return;
    const audio = new Audio(url);
    audio.volume = isSoundboardMuted ? 0 : soundboardVolume;
    audio.play().catch(e => console.error("Error playing sound preview:", e));
    setCurrentAudio(audio);
    audio.onended = () => setCurrentAudio(null);
  };

  const handleUpdateServer = async () => {
    if (!serverName.trim()) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('servers').update({ 
        name: serverName, 
        icon_url: iconUrl,
        default_role_id: defaultRoleId
      }).eq('id', server.id);
      
      if (error) throw error;

      logAction('server_update', t('serverSettings.serverUpdatedLog'));
      addNotification(t('common.savedSuccessfully'), "success");
    } catch (error: any) {
      console.error("Error updating server:", error);
      addNotification(t('errors.updateFailed'), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addNotification(t('errors.imageTooLarge', { max: 5 }), "error");
      return;
    }

    setIsUploadingIcon(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `server-icons/${server.id}/${fileName}`;

      // Convert to ArrayBuffer for better compatibility in Windows/Electron app
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType: file.type,
          upsert: true
        });

      if (uploadError) {
        console.warn("Storage upload failed, falling back to base64 compression", uploadError);
        const base64 = await processImageForSupabase(file, 200);
        setIconUrl(base64);
        
        // Also update database immediately
        await supabase.from('servers').update({ 
          icon_url: base64 
        }).eq('id', server.id);
        
        addNotification(t('common.imageUploaded'), "success");
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        setIconUrl(publicUrl);
        
        // Also update database immediately
        await supabase.from('servers').update({ 
          icon_url: publicUrl 
        }).eq('id', server.id);
        
        addNotification(t('common.imageUploaded'), "success");
      }
    } catch (error: any) {
      console.error("Error uploading icon:", error);
      if (error.message === "GIF_TOO_LARGE") {
        addNotification(t('errors.gifTooLarge'), "error");
      } else {
        addNotification(t('errors.imageUploadFailed'), "error");
      }
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleEmojiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      addNotification(t('errors.imageTooLarge', { max: 50 }), "error");
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const emojiName = file.name.split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20); // Sanitize and limit length
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `server-emojis/${server.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      let url = '';
      if (uploadError) {
        console.warn("Storage upload failed, falling back to base64 compression", uploadError);
        url = await processImageForSupabase(file, 64);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        url = publicUrl;
      }

      // Add to custom emojis list
      const newEmojis = [...customEmojis, { name: emojiName, url }];
      setCustomEmojis(newEmojis);
      await supabase.from('servers').update({ custom_emojis: newEmojis }).eq('id', server.id);
      
      addNotification(t('serverSettings.emojiAdded'), "success");
      logAction('emoji_add', t('serverSettings.emojiAddedLog', { name: emojiName }));
    } catch (error) {
      console.error("Error uploading emoji:", error);
      addNotification(t('errors.emojiUploadFailed'), "error");
    }
    
    if (e.target) e.target.value = '';
  };

  const handleDeleteEmoji = async (index: number) => {
    const emoji = customEmojis[index];
    const newEmojis = customEmojis.filter((_, i) => i !== index);
    setCustomEmojis(newEmojis);
    await supabase.from('servers').update({ custom_emojis: newEmojis }).eq('id', server.id);
    addNotification(t('serverSettings.emojiDeleted'), "success");
    logAction('emoji_delete', t('serverSettings.emojiDeletedLog', { name: emoji.name }));
  };

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit to 5MB and audio files
    if (file.size > 5 * 1024 * 1024) {
      addNotification(t('errors.fileTooLarge', { max: 5 }), "error");
      return;
    }

    if (!file.type.startsWith('audio/')) {
      addNotification(t('errors.invalidFileType'), "error");
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const soundName = file.name.split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `server-sounds/${server.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('soundboard')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('soundboard')
        .getPublicUrl(filePath);

      // Add to soundboard sounds list
      const newSounds = [...soundboardSounds, { name: soundName, emoji: '🔊', url: publicUrl }];
      setSoundboardSounds(newSounds);
      await supabase.from('servers').update({ soundboard_sounds: newSounds }).eq('id', server.id);
      
      addNotification(t('serverSettings.soundAdded', 'Son ajouté au soundboard'), "success");
      logAction('sound_add', t('serverSettings.soundAddedLog', { name: soundName }));
    } catch (error) {
      console.error("Error uploading sound:", error);
      addNotification(t('errors.soundUploadFailed', 'Échec de l\'upload du son'), "error");
    }
    
    if (e.target) e.target.value = '';
  };

  const handleDeleteSound = async (index: number) => {
    const sound = soundboardSounds[index];
    const newSounds = soundboardSounds.filter((_, i) => i !== index);
    setSoundboardSounds(newSounds);
    await supabase.from('servers').update({ soundboard_sounds: newSounds }).eq('id', server.id);
    addNotification(t('serverSettings.soundDeleted', 'Son supprimé'), "success");
    logAction('sound_delete', t('serverSettings.soundDeletedLog', { name: sound.name }));
  };

  const handleDeleteServer = async () => {
    setConfirmConfig({
      isOpen: true,
      title: t('serverSettings.deleteServer'),
      description: t('serverSettings.deleteServerConfirm'),
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
      logAction('invite_create', t('serverSettings.inviteCreatedLog', { code }));
      // Refresh invites immediately
      fetchData();
      addNotification(t('serverSettings.inviteCreated', 'Invitation créée !'), "success");
    } catch (error) {
      console.error("Error creating invite:", error);
      addNotification(t('errors.generic'), "error");
    }
  };

  const handleDeleteInvite = async (inviteCode: string) => {
    try {
      // Use code as identifier since id might be missing or code is PK
      await supabase.from('invites').delete().eq('code', inviteCode);
      logAction('invite_delete', t('serverSettings.inviteDeletedLog'));
      fetchData();
      addNotification(t('serverSettings.inviteDeleted', 'Invitation supprimée'), "success");
    } catch (error) {
      console.error("Error deleting invite:", error);
      addNotification(t('errors.generic'), "error");
    }
  };

  const handleCreateCategory = async () => {
    setPromptConfig({
      isOpen: true,
      title: t('serverSettings.createCategory'),
      label: t('serverSettings.categoryNameLabel'),
      onSubmit: async (name) => {
        try {
          await supabase.from('categories').insert({
            server_id: server.id,
            name: name,
            order: categories.length
          });
          logAction('category_create', t('serverSettings.categoryCreatedLog', { name }));
          fetchData();
        } catch (error) {
          console.error("Error creating category:", error);
        }
      }
    });
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: t('serverSettings.deleteCategory'),
      description: t('serverSettings.deleteCategoryConfirm'),
      danger: true,
      onConfirm: async () => {
        try {
          const cat = categories.find(c => c.id === categoryId);
          await supabase.from('categories').delete().eq('id', categoryId);
          const channelsToUpdate = channels.filter(c => c.category_id === categoryId);
          for (const channel of channelsToUpdate) {
            await supabase.from('channels').update({ category_id: null }).eq('id', channel.id);
          }
          if (cat) logAction('category_delete', t('serverSettings.categoryDeletedLog', { name: cat.name }));
          fetchData();
        } catch (error) {
          console.error("Error deleting category:", error);
        }
      }
    });
  };

  const handleDeleteChannel = async (channelId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: t('serverSettings.deleteChannel'),
      description: t('serverSettings.deleteChannelConfirm'),
      danger: true,
      onConfirm: async () => {
        try {
          const ch = channels.find(c => c.id === channelId);
          await supabase.from('channels').delete().eq('id', channelId);
          if (ch) logAction('channel_delete', t('serverSettings.channelDeletedLog', { name: ch.name }));
          fetchData();
        } catch (error) {
          console.error("Error deleting channel:", error);
        }
      }
    });
  };



  const openEditChannelModal = (channel: any, isAfk: boolean, displayName: string) => {
    const isPrivate = roles.some(r => r.permissions?.includes(`RESTRICT_CHANNEL_${channel.id}`));
    const isReadOnly = roles.some(r => r.permissions?.includes(`RESTRICT_WRITE_CHANNEL_${channel.id}`));
    
    setEditingChannel({
      ...channel,
      name: displayName,
      displayType: isAfk ? 'AFK' : channel.type,
      isPrivate,
      isReadOnly,
      rolePermissions: roles.map(r => {
        const p = r.permissions || [];
        return {
          roleId: r.id,
          name: r.name,
          color: r.color,
          canView: !p.includes(`DENY_CHANNEL_${channel.id}`), // It's allowed by default unless denied, or if restricted we expect ALLOW check
          canWrite: !p.includes(`DENY_WRITE_CHANNEL_${channel.id}`)
        };
      })
    });
    
    // adjust initial states for a restrictive channel logic in the UI
    setEditingChannel(prev => {
       return {
         ...prev,
         rolePermissions: prev.rolePermissions.map((rp: any) => {
            const p = roles.find(r => r.id === rp.roleId)?.permissions || [];
            if (isPrivate) {
              rp.canView = p.includes(`ALLOW_CHANNEL_${channel.id}`);
            }
            if (isReadOnly) {
              rp.canWrite = p.includes(`ALLOW_WRITE_CHANNEL_${channel.id}`);
            }
            return rp;
         })
       }
    });
  };

  const handleUpdateChannel = async () => {
    if (!editingChannel || !editingChannel.name.trim()) return;
    try {
      const isAfk = editingChannel.displayType === 'AFK';
      const dbType = isAfk ? 'VOICE' : editingChannel.displayType || editingChannel.type;
      
      const cleanName = editingChannel.name.replace(' [AFK]', '');
      const dbName = isAfk ? `${cleanName} [AFK]` : cleanName;

      await supabase.from('channels').update({
        name: dbName,
        type: dbType,
        category_id: editingChannel.category_id || null
      }).eq('id', editingChannel.id);
      
      // Update role permissions if edited
      if (editingChannel.rolePermissions) {
        for (const roleDef of editingChannel.rolePermissions) {
           const dbRole = roles.find(r => r.id === roleDef.roleId);
           if (!dbRole) continue;
           
           let newPerms = [...(dbRole.permissions || [])];
           
           // Cleanup old flags for this channel
           newPerms = newPerms.filter(p => !p.includes(`_CHANNEL_${editingChannel.id}`));
           
           // Apply new flags based on roleDef
           if (editingChannel.isPrivate) {
             newPerms.push(`RESTRICT_CHANNEL_${editingChannel.id}`);
             if (roleDef.canView) {
               newPerms.push(`ALLOW_CHANNEL_${editingChannel.id}`);
             } else {
               newPerms.push(`DENY_CHANNEL_${editingChannel.id}`);
             }
           } else {
             if (!roleDef.canView) {
               newPerms.push(`DENY_CHANNEL_${editingChannel.id}`);
             }
           }
           
           if (editingChannel.isReadOnly) {
             newPerms.push(`RESTRICT_WRITE_CHANNEL_${editingChannel.id}`);
             if (roleDef.canWrite) {
               newPerms.push(`ALLOW_WRITE_CHANNEL_${editingChannel.id}`);
             } else {
               newPerms.push(`DENY_WRITE_CHANNEL_${editingChannel.id}`);
             }
           } else {
             if (!roleDef.canWrite) {
               newPerms.push(`DENY_WRITE_CHANNEL_${editingChannel.id}`);
             }
           }
           
           // Remove duplicates just in case
           newPerms = [...new Set(newPerms)];
           
           if (JSON.stringify(newPerms.sort()) !== JSON.stringify([...(dbRole.permissions || [])].sort())) {
             await supabase.from('roles').update({ permissions: newPerms }).eq('id', roleDef.roleId);
           }
        }
      }
      
      logAction('channel_update', t('serverSettings.channelUpdatedLog', { name: dbName }));
      setEditingChannel(null);
      fetchData();
    } catch (error) {
      console.error("Error updating channel:", error);
    }
  };

  const handleCreateRole = async () => {
    setPromptConfig({
      isOpen: true,
      title: t('serverSettings.createRole'),
      label: t('serverSettings.roleNameLabel'),
      onSubmit: async (name) => {
        try {
          await supabase.from('roles').insert({
            server_id: server.id,
            name: name,
            color: '#99aab5',
            permissions: ['SEND_MESSAGES', 'READ_MESSAGES', 'CONNECT', 'SPEAK'],
            order: roles.length + 1
          });
          logAction('role_create', t('serverSettings.roleCreatedLog', { name }));
          fetchData();
        } catch (error) {
          console.error("Error creating role:", error);
        }
      }
    });
  };

  const handleDeleteRole = async (roleId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: t('serverSettings.deleteRole') || "Supprimer le rôle",
      description: t('serverSettings.deleteRoleConfirm'),
      danger: true,
      onConfirm: async () => {
        try {
          const r = roles.find(ro => ro.id === roleId);
          await supabase.from('roles').delete().eq('id', roleId);
          if (r) logAction('role_delete', t('serverSettings.roleDeletedLog', { name: r.name }));
          fetchData();
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
        permissions: editingRole.permissions,
        order: editingRole.order
      }).eq('id', editingRole.id);
      logAction('role_update', `Rôle "${editingRole.name}" mis à jour`);
      setEditingRole(null);
      fetchData();
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
      fetchData();
    } catch (error) {
      console.error("Error updating member roles:", error);
    }
  };

  const handleKickMember = async (userId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Déconnecter du vocal",
      description: "Êtes-vous sûr de vouloir déconnecter ce membre de son salon vocal ?",
      danger: true,
      onConfirm: async () => {
        try {
          const member = members.find(m => m.user_id === userId);
          // Force disconnect from voice only
          socket.emit('move-user', { userId, channelId: null });
          if (member) logAction('member_kick', `Membre ${member.user?.username || 'Utilisateur'} déconnecté du vocal`);
          fetchData();
        } catch (error) {
          console.error("Error disconnecting member:", error);
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
          // Force disconnect and redirect
          socket.emit('server-kick', { userId, serverId: server.id });
          if (member) logAction('member_ban', `Membre ${member.user?.username || 'Utilisateur'} banni`);
          fetchData();
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
      fetchData();
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
            <span className="font-medium">{t('serverSettings.overview')}</span>
          </button>
          
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'roles' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Shield className="w-4 h-4" />
            <span className="font-medium">{t('serverSettings.roles')}</span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'channels' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Hash className="w-4 h-4" />
            <span className="font-medium">{t('serverSettings.channels')}</span>
          </button>

          <button
            onClick={() => setActiveTab('emojis')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'emojis' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Smile className="w-4 h-4" />
            <span className="font-medium">{t('serverSettings.emojis')}</span>
          </button>

          <button
            onClick={() => setActiveTab('soundboard')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'soundboard' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Volume2 className="w-4 h-4" />
            <span className="font-medium">{t('serverSettings.soundboard', 'Soundboard')}</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'members' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Users className="w-4 h-4" />
            <span className="font-medium">{t('serverSettings.members')}</span>
          </button>

          <button
            onClick={() => setActiveTab('invites')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${activeTab === 'invites' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <LinkIcon className="w-4 h-4" />
            <span className="font-medium">{t('serverSettings.invites')}</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md md:mb-4 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'bg-zinc-700/50 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Folder className="w-4 h-4" />
            <span className="font-medium">{t('serverSettings.logs')}</span>
          </button>

          <div className="md:mt-auto md:pt-4 md:border-t border-zinc-700/50 flex items-center">
            <button
              onClick={handleDeleteServer}
              className="flex items-center gap-2 md:gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap w-full"
            >
              <Trash2 className="w-4 h-4" />
              <span className="font-medium">{t('serverSettings.deleteServer')}</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-zinc-800 relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded-full transition-colors flex flex-col items-center gap-1 z-10"
          >
            <X className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase">Échap</span>
          </button>

          <div className={clsx("flex-1 pt-6 pl-6 pb-6 pr-16 md:pt-10 md:pl-10 md:pb-10 md:pr-24 min-h-0", activeTab !== 'members' && "overflow-y-auto custom-scrollbar")}>
            {activeTab === 'overview' && (
              <div className="max-w-xl">
                <h2 className="text-xl font-bold text-zinc-100 mb-6">{t('serverSettings.overview')}</h2>
                
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
                          <span className="text-xs font-bold text-white uppercase">{t('modals.userProfile.changeAvatar')}</span>
                        </div>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleIconUpload}
                          disabled={isUploadingIcon}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </div>
                      {isUploadingIcon && <span className="text-xs text-indigo-400 animate-pulse">{t('common.uploading')}</span>}
                      {iconUrl && (
                        <button 
                          onClick={() => setIconUrl('')}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          {t('common.removeImage')}
                        </button>
                      )}
                    </div>

                    <div className="flex-1 w-full">
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        {t('serverSettings.serverName')}
                      </label>
                      <input
                        type="text"
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      {t('serverSettings.defaultRole', 'Rôle par défaut')}
                    </label>
                    <p className="text-xs text-zinc-500 mb-3">
                      {t('serverSettings.defaultRoleDescription', 'Ce rôle sera automatiquement attribué aux nouveaux membres rejoignant le serveur.')}
                    </p>
                    <select
                      value={defaultRoleId || ''}
                      onChange={(e) => setDefaultRoleId(e.target.value || null)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">{t('serverSettings.noDefaultRole', 'Aucun (Rôle par défaut)')}</option>
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleUpdateServer}
                      disabled={isSaving}
                      className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md font-medium transition-colors disabled:opacity-50"
                    >
                      {isSaving ? t('serverSettings.saving') : t('serverSettings.saveChanges')}
                    </button>
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
                        {t('common.back')}
                      </button>
                      <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.editRole', { name: editingRole.name })}</h2>
                    </div>

                    <div className="space-y-6">
                      <div className="flex gap-6">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                            {t('serverSettings.roleName')}
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
                            {t('serverSettings.position')}
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={editingRole.order || 1}
                            onChange={(e) => setEditingRole({...editingRole, order: parseInt(e.target.value) || 1 })}
                            className="w-20 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500 text-center"
                            title={t('serverSettings.highestRank')}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                            {t('serverSettings.roleColor')}
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
                        <h3 className="text-lg font-bold text-zinc-100 mb-4">{t('serverSettings.permissions')}</h3>
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
                          {t('serverSettings.saveChanges')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.roles')}</h2>
                      <button 
                        onClick={handleCreateRole}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {t('serverSettings.createRole')}
                      </button>
                    </div>
                    
                    <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                      {roles.length === 0 ? (
                        <div className="p-8 text-center text-zinc-400">
                          {t('serverSettings.noCustomRoles')}
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
                        {t('common.back')}
                      </button>
                      <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.editChannel', { name: editingChannel.name })}</h2>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          {t('serverSettings.channelName')}
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
                          {t('modals.createChannel.channelType')}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => setEditingChannel({...editingChannel, displayType: 'TEXT'})}
                            className={clsx(
                              "flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors",
                              (editingChannel.displayType === 'TEXT' || (!editingChannel.displayType && editingChannel.type === 'TEXT')) ? "bg-zinc-700 border-indigo-500 text-zinc-100" : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                            )}
                          >
                            <Hash className="w-5 h-5" />
                            <span className="text-xs font-medium">{t('common.text')}</span>
                          </button>
                          <button
                            onClick={() => setEditingChannel({...editingChannel, displayType: 'VOICE'})}
                            className={clsx(
                              "flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors",
                              (editingChannel.displayType === 'VOICE' || (!editingChannel.displayType && editingChannel.type === 'VOICE' && !editingChannel.name.endsWith(' [AFK]'))) ? "bg-zinc-700 border-indigo-500 text-zinc-100" : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                            )}
                          >
                            <Volume2 className="w-5 h-5" />
                            <span className="text-xs font-medium">{t('common.voice')}</span>
                          </button>
                          <button
                            onClick={() => setEditingChannel({...editingChannel, displayType: 'AFK'})}
                            className={clsx(
                              "flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors",
                              (editingChannel.displayType === 'AFK') ? "bg-zinc-700 border-indigo-500 text-zinc-100" : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                            )}
                          >
                            <Moon className="w-5 h-5" />
                            <span className="text-xs font-medium">AFK</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                          {t('serverSettings.category')}
                        </label>
                        <select
                          value={editingChannel.category_id || ''}
                          onChange={(e) => setEditingChannel({...editingChannel, category_id: e.target.value || null})}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">{t('serverSettings.uncategorized')}</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="pt-4 border-t border-zinc-700/50">
                        <h3 className="text-lg font-bold text-zinc-100 mb-4">{t('serverSettings.permissions', 'Permissions du salon')}</h3>
                        
                        <div className="space-y-4 mb-6">
                            <label className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/50 cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500 bg-zinc-800"
                                checked={editingChannel.isPrivate}
                                onChange={(e) => {
                                  const priv = e.target.checked;
                                  setEditingChannel({ 
                                    ...editingChannel, 
                                    isPrivate: priv,
                                    rolePermissions: editingChannel.rolePermissions?.map((rp: any) => ({ ...rp, canView: !priv }))
                                  });
                                }}
                              />
                              <div>
                                <div className="text-sm font-medium text-zinc-200">Salon Privé</div>
                                <div className="text-xs text-zinc-400">Rend le salon visible uniquement pour certains rôles spécifiques.</div>
                              </div>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/50 cursor-pointer">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500 bg-zinc-800"
                                checked={editingChannel.isReadOnly}
                                onChange={(e) => {
                                  const readOnly = e.target.checked;
                                  setEditingChannel({ 
                                    ...editingChannel, 
                                    isReadOnly: readOnly,
                                    rolePermissions: editingChannel.rolePermissions?.map((rp: any) => ({ ...rp, canWrite: !readOnly }))
                                  });
                                }}
                              />
                              <div>
                                <div className="text-sm font-medium text-zinc-200">Lecture Seule</div>
                                <div className="text-xs text-zinc-400">Empêche les membres d'envoyer des messages, sauf pour certains rôles spécifiques.</div>
                              </div>
                            </label>
                        </div>
                        
                        {(editingChannel.isPrivate || editingChannel.isReadOnly) && roles.length > 0 && (
                          <div className="space-y-2 mt-4">
                            <div className="text-xs font-bold text-zinc-400 uppercase mb-2">Exceptions par rôle</div>
                            {editingChannel.rolePermissions?.map((rp: any, idx: number) => (
                              <div key={rp.roleId} className="flex items-center justify-between p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
                                <div className="flex items-center gap-2">
                                   <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: rp.color || '#99aab5' }} />
                                   <span className="text-sm text-zinc-300 font-medium">{rp.name}</span>
                                </div>
                                <div className="flex gap-4">
                                  {editingChannel.isPrivate && (
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={rp.canView}
                                        onChange={(e) => {
                                          const next = [...editingChannel.rolePermissions];
                                          next[idx].canView = e.target.checked;
                                          setEditingChannel({...editingChannel, rolePermissions: next});
                                        }}
                                        className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500 bg-zinc-800"
                                      />
                                      <span className="text-xs text-zinc-400">Voir</span>
                                    </label>
                                  )}
                                  {editingChannel.isReadOnly && (
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={rp.canWrite}
                                        onChange={(e) => {
                                          const next = [...editingChannel.rolePermissions];
                                          next[idx].canWrite = e.target.checked;
                                          setEditingChannel({...editingChannel, rolePermissions: next});
                                        }}
                                        className="rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500 bg-zinc-800"
                                      />
                                      <span className="text-xs text-zinc-400">Écrire</span>
                                    </label>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {roles.length === 0 && (editingChannel.isPrivate || editingChannel.isReadOnly) && (
                          <div className="text-sm text-zinc-500 mt-2">Aucun rôle personnalisé disponible.</div>
                        )}
                      </div>

                      <div className="pt-6 flex justify-end">
                        <button
                          onClick={handleUpdateChannel}
                          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md font-medium transition-colors"
                        >
                          {t('serverSettings.saveChanges')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.channelsAndCategories')}</h2>
                      <button 
                        onClick={handleCreateCategory}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {t('serverSettings.createCategory')}
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {/* Uncategorized */}
                      <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                        <div className="bg-zinc-800/50 px-4 py-2 border-b border-zinc-700/50 font-semibold text-zinc-300 text-sm uppercase tracking-wider">
                          {t('serverSettings.uncategorized')}
                        </div>
                        {channels.filter((c: any) => !c.category_id).map((channel: any) => {
                          const isAfk = channel.name.endsWith(' [AFK]');
                          const displayName = isAfk ? channel.name.replace(' [AFK]', '') : channel.name;
                          const isPrivate = roles.some(r => r.permissions?.includes(`RESTRICT_CHANNEL_${channel.id}`));
                          const isReadOnly = roles.some(r => r.permissions?.includes(`RESTRICT_WRITE_CHANNEL_${channel.id}`));
                          return (
                            <div key={channel.id} className="p-3 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                              <div className="flex items-center gap-2 text-zinc-300">
                                {channel.type === 'TEXT' ? <Hash className="w-4 h-4 text-zinc-500" /> : isAfk ? <Moon className="w-4 h-4 text-zinc-500" /> : <Volume2 className="w-4 h-4 text-zinc-500" />}
                                <span>{displayName}</span>
                                <div className="flex items-center gap-1 ml-2">
                                  {isPrivate && <span title="Salon privé"><EyeOff className="w-3.5 h-3.5 text-red-400" /></span>}
                                  {isReadOnly && <span title="Lecture seule"><Lock className="w-3.5 h-3.5 text-amber-400" /></span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => openEditChannelModal(channel, isAfk, displayName)}
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
                          );
                        })}
                        {channels.filter(c => !c.category_id).length === 0 && (
                          <div className="p-4 text-center text-zinc-500 text-sm">{t('serverSettings.noChannels')}</div>
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
                          {channels.filter((c: any) => c.category_id === category.id).map((channel: any) => {
                            const isAfk = channel.name.endsWith(' [AFK]');
                            const displayName = isAfk ? channel.name.replace(' [AFK]', '') : channel.name;
                            const isPrivate = roles.some(r => r.permissions?.includes(`RESTRICT_CHANNEL_${channel.id}`));
                            const isReadOnly = roles.some(r => r.permissions?.includes(`RESTRICT_WRITE_CHANNEL_${channel.id}`));
                            return (
                              <div key={channel.id} className="p-3 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                                <div className="flex items-center gap-2 text-zinc-300 pl-4">
                                  {channel.type === 'TEXT' ? <Hash className="w-4 h-4 text-zinc-500" /> : isAfk ? <Moon className="w-4 h-4 text-zinc-500" /> : <Volume2 className="w-4 h-4 text-zinc-500" />}
                                  <span>{displayName}</span>
                                  <div className="flex items-center gap-1 ml-2">
                                    {isPrivate && <span title="Salon privé"><EyeOff className="w-3.5 h-3.5 text-red-400" /></span>}
                                    {isReadOnly && <span title="Lecture seule"><Lock className="w-3.5 h-3.5 text-amber-400" /></span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => openEditChannelModal(channel, isAfk, displayName)}
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
                            );
                          })}
                          {channels.filter(c => c.category_id === category.id).length === 0 && (
                            <div className="p-4 text-center text-zinc-500 text-sm">{t('serverSettings.noChannelsInCategory')}</div>
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
                <h2 className="text-xl font-bold text-zinc-100 mb-6">{t('serverSettings.serverMembers')}</h2>
                
                <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden mb-8 flex-1 flex flex-col min-h-0">
                  <div className="overflow-y-auto flex-1 custom-scrollbar">
                    {members.map((member, index) => (
                      <div key={member.user_id} className="p-4 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <UserAvatar 
                            user={{
                              username: member.user?.username || t('serverSettings.unknownUser'),
                              avatarUrl: member.user?.avatar_url || '',
                              status: member.user?.status || 'offline'
                            }} 
                            size="lg" 
                            showStatus={false}
                          />
                        <div>
                          <div className="text-zinc-100 font-medium">{member.user?.username || t('serverSettings.unknownUser')}</div>
                          <div className="text-xs text-zinc-400">{t('serverSettings.joinedOn', { date: new Date(member.joined_at).toLocaleDateString() })}</div>
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
                                  members.length > 2 && index > members.length - 2 ? "bottom-full mb-2" : "top-full mt-2"
                                )}>
                                  <div className="p-2 border-b border-zinc-800">
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                                      {t('serverSettings.roles')}
                                    </div>
                                    <input 
                                      type="text"
                                      placeholder={t('serverSettings.searchRoles')}
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
                                        {t('serverSettings.noResults')}
                                      </div>
                                    )}
                                    {roles.length === 0 && (
                                      <div className="px-3 py-2 text-xs text-zinc-500 italic">
                                        {t('serverSettings.noRolesCreated')}
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
                                title={t('serverSettings.kick')}
                              >
                                <UserMinus className="w-4 h-4" />
                              </button>
                            )}
                            {hasBanMembers && (
                              <button
                                onClick={() => handleBanMember(member.user_id)}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-zinc-800 rounded-md transition-colors"
                                title={t('serverSettings.ban')}
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
                    <h2 className="text-xl font-bold text-zinc-100 mb-6">{t('serverSettings.bannedMembers')}</h2>
                    <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                      {bans.map(ban => (
                        <div key={ban.id} className="p-4 border-b border-zinc-700/50 last:border-0 flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <UserAvatar 
                              user={{
                                username: ban.user?.username || t('serverSettings.unknownUser'),
                                avatarUrl: ban.user?.avatar_url || '',
                                status: 'offline'
                              }} 
                              size="lg" 
                            />
                            <div>
                              <div className="text-zinc-100 font-medium">{ban.user?.username || t('serverSettings.unknownUser')}</div>
                              <div className="text-xs text-zinc-400">{t('serverSettings.bannedOn', { date: new Date(ban.created_at).toLocaleDateString() })}</div>
                            </div>
                          </div>
                          {hasBanMembers && (
                            <button
                              onClick={() => handleUnbanMember(ban.user_id)}
                              className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                            >
                              {t('serverSettings.unban')}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'emojis' && (
              <div className="max-w-xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.customEmojisTitle')}</h2>
                    <p className="text-sm text-zinc-400 mt-1">{t('serverSettings.customEmojisDesc')}</p>
                  </div>
                  <div>
                    <input
                      type="file"
                      id="emoji-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={handleEmojiUpload}
                    />
                    <label
                      htmlFor="emoji-upload"
                      className="cursor-pointer bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors inline-block"
                    >
                      {t('serverSettings.addEmoji')}
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {customEmojis.map((emoji, index) => (
                    <div key={index} className="bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-3 flex flex-col items-center gap-2 group relative">
                      <img src={emoji.url} alt={emoji.name} className="w-10 h-10 object-contain" />
                      <span className="text-xs text-zinc-300 font-medium truncate w-full text-center">:{emoji.name}:</span>
                      <button
                        onClick={() => handleDeleteEmoji(index)}
                        className="absolute top-1 right-1 p-1 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100"
                        title={t('serverSettings.deleteEmoji')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  ))}
                  
                  {customEmojis.length === 0 && (
                    <div className="col-span-full py-8 text-center border-2 border-dashed border-zinc-700 rounded-lg text-zinc-500 flex flex-col items-center">
                      <Smile className="w-8 h-8 mb-2 opacity-50" />
                      <p>{t('serverSettings.noCustomEmojis')}</p>
                      <p className="text-xs mt-1">{t('serverSettings.maxEmojiSize')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'soundboard' && (
              <div className="max-w-xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.soundboardTitle', 'Soundboard')}</h2>
                    <p className="text-sm text-zinc-400 mt-1">{t('serverSettings.soundboardDesc', 'Ajoute des sons que tout le monde peut jouer dans les salons vocaux.')}</p>
                  </div>
                  {hasManageSoundboard && (
                    <div>
                      <input
                        type="file"
                        id="sound-upload"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleSoundUpload}
                      />
                      <label
                        htmlFor="sound-upload"
                        className="cursor-pointer bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors inline-block"
                      >
                        {t('serverSettings.addSound', 'Ajouter un son')}
                      </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {soundboardSounds.map((sound, index) => {
                    const isPlaying = currentAudio && currentAudio.src === sound.url;
                    return (
                      <div key={index} className={clsx(
                        "bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-3 flex flex-col items-center gap-2 group relative transition-all",
                        currentAudio && !isPlaying && "opacity-50 grayscale"
                      )}>
                        <div className={clsx(
                          "w-10 h-10 flex items-center justify-center text-2xl bg-zinc-800 rounded relative group/sound transition-all",
                          isPlaying && "ring-2 ring-indigo-500 scale-110"
                        )}>
                          {sound.emoji || '🔊'}
                          {!currentAudio && (
                            <button
                              onClick={() => handlePreviewSound(sound.url)}
                              className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded opacity-0 group-focus-within/sound:opacity-100 group-hover/sound:opacity-100 transition-opacity"
                              title={t('soundboard.preview', 'Écouter')}
                            >
                              <Play className="w-5 h-5 flex shrink-0" />
                            </button>
                          )}
                        </div>
                        <span className="text-xs text-zinc-300 font-medium truncate w-full text-center">{sound.name}</span>
                        {hasManageSoundboard && (
                          <button
                            onClick={() => handleDeleteSound(index)}
                            className="absolute top-1 right-1 p-1 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100"
                            title={t('serverSettings.deleteSound', 'Supprimer le son')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  
                  {soundboardSounds.length === 0 && (
                    <div className="col-span-full py-8 text-center border-2 border-dashed border-zinc-700 rounded-lg text-zinc-500 flex flex-col items-center">
                      <Volume2 className="w-8 h-8 mb-2 opacity-50" />
                      <p>{t('serverSettings.noSounds', 'Aucun son dans le soundboard')}</p>
                      <p className="text-xs mt-1">{t('serverSettings.maxSoundSize', 'Taille max: 5 Mo')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'invites' && (
              <div className="max-w-xl">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.invites')}</h2>
                  <button 
                    onClick={handleCreateInvite}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t('serverSettings.generateLink')}
                  </button>
                </div>
                
                <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                  {invites.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400">
                      {t('serverSettings.noActiveInvites')}
                    </div>
                  ) : (
                    invites.map(invite => (
                      <div key={invite.code} className="p-4 border-b border-zinc-700/50 last:border-0 flex items-center justify-between gap-4">
                        <div className="flex-1 overflow-hidden">
                          <div className="text-zinc-100 font-medium font-mono truncate bg-zinc-950/50 p-2 rounded border border-zinc-800">
                            {invite.code}
                          </div>
                          <div className="text-xs text-zinc-400 mt-2">{t('serverSettings.createdOn', { date: new Date(invite.created_at).toLocaleDateString() })}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={async () => {
                              await copyToClipboard(invite.code);
                              addNotification("Code copié dans le presse-papier !", "success");
                            }}
                            className="p-2 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800 rounded-md transition-colors"
                            title={t('serverSettings.copyLink')}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteInvite(invite.code)}
                            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
                            title={t('serverSettings.deleteInvite')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
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
                    <h2 className="text-xl font-bold text-zinc-100">{t('serverSettings.auditLogs')}</h2>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleSelectAllLogs}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {logFilters.length === LOG_OPTIONS.length ? t('serverSettings.deselectAll') : t('serverSettings.selectAll')}
                      </button>
                      
                      <div className="relative">
                        <button
                          onClick={() => setIsLogFilterOpen(!isLogFilterOpen)}
                          className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800 transition-colors"
                        >
                          {t('serverSettings.filterByAction', 'Filtrer par action')}
                          <Settings className="w-3 h-3" />
                        </button>
                        
                        {isLogFilterOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsLogFilterOpen(false)} />
                            <div className="absolute right-0 mt-2 w-64 bg-zinc-950 border border-zinc-700 rounded-md shadow-xl z-50 overflow-hidden max-h-80 flex flex-col">
                              <div className="p-2 border-b border-zinc-800 bg-zinc-900/50">
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                  {t('serverSettings.actions', 'Actions')}
                                </div>
                              </div>
                              <div className="overflow-y-auto custom-scrollbar p-1">
                                <button
                                  onClick={() => handleToggleLogFilter('all')}
                                  className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors rounded hover:bg-zinc-800",
                                    logFilters.includes('all') ? "text-indigo-400" : "text-zinc-300"
                                  )}
                                >
                                  <div className={clsx(
                                    "w-3.5 h-3.5 border rounded flex items-center justify-center",
                                    logFilters.includes('all') ? "bg-indigo-500 border-indigo-500" : "border-zinc-600"
                                  )}>
                                    {logFilters.includes('all') && <Check className="w-2.5 h-2.5 text-white" />}
                                  </div>
                                  {t('serverSettings.logsAll')}
                                </button>
                                
                                {LOG_OPTIONS.map(option => (
                                  <button
                                    key={option.value}
                                    onClick={() => handleToggleLogFilter(option.value)}
                                    className={clsx(
                                      "w-full flex items-center gap-3 px-3 py-2 text-xs transition-colors rounded hover:bg-zinc-800",
                                      logFilters.includes(option.value) ? "text-indigo-400" : "text-zinc-300"
                                    )}
                                  >
                                    <div className={clsx(
                                      "w-3.5 h-3.5 border rounded flex items-center justify-center",
                                      logFilters.includes(option.value) ? "bg-indigo-500 border-indigo-500" : "border-zinc-600"
                                    )}>
                                      {logFilters.includes(option.value) && <Check className="w-2.5 h-2.5 text-white" />}
                                    </div>
                                    {t(`serverSettings.${option.value}`)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-zinc-900/50 rounded-lg border border-zinc-700/50 overflow-hidden flex-1 flex flex-col min-h-0">
                  {filteredLogs.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400">
                      {t('serverSettings.noLogsFound')}
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-700/50 overflow-y-auto custom-scrollbar">
                      {filteredLogs.map(log => (
                        <div key={log.id} className="p-4 flex flex-col gap-1 hover:bg-zinc-800/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-200">{log.details}</span>
                            <span className="text-xs text-zinc-500">{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          <div className="text-xs text-zinc-400 flex items-center gap-1">
                            <span>{t('serverSettings.by')}</span>
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
