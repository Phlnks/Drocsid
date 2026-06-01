import { useState } from 'react';
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
    remoteScreenShares,
    viewingScreenShares,
    setViewingScreenShares,
    activeStreamFocus,
    setActiveStreamFocus,
    setIsMobileNavOpen,
    voiceParticipants: allVoiceParticipants,
    globalProfiles
  } = useAppStore();

  const activeChannelId = channelId || selectedChannelId;
  const participants = allVoiceParticipants[activeChannelId || ''] || [];
  const [contextMenu, setContextMenu] = useState<{ userId: string, username: string, x: number, y: number } | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const isConnectedToThisChannel =
    !!connectedVoiceChannelId &&
    !!activeChannelId &&
    connectedVoiceChannelId === activeChannelId;

  const toggleViewScreenShare = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();

    if (!isConnectedToThisChannel) return;
    if (!remoteScreenShares[uid]) return;

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
        if (next.has(uid)) {
          next.delete(uid);
        } else {
          next.add(uid);
          useAppStore.getState().setIsRightSidebarOpen(false);
        }
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
    <div className="bg-zinc-900 border-b border-zinc-700 p-3 shrink-0 flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-y-auto md:overflow-x-visible gap-3 max-h-32 md:max-h-none custom-scrollbar">
      {participants.map(p => {
        const hasLiveStream = !!remoteScreenShares[p.id];
        const isViewing = viewingScreenShares.has(p.id);
        const userProfile = globalProfiles[p.id];
        const displayName = userProfile?.username || p.name;
        const displayAvatar = userProfile?.avatar_url || p.avatarUrl;
        const canClickStream = isConnectedToThisChannel && hasLiveStream;

        return (
          <div
            key={p.id}
            className="relative flex flex-col items-center gap-2 group cursor-pointer"
            onClick={() => setSelectedUser(userProfile || p)}
            onContextMenu={(e) => handleContextMenu(e, { ...p, name: displayName, avatarUrl: displayAvatar })}
          >
            <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center font-bold text-xl overflow-hidden transition-all duration-200 bg-indigo-500 participant-large avatar-user-${p.id} ring-2 ring-transparent`}>
              {displayAvatar ? (
                <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                displayName?.charAt(0).toUpperCase() || 'U'
              )}
            </div>

            <span className={`text-xs font-medium bg-zinc-800 px-2 py-0.5 rounded-full text-user-${p.id} text-zinc-300`}>
              {displayName}
            </span>

            <div className="absolute -top-2 -right-2 flex gap-1">
              {p.isMuted && (
                <div className="bg-zinc-800 rounded-full p-1 border border-zinc-900">
                  <MicOff className="w-3 h-3 text-red-500" />
                </div>
              )}

              {(p.isStreaming || hasLiveStream) && (
                canClickStream ? (
                  <button
                    onClick={(e) => toggleViewScreenShare(e, p.id)}
                    className={clsx(
                      "rounded-full p-1.5 border border-zinc-900 transition-colors shadow-lg",
                      isViewing
                        ? "bg-emerald-500 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    )}
                    title={isViewing ? "Fermer le stream" : "Regarder le stream"}
                  >
                    <MonitorUp className="w-4 h-4" />
                  </button>
                ) : (
                  <div
                    className="rounded-full p-1.5 border border-zinc-900 shadow-lg bg-zinc-800 text-zinc-500 opacity-70 cursor-not-allowed"
                    title="Connectez-vous à ce salon vocal pour regarder le stream"
                    aria-hidden="true"
                  >
                    <MonitorUp className="w-4 h-4" />
                  </div>
                )
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