import React, { useState, useEffect } from 'react';
import { X, MessageSquare, UserPlus, Check, Clock, UserMinus, Phone } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import UserAvatar from './UserAvatar';
import StatusContent from '../StatusContent';
import socket from '../../lib/socket';
import { useTranslation } from 'react-i18next';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

export default function UserProfileModal({ isOpen, onClose, user }: UserProfileModalProps) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const { setSelectedServerId, setSelectedDmId } = useAppStore();
  const [isCreatingDM, setIsCreatingDM] = useState(false);
  const [relationship, setRelationship] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !user || !currentUser || user.id === currentUser.id) return;

    const fetchRelationship = async () => {
      const { data: rels } = await supabase.from('relationships')
        .select('*')
        .contains('participants', [currentUser.id]);
      
      const rel = rels?.find(r => r.participants.includes(user.id));
      setRelationship(rel || null);
    };

    fetchRelationship();

    const chanName = `profile_rel_${user.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${chanName}`) supabase.removeChannel(c);
    });
    const channel = supabase.channel(chanName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, (payload) => {
        const rel = payload.new as any || payload.old as any;
        if (rel && rel.participants && rel.participants.includes(currentUser.id)) {
          fetchRelationship();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, user, currentUser]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const handleSendMessage = async () => {
    if (!currentUser || isCreatingDM) return;
    setIsCreatingDM(true);
    try {
      const { data: dmsData } = await supabase.from('dms').select('*').contains('participants', [currentUser.id]);
      
      let existingDmId = null;
      if (dmsData) {
        for (const dm of dmsData) {
          if (dm.participants && dm.participants.includes(user.id) && dm.participants.length === 2) {
            existingDmId = dm.id;
            break;
          }
        }
      }

      if (existingDmId) {
        setSelectedServerId(null);
        setSelectedDmId(existingDmId);
      } else {
        const { data: newDm, error } = await supabase.from('dms').insert({
          participants: [currentUser.id, user.id]
        }).select().single();
        
        if (error) throw error;
        setSelectedServerId(null);
        setSelectedDmId(newDm.id);
      }
      onClose();
    } catch (error) {
      console.error("Error creating DM:", error);
    } finally {
      setIsCreatingDM(false);
    }
  };



  const handleAddFriend = async () => {
    if (!currentUser) return;
    try {
      await supabase.from('relationships').insert({
        participants: [currentUser.id, user.id],
        status: 'pending',
        requester_id: currentUser.id
      });
    } catch (error) {
      console.error("Error adding friend:", error);
    }
  };

  const handleAcceptFriend = async () => {
    if (!relationship) return;
    try {
      await supabase.from('relationships').update({
        status: 'accepted',
        updated_at: new Date().toISOString()
      }).eq('id', relationship.id);
    } catch (error) {
      console.error("Error accepting friend:", error);
    }
  };

  const handleRemoveFriend = async () => {
    if (!relationship) return;
    try {
      await supabase.from('relationships').delete().eq('id', relationship.id);
    } catch (error) {
      console.error("Error removing friend:", error);
    }
  };

  const renderFriendButton = () => {
    if (!relationship) {
      return (
        <button 
          onClick={handleAddFriend}
          className="w-full flex items-center gap-3 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          {t('modals.userProfile.addFriend')}
        </button>
      );
    }

    if (relationship.status === 'pending') {
      if (relationship.requester_id === currentUser?.id) {
        return (
          <button 
            disabled
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-700 text-zinc-400 rounded-md font-medium cursor-not-allowed"
          >
            <Clock className="w-5 h-5" />
            {t('modals.userProfile.requestSent')}
          </button>
        );
      } else {
        return (
          <div className="flex gap-2">
            <button 
              onClick={handleAcceptFriend}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-md transition-colors font-medium"
            >
              <Check className="w-5 h-5" />
              {t('modals.userProfile.accept')}
            </button>
            <button 
              onClick={handleRemoveFriend}
              className="flex-1 flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white py-2.5 rounded-md transition-colors font-medium"
            >
              <X className="w-5 h-5" />
              {t('modals.userProfile.ignore')}
            </button>
          </div>
        );
      }
    }

    if (relationship.status === 'accepted') {
      return (
        <button 
          onClick={handleRemoveFriend}
          className="w-full flex items-center gap-3 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-md font-medium transition-colors"
        >
          <UserMinus className="w-5 h-5" />
          {t('modals.userProfile.removeFriend')}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg shadow-xl w-full max-w-sm overflow-hidden border border-zinc-800">
        <div className="h-24 bg-indigo-600 relative">
          <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-1 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-4 pb-4 relative">
          <div className="absolute -top-12 left-4 p-1.5 bg-zinc-900 rounded-full">
            <UserAvatar user={user} size="xl" showStatus={false} />
          </div>
          
          <div className="pt-14 pb-4">
            <h2 className="text-xl font-bold text-zinc-100" style={{ color: user.color || '#f4f4f5' }}>
              {user.username || user.displayName || 'User'}
            </h2>
            {user.custom_status && (
              <div className="mt-2 text-[15px] text-zinc-300">
                <StatusContent content={user.custom_status} />
              </div>
            )}
            {user.bio && (
              <div className="mt-4">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  {t('modals.userSettings.aboutMe')}
                </div>
                <div className="text-sm text-zinc-300 bg-zinc-800/50 p-2 rounded border border-zinc-700/50 italic whitespace-pre-wrap break-words">
                  {user.bio}
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            {currentUser?.id !== user.id && (
              <>
                <button 
                  onClick={handleSendMessage}
                  disabled={isCreatingDM}
                  className="w-full flex items-center gap-3 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                >
                  <MessageSquare className="w-5 h-5" />
                  {isCreatingDM ? t('modals.userProfile.calling') : t('modals.userProfile.sendMessage')}
                </button>

                {renderFriendButton()}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
