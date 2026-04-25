import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAppStore } from '../store/appStore';
import { MicOff, MonitorUp } from 'lucide-react';
import clsx from 'clsx';
import UserContextMenu from './ui/UserContextMenu';
import UserProfileModal from './ui/UserProfileModal';

interface VoiceParticipantsProps {
  channelId?: string;
}

export default function VoiceParticipants({ channelId }: VoiceParticipantsProps) {
  const { 
    selectedChannelId, 
    connectedVoiceChannelId, 
    speakingUsers, 
    remoteScreenShares, 
    viewingScreenShares, 
    setViewingScreenShares,
    activeStreamFocus,
    setActiveStreamFocus,
    setIsMobileNavOpen,
    voiceParticipants: allVoiceParticipants
  } = useAppStore();
  const activeChannelId = channelId || selectedChannelId;
  const participants = allVoiceParticipants[activeChannelId || ''] || [];
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number } | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const toggleViewScreenShare = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    
    if (window.innerWidth < 768) {
      if (activeStreamFocus === uid) {
        setActiveStreamFocus(null);
        setViewingScreenShares(prev => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
      } else {
        setActiveStreamFocus(uid);
        setViewingScreenShares(prev => {
          const next = new Set(prev);
          next.add(uid);
          return next;
        });
        setIsMobileNavOpen(false);
      }
    } else {
      setViewingScreenShares(prev => {
        const next = new Set(prev);
        if (next.has(uid)) next.delete(uid);
        else next.add(uid);
        return next;
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, p: any) => {
    e.preventDefault();
    setContextMenu({
      userId: p.id,
      username: p.name,
      x: e.clientX,
      y: e.clientY
    });
  };

  if (participants.length === 0) return null;

  return (
    <div className="bg-zinc-900 border-b border-zinc-700 p-4 shrink-0 flex flex-wrap gap-4">
      {participants.map(p => {
        const isSpeaking = speakingUsers[p.id];
        const isSharingScreen = !!remoteScreenShares[p.id];
        const isViewing = viewingScreenShares.has(p.id);

        return (
          <div 
            key={p.id} 
            className="relative flex flex-col items-center gap-2 group cursor-pointer"
            onClick={() => setSelectedUser(p)}
            onContextMenu={(e) => handleContextMenu(e, p)}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl overflow-hidden transition-all duration-200 bg-indigo-500 ${
              isSpeaking ? 'ring-4 speaking-ring' : 'ring-2 ring-transparent'
            }`}>
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                p.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
            <span className="text-xs font-medium text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-full">
              {p.name}
            </span>
            <div className="absolute -top-2 -right-2 flex gap-1">
              {p.isMuted && (
                <div className="bg-zinc-800 rounded-full p-1 border border-zinc-900">
                  <MicOff className="w-3 h-3 text-red-500" />
                </div>
              )}
              {(p.isStreaming || isSharingScreen) && (
                <button 
                  onClick={(e) => toggleViewScreenShare(e, p.id)}
                  className={clsx(
                    "rounded-full p-1.5 border border-zinc-900 transition-colors shadow-lg",
                    isViewing ? "bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                  )}
                  title={isViewing ? "Fermer le stream" : "Regarder le stream"}
                >
                  <MonitorUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          serverId={useAppStore.getState().selectedServerId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onViewProfile={() => {
            const p = participants.find(part => part.id === contextMenu.userId);
            if (p) setSelectedUser(p);
          }}
        />
      )}

      <UserProfileModal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        user={selectedUser}
      />
    </div>
  );
}
