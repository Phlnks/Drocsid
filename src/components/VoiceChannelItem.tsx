import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { Volume2, MicOff, UserMinus, Ban, PhoneOff, MonitorUp, Moon, Settings } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import clsx from 'clsx';
import UserContextMenu from './ui/UserContextMenu';

import { playScreenShareJoinSound, playScreenShareLeaveSound } from '../lib/sounds';

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
  onRename
}: Props) {
  const { user: currentUser } = useAuthStore();
  const { speakingUsers, remoteScreenShares, localScreenShareStream, viewingScreenShares, setViewingScreenShares, selectedServerId, voiceParticipants: allVoiceParticipants } = useAppStore();
  const participants = allVoiceParticipants[channel.id] || [];
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, userId: string, username: string } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, user: any) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, userId: user.id, username: user.name });
  };

  const handleDragStart = (e: React.DragEvent, userId: string) => {
    if (!hasMoveMembers) return;
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', JSON.stringify({ userId, sourceChannelId: channel.id }));
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
      console.error("Error parsing drag data", err);
    }
  };

  const toggleViewScreenShare = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    const isActiveFocus = useAppStore.getState().activeStreamFocus === uid;
    
    setViewingScreenShares(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        if (!isActiveFocus) {
          // It's floating, just focus it
          useAppStore.getState().setActiveStreamFocus(uid);
        } else {
          // It's focused, close it
          playScreenShareLeaveSound();
          next.delete(uid);
          useAppStore.getState().setActiveStreamFocus(null);
        }
      } else {
        playScreenShareJoinSound();
        next.add(uid);
        useAppStore.getState().setActiveStreamFocus(uid);
      }
      return next;
    });
    
    if (window.innerWidth < 768) {
      useAppStore.getState().setIsMobileNavOpen(false);
    }
  };

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
          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group transition-colors",
          isSelected 
            ? "bg-zinc-700/50 text-zinc-100" 
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300",
          isDragOver && hasMoveMembers && "ring-2 ring-indigo-500 bg-zinc-800/80"
        )}
      >
        {channel.type === 'AFK' ? <Moon className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        <span className="truncate flex-1">{channel.name}</span>
        {hasManageChannels && onRename && (
          <button 
            onClick={(e) => { e.stopPropagation(); onRename(channel); }}
            className="p-1 hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      
      {/* Participants List */}
      {participants.length > 0 && (
        <div className="flex flex-col gap-[2px] mt-1 mb-2 ml-6">
          {participants.map(p => {
            const isSpeaking = speakingUsers[p.id];
            const isCurrentUser = currentUser && p.id === currentUser.id;
            const isSharingScreen = isCurrentUser ? !!localScreenShareStream : !!remoteScreenShares[p.id];
            const isViewing = viewingScreenShares.has(p.id);

            return (
              <div 
                key={p.id} 
                draggable={hasMoveMembers}
                onDragStart={(e) => handleDragStart(e, p.id)}
                onContextMenu={(e) => handleContextMenu(e, p)}
                className={clsx(
                  "flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800/50 cursor-pointer group relative",
                  hasMoveMembers && "cursor-grab active:cursor-grabbing"
                )}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center overflow-hidden shrink-0 transition-all duration-200 bg-indigo-500 ${
                  isSpeaking ? 'ring-2 speaking-ring' : 'ring-2 ring-transparent'
                }`}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-white">{p.name?.charAt(0).toUpperCase() || 'U'}</span>
                  )}
                </div>
                <span className={`text-sm truncate transition-colors ${isSpeaking ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-300'}`}>
                  {p.name}
                </span>
                
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {(p.isStreaming || isSharingScreen) && (
                    <button 
                      onClick={(e) => toggleViewScreenShare(e, p.id)}
                      className={clsx(
                        "p-1.5 rounded-md transition-colors",
                        isViewing ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                      )}
                      title={isViewing ? "Fermer le stream" : "Regarder le stream"}
                    >
                      <MonitorUp className="w-4 h-4" />
                    </button>
                  )}
                  {p.isMuted && <MicOff className="w-3 h-3 text-red-500" />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          serverId={selectedServerId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
