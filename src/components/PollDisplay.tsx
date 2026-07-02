import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { PieChart, CheckCircle2, Pencil, Settings, Trash2 } from 'lucide-react';
import PollModal from './PollModal';
import socket from '../lib/socket';
import { useTranslation } from 'react-i18next';

interface PollDisplayProps {
  messageId: string;
  pollData: {
    question: string;
    options: string[];
    multipleChoices?: boolean;
    anonymous?: boolean;
    votes?: Record<string, number | number[]>; // userId -> index or indices
  };
  isDM?: boolean;
  isAuthor?: boolean;
}

export default function PollDisplay({ messageId, pollData: initialPollData, isDM = false, isAuthor = false }: PollDisplayProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  
  // Safety check for initialPollData
  const safeInitialData = initialPollData || { question: '', options: [], votes: {} };
  
  const [pollData, setPollData] = useState(safeInitialData);
  const [votes, setVotes] = useState<Record<string, number | number[]>>(safeInitialData.votes || {});
  const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  const toggleDetails = (index: number) => {
    if (pollData?.anonymous) return;
    setShowDetails(prev => ({ ...prev, [index]: !prev[index] }));
  };

  useEffect(() => {
    if (initialPollData) {
      setPollData(initialPollData);
      setVotes(initialPollData.votes || {});
    }
  }, [initialPollData]);

  // Pre-load current user profile
  useEffect(() => {
    if (user && !profiles[user.id]) {
      setProfiles(prev => ({
        ...prev,
        [user.id]: {
          id: user.id,
          username: user.user_metadata?.username || user.user_metadata?.full_name || 'Utilisateur',
          avatar_url: user.user_metadata?.avatar_url
        }
      }));
    }
  }, [user]);

  useEffect(() => {
    if (pollData && !pollData.anonymous && votes) {
      const userIds = Object.keys(votes).filter(uid => !profiles[uid]);
      if (userIds.length > 0) {
        const fetchProfiles = async () => {
          const { data } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds);
          if (data) {
            const pMap = data.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
            setProfiles(prev => ({ ...prev, ...pMap }));
          }
        };
        fetchProfiles();
      }
    }
  }, [votes, pollData?.anonymous]);

  const totalParticipants = votes ? Object.keys(votes).length : 0;

  const handleToggleVote = async (optionIndex: number) => {
    if (!user || !pollData) return;

    let newUserVote: number | number[];
    const currentVote = votes ? votes[user.id] : undefined;

    if (pollData.multipleChoices) {
      const currentIndices = Array.isArray(currentVote) ? currentVote : (currentVote !== undefined ? [currentVote] : []);
      if (currentIndices.includes(optionIndex)) {
        newUserVote = currentIndices.filter(i => i !== optionIndex);
      } else {
        newUserVote = [...currentIndices, optionIndex];
      }
    } else {
      if (currentVote === optionIndex) {
        newUserVote = [] as any;
      } else {
        newUserVote = optionIndex;
      }
    }

    const newVotes = { ...(votes || {}), [user.id]: newUserVote };
    if (Array.isArray(newUserVote) && newUserVote.length === 0) {
      delete newVotes[user.id];
    }

    // Optimistic UI update
    setVotes(newVotes);
    setPollData(prev => ({ ...prev, votes: newVotes }));

    try {
      const tableName = isDM ? 'dm_messages' : 'messages';
      const { data: latestMsg } = await supabase.from(tableName).select('*').eq('id', messageId).single();
      
      if (latestMsg && latestMsg.attachments) {
        const updatedAttachments = latestMsg.attachments.map((att: any) => {
          if (att.type === 'poll') {
            const currentVotes = att.data.votes || {};
            const finalVotes = { ...currentVotes, [user.id]: newUserVote };
            if (Array.isArray(newUserVote) && newUserVote.length === 0) {
              delete finalVotes[user.id];
            }
            return {
              ...att,
              data: { ...att.data, votes: finalVotes }
            };
          }
          return att;
        });
        
        const { data: updatedMsg } = await supabase.from(tableName).update({ attachments: updatedAttachments }).eq('id', messageId).select().single();
        
        if (updatedMsg) {
          socket.emit(isDM ? 'dm-message-updated' : 'message-updated', updatedMsg);
        }
      }
    } catch (err) {
      console.error("Error voting:", err);
      setVotes(initialPollData?.votes || {});
      setPollData(prev => ({ ...prev, votes: initialPollData?.votes || {} }));
    }
  };

  const isSelected = (index: number) => {
    if (!votes || !user) return false;
    const userVote = votes[user.id || ''];
    if (userVote === undefined) return false;
    if (Array.isArray(userVote)) return userVote.includes(index);
    return userVote === index;
  };

  const getOptionStats = (index: number) => {
    if (!votes) return { count: 0, percentage: 0, votersForThis: [] };
    const votersForThis = Object.entries(votes)
      .filter(([_, v]) => Array.isArray(v) ? v.includes(index) : v === index)
      .map(([uid, _]) => uid);
    
    const count = votersForThis.length;
    const percentage = totalParticipants > 0 ? Math.round((count / totalParticipants) * 100) : 0;
    return { count, percentage, votersForThis };
  };

  const handleUpdatePoll = async (newPollData: any) => {
    const { resetVotes, ...cleanPollData } = newPollData;
    const optimisticPollData = {
      ...pollData,
      ...cleanPollData,
      votes: resetVotes ? {} : pollData.votes
    };

    setPollData(optimisticPollData);
    setVotes(optimisticPollData.votes || {});
    setIsEditing(false);

    try {
      const tableName = isDM ? 'dm_messages' : 'messages';
      const { data: latestMsg } = await supabase.from(tableName).select('*').eq('id', messageId).single();
      
      if (latestMsg && latestMsg.attachments) {
        const updatedAttachments = latestMsg.attachments.map((att: any) => {
          if (att.type === 'poll') {
            return {
              ...att,
              data: {
                ...att.data,
                ...cleanPollData,
                votes: resetVotes ? {} : att.data.votes
              }
            };
          }
          return att;
        });
        
        const { data: updatedMsg } = await supabase.from(tableName).update({ attachments: updatedAttachments }).eq('id', messageId).select().single();
        
        if (updatedMsg) {
          socket.emit(isDM ? 'dm-message-updated' : 'message-updated', updatedMsg);
        }
      }
    } catch (err) {
      console.error("Error updating poll:", err);
      setPollData(initialPollData);
      setVotes(initialPollData.votes || {});
    }
  };


  return (
    <>
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-lg p-4 mt-2 max-w-sm shadow-sm transition-all hover:border-zinc-700 group/poll relative">
      {isAuthor && (
        <div className="absolute top-2 right-2 opacity-0 group-hover/poll:opacity-100 transition-opacity flex gap-1">
          <button 
            onClick={() => setIsEditing(true)}
            className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200"
            title={t('chatArea.editMessage')}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex flex-col gap-1 mb-3">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-indigo-400" />
          <h3 className="font-semibold text-zinc-100 text-sm">{pollData.question}</h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-medium uppercase tracking-wider px-6">
          <span>{pollData.multipleChoices ? t('polls.multipleChoice') : t('polls.singleChoice')}</span>
          <span>•</span>
          <span>{pollData.anonymous ? t('polls.anonymous') : t('polls.public')}</span>
        </div>
      </div>
      
      <div className="space-y-2">
        {pollData.options.map((option, index) => {
          const { count, percentage, votersForThis } = getOptionStats(index);
          const selected = isSelected(index);
          
          return (
            <div key={index} className="space-y-1">
              <button
                onClick={() => handleToggleVote(index)}
                className={`w-full relative overflow-hidden rounded-md group transition-all hover:bg-zinc-800`}
              >
                {totalParticipants > 0 && (
                  <div 
                    className={`absolute inset-0 opacity-20 transition-all duration-500 ease-out ${selected ? 'bg-indigo-500' : 'bg-zinc-600'}`}
                    style={{ width: `${percentage}%` }}
                  />
                )}
                
                <div className={`relative z-10 p-2.5 flex items-center justify-between border ${
                  selected ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-zinc-800'
                } rounded-md transition-colors`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-sm truncate ${selected ? 'text-indigo-300 font-medium' : 'text-zinc-300'}`}>
                      {option}
                    </span>
                    {selected && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                  </div>
                  {totalParticipants > 0 && (
                    <span className="text-[10px] font-bold text-zinc-500 ml-2 shrink-0">
                      {count} ({percentage}%)
                    </span>
                  )}
                </div>
              </button>
              
              {!pollData.anonymous && votersForThis.length > 0 && (
                <div className="space-y-1">
                  <button 
                    onClick={() => toggleDetails(index)}
                    className="flex flex-wrap gap-1 px-1 items-center hover:bg-zinc-800/50 rounded-md py-0.5 transition-colors"
                  >
                    {votersForThis.slice(0, 5).map(uid => (
                      <div 
                        key={uid} 
                        className="w-4 h-4 rounded-full overflow-hidden border border-zinc-950 shadow-sm"
                        title={profiles[uid]?.username || t('common.loading')}
                      >
                        <img 
                          src={profiles[uid]?.avatar_url === 'SAVED_MESSAGES_ICON' ? '' : (profiles[uid]?.avatar_url || 'https://www.gravatar.com/avatar/?d=mp')} 
                          className="w-full h-full object-cover"
                          alt="Avatar"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                    {votersForThis.length > 5 && (
                      <span className="text-[10px] text-zinc-500 flex items-center ml-1 font-medium">
                        +{votersForThis.length - 5}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500 ml-1 hover:text-zinc-300">
                      {showDetails[index] ? t('common.close') : t('polls.viewVoters')}
                    </span>
                  </button>

                  {showDetails[index] && (
                    <div className="bg-zinc-950/50 rounded p-2 border border-zinc-800/50 mt-1 max-h-32 overflow-y-auto custom-scrollbar">
                      {votersForThis.map(uid => (
                        <div key={uid} className="flex items-center gap-2 py-0.5">
                           <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-zinc-800">
                            {profiles[uid]?.avatar_url === 'SAVED_MESSAGES_ICON' ? (
                              <div className="w-full h-full bg-indigo-500 flex items-center justify-center"><PieChart className="w-2 h-2" /></div>
                            ) : (
                              <img 
                                src={profiles[uid]?.avatar_url || 'https://www.gravatar.com/avatar/?d=mp'} 
                                className="w-full h-full object-cover"
                                alt=""
                              />
                            )}
                           </div>
                           <span className="text-[10px] text-zinc-400 font-medium truncate">
                            {profiles[uid]?.username || uid.substring(0, 8)}
                           </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-col gap-2 px-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
            {totalParticipants === 1 ? t('polls.participantCount', { count: 1 }) : t('polls.participantsCount', { count: totalParticipants })}
          </span>
          {Object.keys(votes).length > 0 && (
            <span className="text-[10px] text-zinc-600 italic">
              {t('polls.modifyVote')}
            </span>
          )}
        </div>
      </div>
    </div>

    <PollModal 
      isOpen={isEditing}
      onClose={() => setIsEditing(false)}
      onSubmit={handleUpdatePoll}
      initialData={pollData}
    />
  </>
);
}
