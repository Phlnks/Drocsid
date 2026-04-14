import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Phone, UserPlus, UserMinus, ShieldAlert, UserX, Loader2, PhoneOff } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import socket from '../../lib/socket';

interface UserContextMenuProps {
  userId: string;
  username: string;
  serverId?: string | null;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function UserContextMenu({ userId, username, serverId, position, onClose }: UserContextMenuProps) {
  const [relationship, setRelationship] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverMember, setServerMember] = useState<any>(null);
  const [currentUserMember, setCurrentUserMember] = useState<any>(null);
  const [userVoiceState, setUserVoiceState] = useState<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuthStore();
  const { setSelectedDmId, setSelectedServerId, setConnectedVoiceChannelId, setIsMobileNavOpen } = useAppStore();

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      // Fetch relationship
      const { data: relData } = await supabase.from('relationships').select('*').contains('participants', [user.id]);
      const rel = relData?.find(r => r.participants.includes(userId));
      setRelationship(rel || null);
      setIsLoading(false);

      // Fetch server member info if in server context
      if (serverId) {
        const { data: memberData } = await supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', userId).maybeSingle();
        if (memberData) setServerMember(memberData);

        const { data: currentMemberData } = await supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', user.id).maybeSingle();
        if (currentMemberData) setCurrentUserMember(currentMemberData);
      }

      // Check if user is in any voice channel
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (profileData) {
        setUserVoiceState(profileData.force_voice_move || null);
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
    if (!window.confirm(`Voulez-vous vraiment exclure ${username} ?`)) return;
    onClose();

    try {
      await supabase.from('server_members').delete().eq('server_id', serverId).eq('user_id', userId);
      // Force disconnect from voice if they are in one
      await supabase.from('profiles').update({
        force_voice_move: {
          channelId: null,
          timestamp: Date.now()
        }
      }).eq('id', userId);
    } catch (error) {
      console.error("Error kicking user:", error);
    }
  };

  const handleBan = async () => {
    if (!serverId || !userId) return;
    if (!window.confirm(`Voulez-vous vraiment bannir ${username} ?`)) return;
    onClose();

    try {
      await supabase.from('server_bans').insert({
        server_id: serverId,
        user_id: userId,
        banned_by: user?.id
      });
      await supabase.from('server_members').delete().eq('server_id', serverId).eq('user_id', userId);
      // Force disconnect from voice
      await supabase.from('profiles').update({
        force_voice_move: {
          channelId: null,
          timestamp: Date.now()
        }
      }).eq('id', userId);
    } catch (error) {
      console.error("Error banning user:", error);
    }
  };

  const handleDisconnectVoice = async () => {
    if (!userId) return;
    onClose();

    try {
      await supabase.from('profiles').update({
        force_voice_move: {
          channelId: null,
          timestamp: Date.now()
        }
      }).eq('id', userId);
    } catch (error) {
      console.error("Error disconnecting user from voice:", error);
    }
  };

  const canManage = currentUserMember?.roles?.includes('owner') || 
                   currentUserMember?.roles?.some((roleId: string) => {
                     // This is simplified, ideally we'd check permissions of each role
                     return roleId === 'admin'; 
                   });

  // Adjust position to keep menu within viewport
  const menuWidth = 200;
  const menuHeight = serverId && canManage ? 280 : 160;
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

      <button 
        onClick={handleDM}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white transition-colors"
      >
        <MessageSquare className="w-4 h-4" />
        Message privé
      </button>

      <button 
        onClick={handleCall}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-indigo-500 hover:text-white transition-colors"
      >
        <Phone className="w-4 h-4" />
        Appeler
      </button>

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
            Retirer des amis
          </>
        ) : (
          <>
            <UserPlus className="w-4 h-4" />
            Ajouter en ami
          </>
        )}
      </button>

      {serverId && canManage && userId !== user?.id && (
        <>
          <div className="h-px bg-zinc-800 my-1" />
          {userVoiceState && (
            <button 
              onClick={handleDisconnectVoice}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <PhoneOff className="w-4 h-4" />
              Déconnecter du vocal
            </button>
          )}
          <button 
            onClick={handleKick}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            Exclure
          </button>
          <button 
            onClick={handleBan}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors"
          >
            <UserX className="w-4 h-4" />
            Bannir
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
