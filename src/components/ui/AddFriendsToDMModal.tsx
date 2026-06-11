import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { X, Search } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { useTranslation } from 'react-i18next';
import socket from '../../lib/socket';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  dmId: string;
  currentParticipants: string[];
}

export default function AddFriendsToDMModal({ isOpen, onClose, dmId, currentParticipants }: Props) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const { setSelectedDmId } = useAppStore();
  const [friends, setFriends] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const fetchFriends = async () => {
      try {
        // Fetch accepted relationships
        const { data: snapshot, error } = await supabase.from('relationships')
          .select('*')
          .contains('participants', [currentUser.id])
          .eq('status', 'accepted');
        
        if (error) throw error;
        
        const friendIds = snapshot.map(rel => {
          return rel.participants.find((id: string) => id !== currentUser.id);
        }).filter(Boolean);

        // Filter out those already in the DM
        const availableFriendIds = friendIds.filter(id => currentParticipants ? !currentParticipants.includes(id) : true);

        if (availableFriendIds.length === 0) {
          setFriends([]);
          return;
        }

        // Fetch user profiles for these friends
        const { data: users, error: usersError } = await supabase.from('profiles')
          .select('*')
          .in('id', availableFriendIds);
        
        if (usersError) throw usersError;
        
        setFriends(users || []);
      } catch (error) {
        console.error("Error fetching friends:", error);
      }
    };

    fetchFriends();
    setSelectedUserIds(new Set());
    setSearchQuery('');
  }, [isOpen, currentParticipants, currentUser]);

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const handleAddFriends = async () => {
    if (selectedUserIds.size === 0 || !currentUser) return;
    setIsLoading(true);

    try {
      const newParticipantsList = Array.from(
        new Set([...(currentParticipants || []), ...Array.from(selectedUserIds)])
      ).sort();

      const isCurrentlyGroup = currentParticipants.length > 2;

      if (isCurrentlyGroup) {
        // ✅ Groupe existant → juste mettre à jour les participants
        const { error } = await supabase.from('dms')
          .update({ participants: newParticipantsList, updated_at: new Date().toISOString() })
          .eq('id', dmId);
        if (error) throw error;

        onClose();
      } else {
        // ✅ DM 1-on-1 → créer un nouveau groupe
        // D'abord vérifier s'il existe déjà exactement ce groupe
        const { data: allDms } = await supabase.from('dms')
          .select('*')
          .contains('participants', [currentUser.id]);

        const exactMatch = allDms?.find(dm =>
          dm.participants.length === newParticipantsList.length &&
          newParticipantsList.every((p: string) => dm.participants.includes(p))
        );

        if (exactMatch) {
          setSelectedDmId(exactMatch.id);
          onClose();
          return;
        }

        const { data: newDm, error } = await supabase.from('dms')
          .insert({ participants: newParticipantsList, type: 'group' })
          .select()
          .single();
        if (error) throw error;

        if (newDm) {
          setSelectedDmId(newDm.id);
        }
        onClose();
      }
    } catch (error) {
      console.error("Error adding friends to DM:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  const filteredFriends = friends.filter(f => 
    (f.username || f.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 w-full max-w-md rounded-lg shadow-xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-zinc-100">{t('friends.addFriendsModalTitle')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 shrink-0">
          <div className="relative">
            <input
              type="text"
              placeholder={t('friends.searchFriends')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 text-zinc-200 rounded-md py-2 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filteredFriends.length === 0 ? (
            <div className="text-center text-zinc-500 py-8">
              {friends.length === 0 ? t('friends.noMoreFriends') : t('friends.noFriendFound')}
            </div>
          ) : (
            filteredFriends.map(friend => (
              <div 
                key={friend.id}
                onClick={() => toggleUserSelection(friend.id)}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800 cursor-pointer"
              >
                <div className="relative flex items-center justify-center w-5 h-5 border rounded border-zinc-600 shrink-0">
                  {selectedUserIds.has(friend.id) && (
                    <div className="w-3 h-3 bg-indigo-500 rounded-sm" />
                  )}
                </div>
                <UserAvatar user={{ username: friend.username || friend.display_name, avatar_url: friend.avatar_url, status: friend.status }} size="md" />
                <span className="text-zinc-200 font-medium">{friend.username || friend.display_name}</span>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={handleAddFriends}
            disabled={selectedUserIds.size === 0 || isLoading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium py-2 rounded transition-colors"
          >
            {isLoading ? t('friends.adding') : `${t('friends.add')} ${selectedUserIds.size > 0 ? `(${selectedUserIds.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
