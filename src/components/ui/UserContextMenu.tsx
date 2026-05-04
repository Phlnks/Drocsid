import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Phone, UserPlus, UserMinus, ShieldAlert, UserX, Loader2, PhoneOff, User as UserIcon, AtSign, MicOff } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import socket from '../../lib/socket';
import { useTranslation } from 'react-i18next';

interface UserContextMenuProps {
  userId: string;
  username: string;
  serverId?: string | null;
  dmId?: string | null;
  position: { x: number; y: number };
  onClose: () => void;
  onViewProfile?: () => void;
}

export default function UserContextMenu({ userId, username, serverId, dmId, position, onClose, onViewProfile }: UserContextMenuProps) {
  const { t } = useTranslation();
  const [relationship, setRelationship] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverMember, setServerMember] = useState<any>(null);
  const [currentUserMember, setCurrentUserMember] = useState<any>(null);
  const [serverRoles, setServerRoles] = useState<any[]>([]);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuthStore();
  const { setSelectedDmId, setSelectedServerId, setConnectedVoiceChannelId, setIsMobileNavOpen, mutedDms, toggleMuteDm, voiceParticipants } = useAppStore();

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      // Start fetching relationship
      const fetchRel = supabase.from('relationships').select('*').contains('participants', [user.id]);

      // Prepare server-related promises
      let fetchServerMem = Promise.resolve({ data: null });
      let fetchCurrentMem = Promise.resolve({ data: null });
      let fetchRoles = Promise.resolve({ data: [] });
      let fetchServInfo = Promise.resolve({ data: null });

      if (serverId) {
        fetchServerMem = supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', userId).maybeSingle();
        fetchCurrentMem = supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', user.id).maybeSingle();
        fetchRoles = supabase.from('roles').select('*').eq('server_id', serverId);
        fetchServInfo = supabase.from('servers').select('*').eq('id', serverId).maybeSingle();
      }

      try {
        const [relRes, memData, currentMemData, rolesData, servData] = await Promise.all([
          fetchRel,
          fetchServerMem,
          fetchCurrentMem,
          fetchRoles,
          fetchServInfo
        ]);

        const rel = relRes.data?.find(r => r.participants.includes(userId));
        setRelationship(rel || null);

        if (serverId) {
          if (memData.data) setServerMember(memData.data);
          if (currentMemData.data) setCurrentUserMember(currentMemData.data);
          if (rolesData.data) setServerRoles(rolesData.data);
          if (servData.data) setServerInfo(servData.data);
        }
      } catch (err) {
        console.error("Error fetching context menu data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    const channel = supabase.channel(`user_context_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, (payload) => {
        const rel = payload.new as any || payload.old as any;
        if (rel && rel.participants && rel.participants.includes(user.id)) {
          fetchData();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () => fetchData())
      .subscribe();

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userId, serverId, onClose, user]);

  const handleDM = async () => {
    if (!user) return;
    onClose();

    try {
      const { data: dmsData } = await supabase.from('dms').select('*').contains('participants', [user.id]);
      
      let existingDmId = null;
      if (dmsData) {
        for (const dm of dmsData) {
          if (dm.participants && dm.participants.includes(userId) && dm.participants.length === 2) {
            existingDmId = dm.id;
            break;
          }
        }
      }

      if (existingDmId) {
        setSelectedDmId(existingDmId);
      } else {
        const { data: newDm, error } = await supabase.from('dms').insert({
          participants: [user.id, userId]
        }).select().single();
        
        if (error) throw error;
        setSelectedDmId(newDm.id);
      }
    } catch (error) {
      console.error("Error starting DM:", error);
    }
  };

  const handleCall = async () => {
    if (!user) return;
    onClose();

    try {
      // Find or create DM first
      const { data: dmsData } = await supabase.from('dms').select('*').contains('participants', [user.id]);
      
      let dmId = null;
      let dmParticipants = null;
      if (dmsData) {
        for (const dm of dmsData) {
          if (dm.participants && dm.participants.includes(userId) && dm.participants.length === 2) {
            dmId = dm.id;
            dmParticipants = dm.participants;
            break;
          }
        }
      }

      if (!dmId) {
        const { data: newDm, error } = await supabase.from('dms').insert({
          participants: [user.id, userId]
        }).select().single();
        
        if (error) throw error;
        dmId = newDm.id;
        dmParticipants = [user.id, userId];
      }

      // Check for active call
      const { data: callsData } = await supabase.from('calls')
        .select('*')
        .eq('dm_id', dmId)
        .contains('participants', [user.id]);
      
      if (callsData && callsData.length > 0) {
        setConnectedVoiceChannelId(dmId);
      } else {
        await supabase.from('calls').insert({
          id: dmId,
          dm_id: dmId,
          caller_id: user.id,
          participants: dmParticipants,
          status: 'ringing'
        });
        setConnectedVoiceChannelId(dmId);
      }

      // Emit socket event for real-time notification
      socket.emit('start-call', {
        callId: dmId,
        dmId: dmId,
        callerId: user.id,
        participants: dmParticipants
      });
      
      setSelectedDmId(dmId);
    } catch (error) {
      console.error("Error starting call:", error);
    }
  };

  const handleFriendAction = async () => {
    if (!user) return;
    onClose();

    try {
      if (relationship) {
        await supabase.from('relationships').delete().eq('id', relationship.id);
      } else {
        await supabase.from('relationships').insert({
          participants: [user.id, userId],
          status: 'pending',
          requester_id: user.id
        });
      }
    } catch (error) {
      console.error("Error updating relationship:", error);
    }
  };

  const handleKick = async () => {
    if (!serverId || !userId) return;
    if (!window.confirm(t('modals.userContextMenu.kickConfirm', { username }))) return;
    onClose();

    try {
      // Force disconnect from voice as requested by user (only disconnect, don't remove from server)
      socket.emit('move-user', { userId, channelId: null });
    } catch (error) {
      console.error("Error kicking user:", error);
    }
  };

  const handleBan = async () => {
    if (!serverId || !userId) return;
    if (!window.confirm(t('modals.userContextMenu.banConfirm', { username }))) return;
    onClose();

    try {
      await supabase.from('server_bans').insert({
        server_id: serverId,
        user_id: userId,
        banned_by: user?.id
      });
      await supabase.from('server_members').delete().eq('server_id', serverId).eq('user_id', userId);
      // Force disconnect and redirect
      socket.emit('server-kick', { userId, serverId });
    } catch (error) {
      console.error("Error banning user:", error);
    }
  };

  const handleDisconnectVoice = async () => {
    if (!userId) return;
    onClose();

    try {
      socket.emit('move-user', { userId, channelId: null });
    } catch (error) {
      console.error("Error disconnecting user from voice:", error);
    }
  };

  const handleMuteUser = () => {
    if (!userId) return;
    onClose();
    const targetVoiceState = Object.values(voiceParticipants).flat().find(p => p.id === userId);
    const currentlyMuted = targetVoiceState?.isMuted || false;
    socket.emit('force-mute', { userId, mute: !currentlyMuted });
  };

  let isOwner = false;
  let canKick = false;
  let canBan = false;
  let canMove = false;
  let canMute = false;

  if (serverInfo && currentUserMember) {
    isOwner = serverInfo.owner_id === user?.id;
    const targetIsOwner = serverInfo.owner_id === userId;
    
    // Determine highest order for current user (lower number = higher hierarchical priority)
    let currentUserHighestOrder = isOwner ? 0 : Infinity;
    let currentUserHasAdmin = false;
    
    const currUserRoles = serverRoles.filter(r => currentUserMember.roles?.includes(r.id));
    currUserRoles.forEach(r => {
      if ((r.order || 999) < currentUserHighestOrder) currentUserHighestOrder = r.order || 999;
      if (r.permissions?.includes('ADMINISTRATOR')) currentUserHasAdmin = true;
      if (r.permissions?.includes('KICK_MEMBERS')) canKick = true;
      if (r.permissions?.includes('BAN_MEMBERS')) canBan = true;
      if (r.permissions?.includes('MOVE_MEMBERS')) canMove = true;
      if (r.permissions?.includes('MUTE_MEMBERS')) canMute = true;
    });

    if (isOwner || currentUserHasAdmin) {
      canKick = true;
      canBan = true;
      canMove = true;
      canMute = true;
    }

    // Evaluate target user's highest order
    let targetUserHighestOrder = targetIsOwner ? 0 : Infinity;
    if (serverMember) {
      const targetRoles = serverRoles.filter(r => serverMember.roles?.includes(r.id));
      targetRoles.forEach(r => {
        if ((r.order || 999) < targetUserHighestOrder) targetUserHighestOrder = r.order || 999;
      });
    }

    // Hierarchical check: cannot kick/ban someone with a higher or equal rank (lower order)
    if (!isOwner && currentUserHighestOrder >= targetUserHighestOrder) {
      canKick = false;
      canBan = false;
    }

    // Never kick/ban owner
    if (targetIsOwner) {
      canKick = false;
      canBan = false;
    }
  }

  // Adjust position to keep menu within viewport
  const menuWidth = 200;
  const isSelf = userId === user?.id;
  const targetVoiceState = Object.values(voiceParticipants).flat().find(p => p.id === userId);
  const showAdminActions = serverId && !isSelf && (canKick || canBan || canMove || canMute);
  const menuHeight = showAdminActions ? 320 : 160;
  let x = position.x;
  let y = position.y;

  if (x + menuWidth > window.innerWidth) x -= menuWidth;
  if (y + menuHeight > window.innerHeight) y -= menuHeight;

  return createPortal(
    <div 
      ref={menuRef}
      className="fixed z-[9999] bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl py-1 w-[200px] animate-in fade-in zoom-in duration-100"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 border-b border-zinc-800 mb-1">
        <p className="text-xs font-bold text-zinc-500 uppercase truncate">{username}</p>
      </div>

      {onViewProfile && (
        <button 
          onClick={() => {
            onClose();
            onViewProfile();
          }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white transition-colors"
        >
          <UserIcon className="w-4 h-4" />
          {t('modals.userContextMenu.profile')}
        </button>
      )}

      {!isSelf && (
        <>
          <button 
            onClick={handleDM}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {t('modals.userContextMenu.message')}
          </button>

          <button 
            onClick={handleCall}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white transition-colors"
          >
            <Phone className="w-4 h-4" />
            {t('modals.userContextMenu.call')}
          </button>

          {dmId && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleMuteDm(dmId);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white transition-colors"
            >
              <PhoneOff className="w-4 h-4" />
              {mutedDms.includes(dmId) ? t('modals.userContextMenu.unmute') : t('modals.userContextMenu.mute')}
            </button>
          )}

          <button 
            onClick={handleFriendAction}
            disabled={isLoading}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : relationship?.status === 'accepted' ? (
              <>
                <UserMinus className="w-4 h-4" />
                {t('modals.userContextMenu.removeFriend')}
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                {t('modals.userContextMenu.addFriend')}
              </>
            )}
          </button>
        </>
      )}

      {showAdminActions && (
        <>
          <div className="h-px bg-zinc-800 my-1" />
          {targetVoiceState && canMute && (
            <button 
              onClick={handleMuteUser}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <MicOff className="w-4 h-4 text-orange-400" />
              {targetVoiceState.isMuted ? t('modals.userContextMenu.unmuteMember', 'Rendre la parole') : t('modals.userContextMenu.muteMember', 'Muer')}
            </button>
          )}
          {targetVoiceState && canMove && (
            <button 
              onClick={handleDisconnectVoice}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <PhoneOff className="w-4 h-4" />
              {t('modals.userContextMenu.disconnectVoice')}
            </button>
          )}
          {canKick && (
            <button 
              onClick={handleKick}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
            >
              <ShieldAlert className="w-4 h-4" />
              {t('modals.userContextMenu.kick')}
            </button>
          )}
          {canBan && (
            <button 
              onClick={handleBan}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
            >
              <UserX className="w-4 h-4" />
              {t('modals.userContextMenu.ban')}
            </button>
          )}
        </>
      )}
    </div>,
    document.body
  );
}
