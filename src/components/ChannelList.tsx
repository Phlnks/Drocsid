import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { motion, AnimatePresence } from 'motion/react';
import { Hash, Plus, Settings, ChevronDown, ChevronRight, LogOut, Database } from 'lucide-react';
import clsx from 'clsx';
import socket from '../lib/socket';
import CreateChannelModal from './ui/CreateChannelModal';
import UserSettingsModal from './ui/UserSettingsModal';
import ServerSettingsModal from './ui/ServerSettingsModal';
import RenameChannelModal from './ui/RenameChannelModal';
import { InstanceSettingsModal } from './InstanceSettingsModal';
import VoiceChannelItem from './VoiceChannelItem';
import UserAvatar from './ui/UserAvatar';
import { playConnectSound } from '../lib/sounds';
import { useInstanceStore } from '../store/instanceStore';
import { useTranslation } from 'react-i18next';

export default function ChannelList() {
  const { t } = useTranslation();
  const { user, currentUserProfile, setCurrentUserProfile } = useAuthStore();
  const { 
    selectedServerId, 
    selectedChannelId, 
    setSelectedChannelId, 
    connectedVoiceChannelId, 
    setConnectedVoiceChannelId,
    setIsVoiceMuted,
    setIsDeafened,
    addNotification,
    serverSettingsModal,
    setServerSettingsModal
  } = useAppStore();
  const [channels, setChannels] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [server, setServer] = useState<any>(null);
  const [currentUserMember, setCurrentUserMember] = useState<any>(null);
  const [serverRoles, setServerRoles] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [channelToRename, setChannelToRename] = useState<any>(null);
  const [selectedCategoryIdForNewChannel, setSelectedCategoryIdForNewChannel] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);

  useEffect(() => {
    if (!selectedServerId || !user) return;

    const fetchData = async () => {
      // Fetch everything concurrently for performance
      const [
        { data: serverData },
        { data: channelsData },
        { data: categoriesData },
        { data: memberData },
        { data: rolesData }
      ] = await Promise.all([
        supabase.from('servers').select('*').eq('id', selectedServerId).maybeSingle(),
        supabase.from('channels').select('*').eq('server_id', selectedServerId),
        supabase.from('categories').select('*').eq('server_id', selectedServerId),
        supabase.from('server_members').select('*').eq('server_id', selectedServerId).eq('user_id', user.id).maybeSingle(),
        supabase.from('roles').select('*').eq('server_id', selectedServerId)
      ]);

      if (serverData) setServer(serverData);
      if (categoriesData) setCategories(categoriesData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      if (memberData) setCurrentUserMember(memberData);
      if (rolesData) setServerRoles(rolesData);

      if (channelsData) {
        const sorted = channelsData.sort((a, b) => (a.order || 0) - (b.order || 0));
        setChannels(sorted);
        
        // Compute viewable channels immediately
        const isOwner = serverData?.owner_id === user?.id;
        const visibleChannels = sorted.filter(c => {
          if (isOwner) return true;
          let isAdmin = false;
          let isDenied = false;
          let isAllowed = false;

          if (memberData && Array.isArray(memberData.roles)) {
            if (memberData.roles.includes('owner')) return true;
            const userRoles = (rolesData || []).filter(r => memberData.roles.includes(r.id));
            for (const role of userRoles) {
              if (role.permissions?.includes('ADMINISTRATOR')) isAdmin = true;
              if (role.permissions?.includes(`DENY_CHANNEL_${c.id}`)) isDenied = true;
              if (role.permissions?.includes(`ALLOW_CHANNEL_${c.id}`)) isAllowed = true;
            }
          }
          if (isAdmin) return true;
          if (isDenied && !isAllowed) return false;
          return true;
        });

        if (visibleChannels.length > 0) {
          if (!selectedChannelId || !visibleChannels.find(c => c.id === selectedChannelId)) {
            const textChannel = visibleChannels.find(c => c.type === 'TEXT') || visibleChannels[0];
            setSelectedChannelId(textChannel.id);
          }
        } else if (selectedChannelId) {
          setSelectedChannelId(null);
        }
      }
    };

    fetchData();

    const channelName = `server_${selectedServerId}_${user.id}_${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `server_id=eq.${selectedServerId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `server_id=eq.${selectedServerId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers', filter: `id=eq.${selectedServerId}` }, () => fetchData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `server_id=eq.${selectedServerId}` }, (payload) => {
        // If a new message arrives in any channel of this server
        setChannels(prev => prev.map(c => 
          c.id === payload.new.channel_id 
            ? { ...c, last_message_at: payload.new.created_at } 
            : c
        ));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedServerId, user]);

  const logAction = async (action: string, details: string) => {
    if (!user || !selectedServerId) return;
    try {
      await supabase.from('server_logs').insert({
        server_id: selectedServerId,
        action,
        details,
        user_id: user.id,
        username: user.user_metadata?.username || t('common.user')
      });
    } catch (e) {
      console.error("Failed to log action:", e);
    }
  };

  const handleCreateChannel = async (name: string, type: 'TEXT' | 'VOICE' | 'AFK', categoryId: string | null) => {
    if (!selectedServerId) return;

    try {
      const dbType = type === 'AFK' ? 'VOICE' : type;
      const dbName = type === 'AFK' ? `${name} [AFK]` : name;

      const { error } = await supabase.from('channels').insert({
        server_id: selectedServerId,
        category_id: categoryId,
        name: dbName,
        type: dbType
      });
      
      if (error) throw error;
      
      logAction('channel_create', t('logs.channelCreate', { type: type === 'TEXT' ? t('common.text') : t('common.voice'), name: dbName }));
    } catch (error: any) {
      console.error("Error creating channel:", error);
      addNotification(`${t('channelList.createChannelError')} : ${error.message}`, "error");
    }
  };

  const handleRenameChannel = async (newName: string) => {
    if (!channelToRename) return;
    try {
      const isAfk = channelToRename.name.endsWith(' [AFK]');
      // Strip any user-typed [AFK] to prevent accidental conversion
      const cleanName = newName.replace(' [AFK]', '');
      const dbName = isAfk ? `${cleanName} [AFK]` : cleanName;

      await supabase.from('channels').update({
        name: dbName
      }).eq('id', channelToRename.id);
      logAction('channel_rename', t('logs.channelRename', { old: channelToRename.name, new: dbName }));
    } catch (error) {
      console.error("Error renaming channel:", error);
    }
  };

  const handleChannelClick = (channel: any) => {
    const isAfk = channel.name.endsWith(' [AFK]');
    
    if (channel.type === 'VOICE' || isAfk) {
      if (connectedVoiceChannelId !== channel.id) {
        playConnectSound();
      }
      
      if (isAfk) {
        setIsVoiceMuted(true);
        setIsDeafened(true);
      }
      
      setConnectedVoiceChannelId(channel.id, selectedServerId);
      setSelectedChannelId(channel.id);
    } else {
      setSelectedChannelId(channel.id);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const openCreateChannelModal = (categoryId: string | null = null) => {
    setSelectedCategoryIdForNewChannel(categoryId);
    setIsModalOpen(true);
  };

  if (!selectedServerId) {
    return <div className="flex-1 md:w-60 bg-zinc-900 flex-shrink-0 border-r border-zinc-800" />;
  }

  const isOwner = server?.owner_id === user?.id;
  
  // Calculate permissions
  let hasManageChannels = isOwner || !!currentUserProfile?.is_super_admin;
  let hasManageServer = isOwner || !!currentUserProfile?.is_super_admin;
  let hasMoveMembers = isOwner || !!currentUserProfile?.is_super_admin;
  let hasKickMembers = isOwner || !!currentUserProfile?.is_super_admin;
  let hasBanMembers = isOwner || !!currentUserProfile?.is_super_admin;

  if (currentUserMember && Array.isArray(currentUserMember.roles)) {
    if (currentUserMember.roles.includes('owner')) {
      hasManageChannels = true;
      hasManageServer = true;
      hasMoveMembers = true;
      hasKickMembers = true;
      hasBanMembers = true;
    } else {
      const userRoles = serverRoles.filter(r => currentUserMember.roles.includes(r.id));
      for (const role of userRoles) {
        if (role.permissions?.includes('ADMINISTRATOR')) {
          hasManageChannels = true;
          hasManageServer = true;
          hasMoveMembers = true;
          hasKickMembers = true;
          hasBanMembers = true;
          break;
        }
        if (role.permissions?.includes('MANAGE_CHANNELS')) hasManageChannels = true;
        if (role.permissions?.includes('MANAGE_SERVER')) hasManageServer = true;
        if (role.permissions?.includes('MOVE_MEMBERS')) hasMoveMembers = true;
        if (role.permissions?.includes('KICK_MEMBERS')) hasKickMembers = true;
        if (role.permissions?.includes('BAN_MEMBERS')) hasBanMembers = true;
      }
    }
  }

  const handleMoveMember = async (userId: string, targetChannelId: string) => {
    if (!hasMoveMembers || !userId) return;
    socket.emit('move-user', { userId, channelId: targetChannelId });
  };

  const handleDisconnectMember = async (userId: string) => {
    if (!hasMoveMembers || !userId) return; // Using move permission for disconnect as well
    socket.emit('move-user', { userId, channelId: null });
  };

  const handleKickMember = async (userId: string) => {
    if (!hasKickMembers || !selectedServerId) return;
    try {
      // Also disconnect them from voice
      socket.emit('move-user', { userId, channelId: null });
    } catch (error) {
      console.error("Error kicking member:", error);
    }
  };

  const handleBanMember = async (userId: string) => {
    if (!hasBanMembers || !selectedServerId) return;
    try {
      // Add to bans collection
      await supabase.from('server_bans').insert({
        server_id: selectedServerId,
        user_id: userId,
        banned_by: user?.id
      });
      // Remove from members
      await supabase.from('server_members').delete().eq('server_id', selectedServerId).eq('user_id', userId);
      // Disconnect from voice
      socket.emit('move-user', { userId, channelId: null });
    } catch (error) {
      console.error("Error banning member:", error);
    }
  };

  const handleChannelDragStart = (e: React.DragEvent, channel: any) => {
    if (!hasManageChannels) return;
    e.stopPropagation();
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'channel', channelId: channel.id, categoryId: channel.category_id }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedChannelId(channel.id);
  };

  const handleChannelDragEnd = () => {
    setDraggedChannelId(null);
    setDragOverChannelId(null);
  };

  const handleChannelDragOver = (e: React.DragEvent, targetChannel: any) => {
    if (!hasManageChannels || !draggedChannelId) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggedChannelId !== targetChannel.id) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverChannelId(targetChannel.id);
    }
  };

  const handleChannelDragLeave = () => {
    setDragOverChannelId(null);
  };

  const handleChannelDrop = async (e: React.DragEvent, targetChannel: any) => {
    if (!hasManageChannels) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverChannelId(null);
    setDraggedChannelId(null);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      
      if (data.type === 'channel' && data.channelId && data.channelId !== targetChannel.id) {
        const sourceCategoryId = data.categoryId;
        const targetCategoryId = targetChannel.category_id;
        
        const targetCategoryChannels = channelsByCategory[targetCategoryId || 'uncategorized'] || [];
        let newChannelList = [...targetCategoryChannels];
        const draggedChannel = channels.find(c => c.id === data.channelId);
        
        if (!draggedChannel) return;

        if (sourceCategoryId === targetCategoryId) {
          newChannelList = newChannelList.filter(c => c.id !== data.channelId);
        }
        
        const targetIndex = newChannelList.findIndex(c => c.id === targetChannel.id);
        newChannelList.splice(targetIndex, 0, draggedChannel);
        
        for (let i = 0; i < newChannelList.length; i++) {
          await supabase.from('channels').update({
            order: i,
            category_id: targetCategoryId || null
          }).eq('id', newChannelList[i].id);
        }
      }
    } catch (err) {
      console.error("Error dropping channel:", err);
    }
  };

  const handleCategoryDragOver = (e: React.DragEvent, categoryId: string | null) => {
    if (!hasManageChannels || !draggedChannelId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverChannelId(`category-${categoryId}`);
  };

  const handleCategoryDrop = async (e: React.DragEvent, categoryId: string | null) => {
    if (!hasManageChannels) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverChannelId(null);
    setDraggedChannelId(null);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      
      if (data.type === 'channel' && data.channelId) {
        const sourceCategoryId = data.categoryId;
        
        if (sourceCategoryId === categoryId) return;

        const targetCategoryChannels = channelsByCategory[categoryId || 'uncategorized'] || [];
        const draggedChannel = channels.find(c => c.id === data.channelId);
        
        if (!draggedChannel) return;

        let newChannelList = [...targetCategoryChannels];
        newChannelList.push(draggedChannel);
        
        for (let i = 0; i < newChannelList.length; i++) {
          await supabase.from('channels').update({
            order: i,
            category_id: categoryId || null
          }).eq('id', newChannelList[i].id);
        }
      }
    } catch (err) {
      console.error("Error dropping channel on category:", err);
    }
  };

  const canViewChannel = (channelId: string) => {
    if (isOwner) return true;
    let isAdmin = false;
    let isDenied = false;
    let isAllowed = false;

    if (currentUserMember && Array.isArray(currentUserMember.roles)) {
      if (currentUserMember.roles.includes('owner')) return true;
      const userRoles = serverRoles.filter(r => currentUserMember.roles.includes(r.id));
      for (const role of userRoles) {
        if (role.permissions?.includes('ADMINISTRATOR')) isAdmin = true;
        if (role.permissions?.includes(`DENY_CHANNEL_${channelId}`)) isDenied = true;
        if (role.permissions?.includes(`ALLOW_CHANNEL_${channelId}`)) isAllowed = true;
      }
    }
    if (isAdmin) return true;
    if (isDenied && !isAllowed) return false;
    return true;
  };

  const visibleChannelsList = channels.filter(c => canViewChannel(c.id));

  // Group channels by category
  const channelsByCategory: Record<string, any[]> = {
    uncategorized: visibleChannelsList.filter(c => !c.category_id)
  };

  categories.forEach(cat => {
    channelsByCategory[cat.id] = visibleChannelsList.filter(c => c.category_id === cat.id);
  });

  const handleLeaveServer = async () => {
    if (!selectedServerId || !user) return;
    if (window.confirm(t('channelList.leaveServerConfirm'))) {
      try {
        await supabase.from('server_members').delete().eq('server_id', selectedServerId).eq('user_id', user.id);
        
        await supabase.from('server_logs').insert({
          server_id: selectedServerId,
          action: 'member_leave',
          details: t('logs.memberLeave', { username: user.user_metadata?.username || t('common.user') }),
          user_id: user.id,
          username: user.user_metadata?.username || t('common.user')
        });

        setSelectedChannelId(null);
        useAppStore.getState().setSelectedServerId(null);
      } catch (error) {
        console.error("Error leaving server:", error);
      }
    }
  };

  const renderChannel = (channel: any) => {
    const isDragOver = dragOverChannelId === channel.id;
    const isUnread = channel.type === 'TEXT' && 
                     channel.last_message_at && 
                     (!currentUserProfile?.last_read?.[channel.id] || new Date(channel.last_message_at).getTime() > currentUserProfile.last_read[channel.id]) &&
                     selectedChannelId !== channel.id;

    if (channel.type === 'VOICE') {
      return (
        <div
          key={channel.id}
          draggable={hasManageChannels}
          onDragStart={(e) => handleChannelDragStart(e, channel)}
          onDragEnd={handleChannelDragEnd}
          onDragOver={(e) => handleChannelDragOver(e, channel)}
          onDragLeave={handleChannelDragLeave}
          onDrop={(e) => handleChannelDrop(e, channel)}
          className={clsx(
            "transition-all",
            isDragOver && "border-t-2 border-indigo-500"
          )}
        >
          <VoiceChannelItem
            channel={channel}
            isSelected={selectedChannelId === channel.id}
            onClick={() => handleChannelClick(channel)}
            hasMoveMembers={hasMoveMembers}
            onMoveMember={handleMoveMember}
            hasKickMembers={hasKickMembers}
            hasBanMembers={hasBanMembers}
            onDisconnectMember={handleDisconnectMember}
            onKickMember={handleKickMember}
            onBanMember={handleBanMember}
            hasManageChannels={hasManageChannels}
            onRename={(ch) => {
              setChannelToRename(ch);
              setIsRenameModalOpen(true);
            }}
          />
        </div>
      );
    }
    
    return (
      <div
        key={channel.id}
        draggable={hasManageChannels}
        onDragStart={(e) => handleChannelDragStart(e, channel)}
        onDragEnd={handleChannelDragEnd}
        onDragOver={(e) => handleChannelDragOver(e, channel)}
        onDragLeave={handleChannelDragLeave}
        onDrop={(e) => handleChannelDrop(e, channel)}
        onClick={() => handleChannelClick(channel)}
        className={clsx(
          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-[2px] group transition-all",
          selectedChannelId === channel.id 
            ? "bg-zinc-700/50 text-zinc-100" 
            : isUnread 
              ? "text-zinc-100 font-bold" 
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300",
          isDragOver && "border-t-2 border-indigo-500",
          hasManageChannels && "active:cursor-grabbing"
        )}
      >
        <Hash className={clsx("w-4 h-4", isUnread ? "text-zinc-200" : "text-zinc-400")} />
        <span className="truncate flex-1">{channel.name}</span>
        {isUnread && <div className="w-2 h-2 rounded-full bg-white ml-auto mr-1 shadow-[0_0_5px_rgba(255,255,255,0.5)]"></div>}
        {hasManageChannels && (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              setChannelToRename(channel);
              setIsRenameModalOpen(true);
            }}
            className="p-1 hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex-1 md:w-60 bg-zinc-900 flex-shrink-0 flex flex-col relative">
        <div 
          className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 font-semibold text-zinc-100 shadow-sm transition-colors cursor-pointer hover:bg-zinc-800/50"
          onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
        >
          <span className="truncate">{server?.name || t('common.loading')}</span>
          <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isServerMenuOpen ? 'rotate-180' : ''}`} />
        </div>

        <AnimatePresence>
          {isServerMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setIsServerMenuOpen(false)}
              />
              <motion.div 
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="absolute top-14 left-2 right-2 bg-zinc-950 border border-zinc-800 rounded-md shadow-xl z-50 py-2"
              >
                {hasManageServer && (
                  <button 
                    className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white flex items-center justify-between group"
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      setServerSettingsModal({ isOpen: true, serverId: selectedServerId, initialTab: 'overview' });
                    }}
                  >
                    {t('channelList.serverSettings')}
                    <Settings className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                  </button>
                )}
                {hasManageChannels && (
                  <button 
                    className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white flex items-center justify-between group"
                    onClick={() => {
                      setIsServerMenuOpen(false);
                      openCreateChannelModal(null);
                    }}
                  >
                    {t('channelList.newChannel')}
                    <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                  </button>
                )}
                {server?.owner_id !== user?.id && (
                  <>
                    {(hasManageServer || hasManageChannels) && <div className="h-px bg-zinc-800 my-1 mx-2" />}
                    <button 
                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-between group"
                      onClick={() => {
                        setIsServerMenuOpen(false);
                        handleLeaveServer();
                      }}
                    >
                      {t('channelList.leaveServer')}
                      <LogOut className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
        
        <div className="flex-1 overflow-y-auto p-2">
          {channelsByCategory.uncategorized.length > 0 && (
            <div className="mb-4">
              {channelsByCategory.uncategorized.map(renderChannel)}
            </div>
          )}

          {/* Categories */}
          {categories.map(category => {
            const categoryChannels = channelsByCategory[category.id] || [];
            const isCollapsed = collapsedCategories[category.id];

            return (
              <div key={category.id} className="mb-4">
                <div 
                  className={clsx(
                    "flex items-center justify-between text-zinc-400 hover:text-zinc-100 cursor-pointer px-1 mb-1 group transition-colors",
                    dragOverChannelId === `category-${category.id}` && "bg-zinc-800/50 rounded"
                  )}
                  onClick={() => toggleCategory(category.id)}
                  onDragOver={(e) => handleCategoryDragOver(e, category.id)}
                  onDragLeave={handleChannelDragLeave}
                  onDrop={(e) => handleCategoryDrop(e, category.id)}
                >
                  <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider">
                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <span>{category.name}</span>
                  </div>
                  {hasManageChannels && (
                    <Plus 
                      className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" 
                      onClick={(e) => { e.stopPropagation(); openCreateChannelModal(category.id); }} 
                    />
                  )}
                </div>
                
                {!isCollapsed && (
                  <div>
                    {categoryChannels.map(renderChannel)}
                  </div>
                )}
              </div>
            );
          })}

          {/* If no categories exist, show a generic header for creating channels */}
          {categories.length === 0 && hasManageChannels && (
            <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1 px-2 mt-4">
              <span>{t('channelList.channels')}</span>
              <Plus className="w-4 h-4 cursor-pointer hover:text-zinc-100" onClick={() => openCreateChannelModal(null)} />
            </div>
          )}
        </div>
      </div>

      <CreateChannelModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateChannel}
        categories={categories}
        initialCategoryId={selectedCategoryIdForNewChannel}
      />
      <RenameChannelModal
        isOpen={isRenameModalOpen}
        onClose={() => {
          setIsRenameModalOpen(false);
          setChannelToRename(null);
        }}
        onSubmit={handleRenameChannel}
        initialName={channelToRename?.name || ''}
      />
      {server && (
        <ServerSettingsModal
          isOpen={serverSettingsModal.isOpen && serverSettingsModal.serverId === selectedServerId}
          onClose={() => setServerSettingsModal({ isOpen: false })}
          server={server}
          initialTab={serverSettingsModal.initialTab || 'overview'}
        />
      )}
    </>
  );
}
