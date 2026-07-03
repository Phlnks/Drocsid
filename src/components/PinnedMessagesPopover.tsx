import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Pin, X, MessageSquare, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import UserAvatar from './ui/UserAvatar';
import { useTranslation } from 'react-i18next';

interface PinnedMessagesPopoverProps {
  channelId: string;
  isDM?: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  usersMap: Record<string, any>;
}

export default function PinnedMessagesPopover({ channelId, isDM = false, onClose, onJumpToMessage, usersMap }: PinnedMessagesPopoverProps) {
  const { t } = useTranslation();
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const tableName = isDM ? 'dm_messages' : 'messages';
    const idColumn = isDM ? 'dm_id' : 'channel_id';

    const fetchPins = async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq(idColumn, channelId)
        .eq('is_pinned', true)
        .order('created_at', { ascending: false });

      if (data) setPinnedMessages(data);
      setIsLoading(false);
    };

    fetchPins();

    // Subscribe to changes
    const channelName = `pins_${channelId}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    });
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: tableName,
        filter: `${idColumn}=eq.${channelId}`
      }, () => {
        fetchPins();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, isDM]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="absolute right-0 top-12 w-80 max-h-[480px] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 flex flex-col"
    >
      <div className="p-3 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2 text-zinc-100 font-semibold">
          <Pin className="w-4 h-4 text-indigo-400" />
          <span>{t("settings.pinnedMessages", "Messages épinglés")}</span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : pinnedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 px-4 text-center">
            <div className="w-12 h-12 bg-zinc-700/50 rounded-full flex items-center justify-center mb-3">
              <Pin className="w-6 h-6 opacity-20" />
            </div>
            <p className="text-sm">{t("chatArea.noPinnedMessages", "Aucun message épinglé dans ce salon.")}</p>
          </div>
        ) : (
          pinnedMessages.map(msg => {
            const u = usersMap[msg.author_id];
            const userData = {
              username: u?.username || msg.author_name || 'Utilisateur',
              avatarUrl: u?.avatar_url || msg.author_avatar || '',
              status: u?.status || 'offline'
            };
            return (
              <div 
                key={msg.id}
                className="p-3 bg-zinc-900/50 border border-zinc-700/30 rounded-md hover:bg-zinc-700/30 transition-colors group relative cursor-pointer"
                onClick={() => onJumpToMessage(msg.id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <UserAvatar user={userData} size="xs" showStatus={false} />
                  <span className="font-medium text-sm text-zinc-100">{userData.username}</span>
                  <span className="text-[10px] text-zinc-500">{format(new Date(msg.created_at), 'dd/MM/yyyy')}</span>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-3 break-words">
                  {msg.content}
                </p>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 text-[10px] text-indigo-400 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    Contient des médias
                  </div>
                )}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3 h-3 text-zinc-400" />
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {pinnedMessages.length > 0 && (
        <div className="p-2 border-t border-zinc-700 text-[10px] text-zinc-500 text-center">
          Cliquez sur un message pour y accéder
        </div>
      )}
    </motion.div>
  );
}
