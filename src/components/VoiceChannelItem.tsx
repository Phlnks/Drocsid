import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Volume2,
  MicOff,
  Headphones,
  MonitorUp,
  Moon,
  Settings,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import clsx from 'clsx';
import UserContextMenu from './ui/UserContextMenu';
import UserProfileModal from './ui/UserProfileModal';
import { useTranslation } from 'react-i18next';
import {
  playScreenShareJoinSound,
  playScreenShareLeaveSound,
} from '../lib/sounds';

interface Props {
  key?: any;
  channel: any;
  isSelected: boolean;
  onClick: () => void;
  hasMoveMembers?: boolean;
  onMoveMember?: (userId: string, targetChannelId: string) => void;
  hasKickMembers?: boolean;
  hasBanMembers?: boolean;
  onDisconnectMember?: (userId: string) => void;
  onKickMember?: (userId: string) => void;
  onBanMember?: (userId: string) => void;
  hasManageChannels?: boolean;
  onRename?: (channel: any) => void;
}

export default function VoiceChannelItem({
  channel,
  isSelected,
  onClick,
  hasMoveMembers,
  onMoveMember,
  hasKickMembers,
  hasBanMembers,
  onDisconnectMember,
  onKickMember,
  onBanMember,
  hasManageChannels,
  onRename,
}: Props) {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();

  const {
    connectedVoiceChannelId,
    remoteScreenShares,
    localScreenShareStream,
    viewingScreenShares,
    setViewingScreenShares,
    selectedServerId,
    voiceParticipants: allVoiceParticipants,
    globalProfiles,
  } = useAppStore();

  const participants = allVoiceParticipants[channel.id] || [];
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    userId: string;
    username: string;
  } | null>(null);
  const [showProfile, setShowProfile] = useState<any>(null);

  const isConnectedToThisChannel =
    !!connectedVoiceChannelId && connectedVoiceChannelId === channel.id;

  const handleContextMenu = (e: React.MouseEvent, user: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      userId: user.id,
      username: user.name,
    });
  };

  const handleDragStart = (e: React.DragEvent, userId: string) => {
    if (!hasMoveMembers) return;
    e.stopPropagation();
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ userId, sourceChannelId: channel.id })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasMoveMembers) return;
    const isMemberDrag = e.dataTransfer.types.includes('text/plain');
    if (!isMemberDrag) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!hasMoveMembers) return;

    const isMemberDrag = e.dataTransfer.types.includes('text/plain');
    if (!isMemberDrag) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      if (data.userId && data.sourceChannelId && data.sourceChannelId !== channel.id) {
        if (onMoveMember) {
          onMoveMember(data.userId, channel.id);
        }
      }
    } catch (err) {
      console.error('Error parsing drag data', err);
    }
  };

  const toggleViewScreenShare = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();

    if (!isConnectedToThisChannel) return;

    const isActiveFocus = useAppStore.getState().activeStreamFocus === uid;

    setViewingScreenShares((prev) => {
      const next = new Set(prev);

      if (next.has(uid)) {
        if (!isActiveFocus) {
          useAppStore.getState().setActiveStreamFocus(uid);
          useAppStore.getState().setIsRightSidebarOpen(false);
        } else {
          playScreenShareLeaveSound();
          next.delete(uid);
          useAppStore.getState().setActiveStreamFocus(null);
        }
      } else {
        playScreenShareJoinSound();
        next.add(uid);
        useAppStore.getState().setActiveStreamFocus(uid);
        useAppStore.getState().setIsRightSidebarOpen(false);
      }

      return next;
    });

    if (window.innerWidth < 768) {
      useAppStore.getState().setIsMobileNavOpen(false);
    }
  };

  const isAfk = channel.name.endsWith(' [AFK]');
  const displayChannelName = isAfk
    ? channel.name.replace(' [AFK]', '')
    : channel.name;

  return (
    <div
      className="mb-[2px]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        onClick={onClick}
        className={clsx(
          'flex items-center gap-2 md:gap-2 px-3 py-3 md:px-2 md:py-1.5 text-lg md:text-base rounded-md cursor-pointer group transition-colors',
          isSelected
            ? 'bg-zinc-700/50 text-zinc-100'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300',
          isDragOver && hasMoveMembers && 'ring-2 ring-indigo-500 bg-zinc-800/80'
        )}
      >
        {isAfk ? (
          <Moon className="w-5 h-5 md:w-4 md:h-4" />
        ) : (
          <Volume2 className="w-5 h-5 md:w-4 md:h-4" />
        )}

        <span className="truncate flex-1">{displayChannelName}</span>

        {hasManageChannels && onRename && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename(channel);
            }}
            className="p-2 md:p-1 hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Settings className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>
        )}
      </div>

      {participants.length > 0 && (
        <div className="flex flex-col gap-[2px] mt-1 mb-2 ml-6">
          {participants.map((p) => {
            const isCurrentUser = !!currentUser && p.id === currentUser.id;
            const hasActiveStreamObject = isCurrentUser
              ? !!localScreenShareStream
              : !!remoteScreenShares[p.id];

            const isStreamingIndicator = !!p.isStreaming || hasActiveStreamObject;
            const isViewing = viewingScreenShares.has(p.id);
            const userProfile = globalProfiles[p.id];
            const displayName = userProfile?.username || p.name;
            const displayAvatar = userProfile?.avatar_url || p.avatarUrl;

            const isMutedUser = isCurrentUser
              ? useAppStore.getState().isVoiceMuted
              : p.isMuted;
            const isDeafenedUser = isCurrentUser
              ? useAppStore.getState().isDeafened
              : p.isDeafened;

            const canWatchThisStream =
              isStreamingIndicator && isConnectedToThisChannel;

            return (
              <div
                key={p.id}
                draggable={hasMoveMembers}
                onDragStart={(e) => handleDragStart(e, p.id)}
                onContextMenu={(e) => handleContextMenu(e, p)}
                className={clsx(
                  'flex items-center gap-3 md:gap-2 px-3 py-2 md:px-2 md:py-1 rounded hover:bg-zinc-800/50 cursor-pointer group relative',
                  hasMoveMembers && 'cursor-grab active:cursor-grabbing'
                )}
              >
                <div
                  className={`w-8 h-8 md:w-6 md:h-6 rounded-full flex items-center justify-center overflow-hidden shrink-0 transition-all duration-200 bg-indigo-500 participant-small avatar-user-${p.id} ring-2 ring-transparent`}
                >
                  {displayAvatar ? (
                    <img
                      src={displayAvatar}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[12px] md:text-[10px] font-bold text-white">
                      {displayName?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  )}
                </div>

                <span
                  className={`text-base md:text-sm truncate transition-colors text-user-${p.id} text-zinc-400 group-hover:text-zinc-300`}
                >
                  {displayName}
                </span>

                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {isStreamingIndicator && (
                    <button
                      onClick={(e) => {
                        if (!canWatchThisStream) {
                          e.stopPropagation();
                          return;
                        }
                        toggleViewScreenShare(e, p.id);
                      }}
                      disabled={!canWatchThisStream}
                      className={clsx(
                        'p-1.5 rounded-md transition-colors',
                        canWatchThisStream
                          ? isViewing
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                          : 'text-zinc-500 opacity-70 cursor-not-allowed'
                      )}
                      title={
                        canWatchThisStream
                          ? isViewing
                            ? t('common.closeStream')
                            : t('common.watchStream')
                          : 'Connectez-vous à ce salon vocal pour regarder le stream'
                      }
                    >
                      <MonitorUp className="w-4 h-4" />
                    </button>
                  )}

                  {isMutedUser && <MicOff className="w-3 h-3 text-red-500" />}
                  {isDeafenedUser && (
                    <Headphones className="w-3 h-3 text-red-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          serverId={selectedServerId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onViewProfile={() => {
            const p = participants.find(
              (part) => part.id === contextMenu.userId
            );
            if (p) {
              const uProfile = globalProfiles[p.id];
              setShowProfile(
                uProfile || {
                  id: p.id,
                  username: p.name,
                  avatar_url: p.avatarUrl,
                }
              );
            }
          }}
        />
      )}

      {showProfile && (
        <UserProfileModal
          isOpen={!!showProfile}
          onClose={() => setShowProfile(null)}
          user={showProfile}
        />
      )}
    </div>
  );
}