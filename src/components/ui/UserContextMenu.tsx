import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Phone, UserPlus, UserMinus, ShieldAlert, UserX, Loader2, PhoneOff, User as UserIcon, AtSign, MicOff, Volume2, Volume1, VolumeX, Edit2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { useInstanceStore } from '../../store/instanceStore';
import socket from '../../lib/socket';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import PromptModal from './PromptModal';

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
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuthStore();
  const { setSelectedDmId, setSelectedServerId, setConnectedVoiceChannelId, setIsMobileNavOpen, mutedDms, toggleMuteDm, voiceParticipants, peerVolumes, setPeerVolume } = useAppStore();
  const { getCurrentInstance } = useInstanceStore();

  const [localVolume, setLocalVolume] = useState<number>(peerVolumes[userId] ?? 1.0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleVolumeChange = (newVal: number) => {
    setLocalVolume(newVal);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setPeerVolume(userId, newVal);
    }, 100);
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const relPromise = supabase.from('relationships').select('*').contains('participants', [user.id]);
        
        let memPromise, curMemPromise, rolesPromise, servPromise;
        if (serverId) {
          memPromise = supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', userId).maybeSingle();
          curMemPromise = supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', user.id).maybeSingle();
          rolesPromise = supabase.from('roles').select('*').eq('server_id', serverId);
          servPromise = supabase.from('servers').select('*').eq('id', serverId).maybeSingle();
        }

        const { data: relData } = await relPromise;
        const rel = relData?.find((r: any) => r.participants.includes(userId));
        setRelationship(rel || null);

        if (serverId) {
          const { data: memData } = await memPromise;
          const { data: currentMemData } = await curMemPromise;
          const { data: rolesData } = await rolesPromise;
          const { data: servData } = await servPromise;

          if (memData) setServerMember(memData);
          if (currentMemData) setCurrentUserMember(currentMemData);
          if (rolesData) setServerRoles(rolesData);
          if (servData) setServerInfo(servData);
        }
      } catch (err) {
        console.error("Error fetching context menu data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId, serverId, user?.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showUsernamePrompt) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, showUsernamePrompt]);


  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

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
      // Also force disconnect from voice specifically
      socket.emit('move-user', { userId, channelId: null });
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

  const handleUpdateUsername = async (newUsername: string) => {
    if (!serverId || !userId || !newUsername) return;
    setIsUpdatingUsername(true);
    try {
      let baseUrl = getCurrentInstance()?.socketUrl || window.location.origin;
      if (baseUrl.includes('file://') || baseUrl.includes('drocsid://')) {
        baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
      }
      baseUrl = baseUrl.replace(/\/+$/, '');

      const response = await fetch(`${baseUrl}/api/server/update-member-username`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          serverId,
          targetUserId: userId,
          newUsername
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update username');
      }

      // Update local store to reflect changes immediately
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (updatedProfile) {
        useAppStore.getState().setGlobalProfile(updatedProfile);
      }

      addNotification(t('common.savedSuccessfully'), 'success');
      onClose();
    } catch (error: any) {
      console.error("Error updating username:", error);
      addNotification(error.message, 'error');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  let isOwner = false;
  let canBan = false;
  let canMove = false;
  let canMute = false;
  let canChangeUsername = false;

  if (serverInfo && currentUserMember) {
    isOwner = serverInfo.owner_id === user?.id;
    const targetIsOwner = serverInfo.owner_id === userId;
    
    // Determine highest order for current user (lower number = higher hierarchical priority)
    let currentUserHighestOrder = isOwner ? 0 : Infinity;
    let currentUserHasAdmin = false;
    let currentUserHasMod = false;
    
    const currUserRoles = serverRoles.filter(r => currentUserMember.roles?.includes(r.id));
    currUserRoles.forEach(r => {
      if ((r.order ?? 999) < currentUserHighestOrder) currentUserHighestOrder = r.order ?? 999;
      if (r.permissions?.includes('ADMINISTRATOR')) {
        currentUserHasAdmin = true;
        currentUserHasMod = true;
      }
      if (r.permissions?.includes('KICK_MEMBERS')) {
        currentUserHasMod = true;
      }
      if (r.permissions?.includes('BAN_MEMBERS')) {
        canBan = true;
        currentUserHasMod = true;
      }
      if (r.permissions?.includes('MOVE_MEMBERS')) canMove = true;
      if (r.permissions?.includes('MUTE_MEMBERS')) canMute = true;
    });

    if (isOwner || currentUserHasAdmin) {
      canBan = true;
      canMove = true;
      canMute = true;
      canChangeUsername = true;
    }

    if (currentUserHasMod) {
      canChangeUsername = true;
    }

    // Evaluate target user's highest order
    let targetUserHighestOrder = targetIsOwner ? 0 : Infinity;
    if (serverMember) {
      const targetRoles = serverRoles.filter(r => serverMember.roles?.includes(r.id));
      targetRoles.forEach(r => {
        if ((r.order ?? 999) < targetUserHighestOrder) targetUserHighestOrder = r.order ?? 999;
      });
    }

    // Hierarchical check: cannot ban/change someone with a higher or equal rank (lower order)
    if (!isOwner && currentUserHighestOrder >= targetUserHighestOrder) {
      canBan = false;
      canChangeUsername = false;
    }

    // Never ban/change owner
    if (targetIsOwner) {
      canBan = false;
      canChangeUsername = false;
    }
  }

  // Adjust position to keep menu within viewport
  const menuWidth = 200;
  const isSelf = userId === user?.id;
  const targetVoiceState = Object.values(voiceParticipants).flat().find(p => p.id === userId);
  const { addNotification } = useAppStore();
  const showAdminActions = serverId && !isSelf && (canBan || canMove || canMute || canChangeUsername);
  let menuHeight = 160;
  if (onViewProfile) menuHeight += 40;
  if (showAdminActions) menuHeight += 160;
  if (targetVoiceState) menuHeight += 60;
  
  let x = position.x;
  let y = position.y;

  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
  
  // Ensure the menu doesn't go off the top or left of the screen
  x = Math.max(10, x);
  y = Math.max(10, y);

  return createPortal(
    <>
      <div 
        ref={menuRef}
        className={clsx(
          "fixed z-[9999] bg-zinc-950 border border-zinc-800 rounded-md shadow-2xl py-1 w-[200px] animate-in fade-in zoom-in duration-100",
          showUsernamePrompt && "opacity-0 pointer-events-none"
        )}
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

            {targetVoiceState && (
              <>
                <div className="h-px bg-zinc-800 my-1" />
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {localVolume === 0 ? (
                        <VolumeX className="w-4 h-4 text-zinc-500" />
                      ) : localVolume < 0.5 ? (
                        <Volume1 className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-zinc-300" />
                      )}
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('modals.userContextMenu.userVolume', 'Volume utilisateur')}</span>
                    </div>
                    <span className="text-[10px] font-bold text-zinc-500">{Math.round(localVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="1.0"
                    step="0.01"
                    value={localVolume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </>
            )}
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
                {targetVoiceState.isMuted ? t('modals.userContextMenu.unmuteMember', 'Rendre la parole') : t('modals.userContextMenu.muteMember', 'Rendre muet')}
              </button>
            )}
            {targetVoiceState && canMove && (
              <button 
                onClick={handleDisconnectVoice}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
              >
                <PhoneOff className="w-4 h-4 text-red-400" />
                {t('modals.userContextMenu.disconnectVoice', 'Déconnecter du vocal')}
              </button>
            )}
            {canChangeUsername && (
              <button 
                onClick={() => setShowUsernamePrompt(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                {t('modals.userContextMenu.changeUsername', 'Modifier le username')}
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
      </div>

      <PromptModal
        isOpen={showUsernamePrompt}
        onClose={() => setShowUsernamePrompt(false)}
        onSubmit={handleUpdateUsername}
        title={t('modals.userContextMenu.changeUsername', 'Modifier le username')}
        description={t('modals.userContextMenu.changeUsernameDesc', 'Entrez le nouveau username pour cet utilisateur.')}
        inputLabel={t('modals.userContextMenu.newUsername', 'Nouveau username')}
        placeholder={username}
        submitText={isUpdatingUsername ? t('common.saving') : t('common.save')}
      />
    </>,
    document.body
  );
}
