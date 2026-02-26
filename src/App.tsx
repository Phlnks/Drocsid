import React, { useCallback, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Hash, Volume2, Send, Mic, MicOff, Users, Settings, LogOut, Smile, Image as ImageIcon, Plus, Shield, Trash2, Check, Circle, Search, X, Monitor, MonitorOff, Headphones, HeadphoneOff, Pencil, Paperclip, File as FileIcon, Download, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { cn } from './lib/utils';
import { Channel, Message, User, Role, Permission, PresenceStatus } from './types';
import { soundService } from './services/soundService';
import { searchGifs as giphySearch } from './giphy';
import { logo } from './logo';

const SOCKET_URL = window.location.origin;

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
  return debounced as (...args: Parameters<F>) => void;
}

function setOpusPriority(sdp: string, codec: 'opus' | 'pcm' | 'aac'): string {
    if (codec !== 'opus') return sdp;
    const lines = sdp.split('\r\n');
    let mLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=audio')) {
            mLineIndex = i;
            break;
        }
    }
    if (mLineIndex === -1) return sdp;
    let opusPayloadType = '';
    const rtpmapRegex = /a=rtpmap:(\d+) opus\/48000\/2/;
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(rtpmapRegex);
        if (match) {
            opusPayloadType = match[1];
            break;
        }
    }
    if (!opusPayloadType) return sdp;
    const mLineParts = lines[mLineIndex].split(' ');
    const otherPayloads = mLineParts.slice(3).filter(p => p !== opusPayloadType);
    lines[mLineIndex] = [...mLineParts.slice(0, 3), opusPayloadType, ...otherPayloads].join(' ');
    return lines.join('\r\n');
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [channelVoiceUsers, setChannelVoiceUsers] = useState<Record<string, string[]>>({});
  const [voiceStates, setVoiceStates] = useState<Record<string, { speaking: boolean, muted: boolean, deafened: boolean }>>({});
  const [isJoinedVoice, setIsJoinedVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('username') || `User_${Math.floor(Math.random() * 1000)}`);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(username);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [roles, setRoles] = useState<Role[]>([]);
  const [userPresence, setUserPresence] = useState<Record<string, PresenceStatus>>({});
  const [allUserRoles, setAllUserRoles] = useState<Record<string, string[]>>({});
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [remoteScreens, setRemoteScreens] = useState<Record<string, string>>({});
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [previewImage, setPreviewImage] = useState<{ path: string; name: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; channel: Channel | null }>({ visible: false, x: 0, y: 0, channel: null });
  const [userContextMenu, setUserContextMenu] = useState<{ visible: boolean; x: number; y: number; userId: string | null }>({ visible: false, x: 0, y: 0, userId: null });
  const [screenSharers, setScreenSharers] = useState<Record<string, string>>({});
  const [windowedStreamUserId, setWindowedStreamUserId] = useState<string | null>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<{ visible: boolean; x: number; y: number; messageId: string | null }>({ visible: false, x: 0, y: 0, messageId: null });
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [channelNameInput, setChannelNameInput] = useState('');
  const [settingsTab, setSettingsTab] = useState<'voice' | 'roles' | 'users'>('voice');
  const [inputVolume, setInputVolume] = useState(() => Number(localStorage.getItem('inputVolume')) || 100);
  const [outputVolume, setOutputVolume] = useState(() => Number(localStorage.getItem('outputVolume')) || 100);
  const [audioCodec, setAudioCodec] = useState<'pcm' | 'opus' | 'aac'>(() => (localStorage.getItem('audioCodec') as any) || 'opus');
  const [voiceSampleRate, setVoiceSampleRate] = useState<number>(() => Number(localStorage.getItem('voiceSampleRate')) || 24000);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<string[]>([]);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<string[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [unreadMentions, setUnreadMentions] = useState<Record<string, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const AUDIO_CONSTRAINTS = { echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true } };
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [pendingVoiceChannel, setPendingVoiceChannel] = useState<Channel | null>(null);

  const isMutedRef = useRef(isMuted);
  const isDeafenedRef = useRef(isDeafened);
  const voiceSampleRateRef = useRef(voiceSampleRate);
  const isJoinedVoiceRef = useRef(isJoinedVoice);
  const currentVoiceChannelRef = useRef(currentVoiceChannel);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamWindowRef = useRef<Window | null>(null);
  const windowedStreamUserIdRef = useRef<string | null>(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);
  useEffect(() => { voiceSampleRateRef.current = voiceSampleRate; }, [voiceSampleRate]);
  useEffect(() => { isJoinedVoiceRef.current = isJoinedVoice; }, [isJoinedVoice]);
  useEffect(() => { currentVoiceChannelRef.current = currentVoiceChannel; }, [currentVoiceChannel]);
  useEffect(() => { windowedStreamUserIdRef.current = windowedStreamUserId; }, [windowedStreamUserId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenIntervalRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputGainRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const typingTimeoutRef = useRef<any>(null);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestAudioContextRef = useRef<AudioContext | null>(null);
  const micTestAnalyzerRef = useRef<AnalyserNode | null>(null);
  const micTestAnimationRef = useRef<number | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});

  const closeStreamWindow = useCallback(() => {
    if (streamWindowRef.current && !streamWindowRef.current.closed) {
      streamWindowRef.current.close();
    }
    streamWindowRef.current = null;
    setWindowedStreamUserId(null);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => closeStreamWindow();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      closeStreamWindow();
    };
  }, [closeStreamWindow]);

  useEffect(() => {
    localStorage.setItem('username', username);
  }, [username]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, { autoConnect: false });
    setSocket(newSocket);

    const handleInit = (data: any) => {
      const { channels, messages, roles, userPresence, voiceStates, screenSharers, userRoles, usernames, voiceUsers } = data || {};
      setChannels(channels || []);
      setMessages(messages || {});
      setRoles(roles || []);
      setUserPresence(userPresence || {});
      setVoiceStates(voiceStates || {});
      setAllUserRoles(userRoles || {});
      setUsernames(usernames || {});
      setChannelVoiceUsers(voiceUsers || {});
      if ((channels || []).length > 0) {
        setCurrentChannel(channels[0]);
        newSocket.emit('join-channel', channels[0].id);
      }
      newSocket.emit('set-username', username);
    };

    const handleScreenShareStopped = ({ userId, channelId }: { userId: string, channelId: string }) => {
      setScreenSharers(prev => {
        const next = { ...prev };
        if (next[channelId] === userId) delete next[channelId];
        return next;
      });
      setRemoteScreens(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      if (userId === windowedStreamUserIdRef.current) {
        closeStreamWindow();
      }
    };

    const handleScreenStream = ({ userId, data }: { userId: string, data: string }) => {
      setRemoteScreens(prev => ({ ...prev, [userId]: data }));
      if (userId === windowedStreamUserIdRef.current && streamWindowRef.current && !streamWindowRef.current.closed) {
        const img = streamWindowRef.current.document.getElementById('stream-image');
        if (img) {
          (img as HTMLImageElement).src = data;
        }
      }
    };

    newSocket.on('init', handleInit);
    newSocket.on('screen-share-stopped', handleScreenShareStopped);
    newSocket.on('screen-stream', handleScreenStream);
    // ... (rest of the listeners)
    newSocket.on('connect_error', (err: Error) => console.error('Socket connection error:', err));
    newSocket.on('user-roles-update', (userRoles: Record<string, string[]>) => setAllUserRoles(userRoles));
    newSocket.on('usernames-update', (names: Record<string, string>) => setUsernames(names));
    newSocket.on('channels-updated', (updatedChannels: Channel[]) => setChannels(updatedChannels));
    newSocket.on('voice-state-update', ({ userId, state }: { userId: string, state: any }) => setVoiceStates(prev => ({ ...prev, [userId]: state })));
    newSocket.on('presence-update', (presence: Record<string, PresenceStatus>) => setUserPresence(presence));
    newSocket.on('roles-updated', (newRoles: Role[]) => setRoles(newRoles));
    newSocket.on('new-message', ({ channelId, message }: { channelId: string, message: Message }) => {
        soundService.playMessage();
        setMessages((prev) => ({ ...prev, [channelId]: [...(prev[channelId] || []), message] }));
    });
    newSocket.on('message-updated', ({ channelId, messageId, newText, editedTimestamp }: { channelId: string, messageId: string, newText: string, editedTimestamp: string }) => {
      setMessages((prev) => ({ ...prev, [channelId]: prev[channelId].map((m) => m.id === messageId ? { ...m, text: newText, edited: editedTimestamp } : m) }));
    });
    newSocket.on('reaction-updated', ({ channelId, messageId, reactions }: { channelId: string, messageId: string, reactions: any }) => {
        setMessages((prev) => ({ ...prev, [channelId]: prev[channelId].map((m) => m.id === messageId ? { ...m, reactions } : m) }));
    });
    newSocket.on('voice-users-update', (usersMap: Record<string, string[]>) => {
        setChannelVoiceUsers((prev) => {
            if (isJoinedVoiceRef.current && currentVoiceChannelRef.current) {
                const cid = currentVoiceChannelRef.current.id;
                const prevUsers = prev[cid] || [];
                const nextUsers = usersMap[cid] || [];
                if (nextUsers.length > prevUsers.length) soundService.playJoin();
                else if (nextUsers.length < prevUsers.length && newSocket.id && nextUsers.includes(newSocket.id)) soundService.playLeave();
            }
            return usersMap;
        });
    });
    newSocket.on('user-joined-voice', async ({ userId }: { userId: string }) => {
        if (isJoinedVoiceRef.current && mediaStreamRef.current && newSocket) {
            const pc = createPeerConnection(userId, mediaStreamRef.current, newSocket);
            const offer = await pc.createOffer();
            if (audioCodec === 'opus') offer.sdp = setOpusPriority(offer.sdp, audioCodec);
            await pc.setLocalDescription(offer);
            newSocket.emit('webrtc-offer', { targetUserId: userId, offer });
        }
    });
    newSocket.on('user-left-voice', ({ userId }: { userId: string }) => {
        if (peerConnections.current[userId]) {
            peerConnections.current[userId].close();
            delete peerConnections.current[userId];
        }
    });
    newSocket.on('webrtc-offer', async ({ sourceUserId, offer }: { sourceUserId: string, offer: any }) => {
        if (isJoinedVoiceRef.current && mediaStreamRef.current && newSocket) {
            const pc = createPeerConnection(sourceUserId, mediaStreamRef.current, newSocket);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            if (audioCodec === 'opus') answer.sdp = setOpusPriority(answer.sdp, audioCodec);
            await pc.setLocalDescription(answer);
            newSocket.emit('webrtc-answer', { targetUserId: sourceUserId, answer });
        }
    });
    newSocket.on('webrtc-answer', async ({ sourceUserId, answer }: { sourceUserId: string, answer: any }) => {
        const pc = peerConnections.current[sourceUserId];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });
    newSocket.on('webrtc-ice-candidate', async ({ sourceUserId, candidate }: { sourceUserId: string, candidate: any }) => {
        const pc = peerConnections.current[sourceUserId];
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });
    newSocket.on('screen-share-started', ({ userId, channelId }: { userId: string, channelId: string }) => {
      setScreenSharers(prev => ({ ...prev, [channelId]: userId }));
      if (isJoinedVoiceRef.current && currentVoiceChannelRef.current?.id === channelId) soundService.playScreenShare();
    });
    newSocket.on('user-typing', ({ channelId, user, isTyping }: { channelId: string, user: string, isTyping: boolean }) => {
        setTypingUsers((prev) => {
            const currentTyping = prev[channelId] || [];
            if (isTyping && !currentTyping.includes(user)) return { ...prev, [channelId]: [...currentTyping, user] };
            if (!isTyping) return { ...prev, [channelId]: currentTyping.filter((u) => u !== user) };
            return prev;
        });
    });
    newSocket.on('messages-updated', (newMessages: Record<string, Message[]>) => setMessages(newMessages));
    newSocket.on('force-disconnect-voice', () => {
      stopVoice();
      alert("You have been kicked from the voice channel.");
    });
    newSocket.on('mention', ({ channelId, mentionedBy }: { channelId: string, mentionedBy: string }) => {
        if (username !== mentionedBy) {
            soundService.playMention();
            setUnreadMentions(prev => ({ ...prev, [channelId]: true }));
        }
    });
    newSocket.on('channel-error', ({ message }: { message: string }) => alert(message));

    newSocket.connect();

    return () => {
        newSocket.disconnect();
        stopVoice();
    };
  }, [username, closeStreamWindow, audioCodec]);

  const stopScreenShare = useCallback(() => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (isSharingScreen && currentVoiceChannelRef.current && socket) {
        socket.emit('screen-share-stop', { channelId: currentVoiceChannelRef.current.id });
    }
    closeStreamWindow();
    setIsSharingScreen(false);
  }, [socket, isSharingScreen, closeStreamWindow]);
  
  const stopVoice = useCallback(() => {
    if (isJoinedVoiceRef.current) soundService.playLeave();
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    if (currentVoiceChannelRef.current && socket) {
      socket.emit('leave-voice', currentVoiceChannelRef.current.id);
    }
    stopScreenShare();
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    inputGainRef.current?.disconnect();
    outputGainRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    audioContextRef.current = null;
    setIsJoinedVoice(false);
    setCurrentVoiceChannel(null);
    inputGainRef.current = null;
    outputGainRef.current = null;
    closeStreamWindow();
  }, [socket, stopScreenShare, closeStreamWindow]);

  const handleOpenStreamInNewWindow = useCallback((userId: string) => {
    if (streamWindowRef.current && !streamWindowRef.current.closed) {
      streamWindowRef.current.close();
    }

    const newWindow = window.open('', '_blank', 'width=800,height=600,resizable=yes,scrollbars=no,status=no');
    if (newWindow) {
      streamWindowRef.current = newWindow;
      setWindowedStreamUserId(userId);
      
      newWindow.document.title = `${usernames[userId] || 'User'}'s Stream`;
      newWindow.document.body.style.margin = '0';
      newWindow.document.body.style.backgroundColor = 'black';
      newWindow.document.body.innerHTML = `<img id="stream-image" src="${remoteScreens[userId]}" style="width: 100%; height: 100%; object-fit: fill;" alt="Live Stream" />`;

      newWindow.addEventListener('beforeunload', () => {
        setWindowedStreamUserId(null);
        streamWindowRef.current = null;
      });
    }
  }, [usernames, remoteScreens]);

  useEffect(() => {
    const stream = screenStreamRef.current;
    if (isSharingScreen && stream) {
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      track.addEventListener('ended', stopScreenShare);
      return () => track.removeEventListener('ended', stopScreenShare);
    }
  }, [isSharingScreen, stopScreenShare]);

  useEffect(() => {
    localStorage.setItem('inputVolume', inputVolume.toString());
    if (inputGainRef.current) inputGainRef.current.gain.value = inputVolume / 100;
  }, [inputVolume]);

  useEffect(() => {
    localStorage.setItem('outputVolume', outputVolume.toString());
    if (outputGainRef.current) {
      outputGainRef.current.gain.value = isDeafened ? 0 : outputVolume / 100;
    }
  }, [outputVolume, isDeafened]);

  useEffect(() => { localStorage.setItem('audioCodec', audioCodec); }, [audioCodec]);
  useEffect(() => { localStorage.setItem('voiceSampleRate', voiceSampleRate.toString()); }, [voiceSampleRate]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, currentChannel]);

  useEffect(() => {
    const handleClick = () => {
      setContextMenu({ ...contextMenu, visible: false });
      setShowReactionPicker({ ...showReactionPicker, visible: false });
    };
    if (contextMenu.visible || showReactionPicker.visible) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu, showReactionPicker]);

  useEffect(() => {
    const handleClick = () => setUserContextMenu({ ...userContextMenu, visible: false });
    if (userContextMenu.visible) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [userContextMenu]);

  const handleChannelSelect = (channel: Channel) => {
    if (currentChannel?.id === channel.id) return;
    if (channel.type === 'voice' && isJoinedVoice && currentVoiceChannel?.id !== channel.id) {
      setPendingVoiceChannel(channel);
      setShowSwitchConfirm(true);
      return;
    }
    if (unreadMentions[channel.id]) {
      setUnreadMentions(prev => ({ ...prev, [channel.id]: false }));
    }
    setSearchQuery('');
    if (currentChannel) socket?.emit('leave-channel', currentChannel.id);
    setCurrentChannel(channel);
    socket?.emit('join-channel', channel.id);
  };

  const handleSendMessage = async (e?: React.FormEvent, gifUrl?: string, file?: File) => {
    e?.preventDefault();
    if ((!inputValue.trim() && !gifUrl && !file) || !currentChannel || currentChannel.type !== 'text') return;
    let fileInfo = null;
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        alert('File is too large! Maximum size is 50MB.');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        fileInfo = { path: data.filePath, name: file.name, size: file.size };
      } catch (error) {
        console.error('File upload failed:', error);
        alert('File upload failed!');
        return;
      }
    }
    if (editingMessage) {
      socket?.emit('edit-message', { channelId: currentChannel.id, messageId: editingMessage.id, newText: inputValue });
      setEditingMessage(null);
    } else {
      socket?.emit('send-message', { channelId: currentChannel.id, text: inputValue, user: username, gifUrl, file: fileInfo });
    }
    socket?.emit('typing', { channelId: currentChannel.id, user: username, isTyping: false });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setInputValue('');
    setShowEmojiPicker(false);
    setShowGifPicker(false);
    setShowMentionSuggestions(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handlePaste = (e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) handleSendMessage(undefined, undefined, file);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value, selectionStart } = e.target;
    setInputValue(value);
    const textBeforeCursor = value.substring(0, selectionStart || 0);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setMentionQuery(query);
      const suggestions = Object.values(usernames).filter(name => name.toLowerCase().includes(query)).slice(0, 5);
      if (suggestions.length > 0) {
        setMentionSuggestions(suggestions);
        setShowMentionSuggestions(true);
        setMentionHighlightIndex(0);
      } else {
        setShowMentionSuggestions(false);
      }
    } else {
      setShowMentionSuggestions(false);
    }
    if (!currentChannel || currentChannel.type !== 'text') return;
    socket?.emit('typing', { channelId: currentChannel.id, user: username, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit('typing', { channelId: currentChannel.id, user: username, isTyping: false });
    }, 2000);
  };

  const handleEmojiClick = (emojiData: any) => {
    setInputValue((prev) => prev + emojiData.emoji);
  };

  const handleAddReaction = (messageId: string, emoji: string) => {
    if (!currentChannel || !socket) return;
    const message = messages[currentChannel.id]?.find(m => m.id === messageId);
    const hasReacted = message?.reactions?.[emoji]?.includes(socket.id || '');
    socket.emit(hasReacted ? 'remove-reaction' : 'add-reaction', { channelId: currentChannel.id, messageId, emoji, userId: socket.id });
  };

  const debouncedSearchGifs = useCallback(debounce(async (query: string) => {
    if (query.trim() === '') {
      setGifs([]);
      return;
    }
    const results = await giphySearch(query);
    setGifs(results);
  }, 300), []);

  const searchGifs = (query: string) => {
    setGifSearch(query);
    debouncedSearchGifs(query);
  };

  const createPeerConnection = (targetUserId: string, stream: MediaStream, socket: Socket) => {
    if (peerConnections.current[targetUserId]) {
      peerConnections.current[targetUserId].close();
    }
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        ],
    });
    peerConnections.current[targetUserId] = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('webrtc-ice-candidate', { targetUserId, candidate: event.candidate });
    };
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      if (audioContextRef.current && outputGainRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(remoteStream);
        source.connect(outputGainRef.current);
      } else {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(console.error);
      }
    };
    return pc;
  };

  const startVoice = async (channel: Channel | null) => {
    if (!channel || channel.type !== 'voice' || !socket) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO_CONSTRAINTS, sampleRate: voiceSampleRateRef.current, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mediaStreamRef.current = stream;
      setIsJoinedVoice(true);
      setCurrentVoiceChannel(channel);
      socket.emit('join-voice', channel.id);
      socket.emit('update-voice-state', { muted: isMuted, deafened: isDeafened });

      const existingUsers = channelVoiceUsers[channel.id] || [];
      existingUsers.forEach(async (userId) => {
        if (userId !== socket.id) {
          const pc = createPeerConnection(userId, stream, socket);
          const offer = await pc.createOffer();
          if (audioCodec === 'opus') offer.sdp = setOpusPriority(offer.sdp, audioCodec);
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { targetUserId: userId, offer });
        }
      });

      let audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
      if (audioContext.state === 'suspended') await audioContext.resume();
      audioContextRef.current = audioContext;

      const outputGain = audioContext.createGain();
      outputGain.gain.value = isDeafened ? 0 : outputVolume / 100;
      outputGain.connect(audioContext.destination);
      outputGainRef.current = outputGain;

      const inputGain = audioContext.createGain();
      inputGain.gain.value = inputVolume / 100;
      inputGainRef.current = inputGain;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      let lastSpeakingState = false;
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);
        const isSpeaking = rms > 0.01 && !isMutedRef.current;
        if (isSpeaking !== lastSpeakingState) {
          lastSpeakingState = isSpeaking;
          socket.emit('update-voice-state', { speaking: isSpeaking });
        }
      };

      source.connect(inputGain);
      inputGain.connect(processor);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

    } catch (err) {
      console.error('Failed to get microphone:', err);
      alert("Failed to access microphone. Please check permissions.");
      setIsJoinedVoice(false);
      setCurrentVoiceChannel(null);
    }
  };

  const handleToggleScreenShare = async () => {
    if (isSharingScreen) {
      stopScreenShare();
      return;
    }
    if (!currentVoiceChannel || !socket) {
      alert("You must be in a voice channel to share your screen.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: true });
      screenStreamRef.current = stream;
      setIsSharingScreen(true);
      socket.emit('screen-share-start', { channelId: currentVoiceChannel.id });
      soundService.playScreenShare();
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      const startStreaming = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const voiceChannelId = currentVoiceChannel.id;
        if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
        screenIntervalRef.current = setInterval(() => {
          if (!ctx || !video.videoWidth || !socket) return;
          canvas.width = 1280;
          canvas.height = (video.videoHeight / video.videoWidth) * 1280;
          if (isNaN(canvas.height)) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/jpeg', 0.5);
          socket.emit('screen-data', { channelId: voiceChannelId, data });
        }, 1000 / 20);
      };
      video.onloadedmetadata = () => video.play().then(startStreaming).catch(console.error);
    } catch (err) {
      console.error('Error sharing screen:', err);
      setIsSharingScreen(false);
      if ((err as any).name !== 'NotAllowedError') {
        alert("Failed to start screen sharing. Please ensure you have granted the necessary permissions.");
      }
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    soundService.playToggle(!newMuted);
    socket?.emit('update-voice-state', { muted: newMuted });
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !newMuted; });
    }
  };

  const toggleDeafen = () => {
    const newDeafened = !isDeafened;
    setIsDeafened(newDeafened);
    soundService.playToggle(!newDeafened);
    socket?.emit('update-voice-state', { deafened: newDeafened });
    if (newDeafened && !isMuted) toggleMute();
  };

  const handleUpdateRoles = (newRoles: Role[]) => {
    setRoles(newRoles);
    socket?.emit('update-roles', newRoles);
  };

  const handleAddRole = () => {
    const newRole: Role = { id: Math.random().toString(36).substr(2, 9), name: 'New Role', color: '#99aab5', permissions: ['SEND_MESSAGES', 'CONNECT_VOICE'] };
    handleUpdateRoles([...roles, newRole]);
  };

  const handleDeleteRole = (id: string) => handleUpdateRoles(roles.filter(r => r.id !== id));

  const handleTogglePermission = (roleId: string, permission: Permission) => {
    const newRoles = roles.map(r => r.id === roleId ? { ...r, permissions: r.permissions.includes(permission) ? r.permissions.filter(p => p !== permission) : [...r.permissions, permission] } : r);
    handleUpdateRoles(newRoles);
  };

  const handleUpdateRoleName = (roleId: string, name: string) => handleUpdateRoles(roles.map(r => r.id === roleId ? { ...r, name } : r));
  const handleUpdateRoleColor = (roleId: string, color: string) => handleUpdateRoles(roles.map(r => r.id === roleId ? { ...r, color } : r));

  const handleUsernameChange = () => {
    const trimmedUsername = newUsername.trim();
    if (trimmedUsername && trimmedUsername !== username) {
      setUsername(trimmedUsername);
      socket?.emit('set-username', trimmedUsername);
    }
    setIsEditingUsername(false);
  };

  const hasPermission = useCallback((permission: Permission) => {
    const userRoleIds = allUserRoles[username] || [];
    const userPermissions = new Set(roles.filter((r) => userRoleIds.includes(r.id)).flatMap((r) => r.permissions));
    return userPermissions.has('ADMINISTRATOR') || userPermissions.has(permission);
  }, [allUserRoles, username, roles]);

  const handleCreateChannel = () => {
    if (!channelNameInput.trim() || !socket) return;
    socket.emit('create-channel', { name: channelNameInput.trim(), type: newChannelType });
    setShowChannelModal(false);
    setChannelNameInput('');
  };

  const handleUpdateChannel = () => {
    if (!editingChannel || !channelNameInput.trim() || !socket) return;
    socket.emit('update-channel', { id: editingChannel.id, name: channelNameInput.trim() });
    setShowChannelModal(false);
    setEditingChannel(null);
    setChannelNameInput('');
  };

  const handleDeleteChannel = (channelId: string) => {
    if (confirm('Are you sure you want to delete this channel?')) {
      socket?.emit('delete-channel', channelId);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (currentChannel) socket?.emit('delete-message', { channelId: currentChannel.id, messageId });
  };

  const handleEditMessage = (message: Message) => {
    setEditingMessage(message);
    setInputValue(message.text);
  };

  const handleAssignRole = (username: string, roleId: string) => {
    const currentRoles = allUserRoles[username] || [];
    const newRoles = currentRoles.includes(roleId) ? currentRoles.filter((id) => id !== roleId) : [...currentRoles, roleId];
    socket?.emit("assign-role", { username, roleIds: newRoles });
  };

  const getUserColor = (username: string) => {
    const userRoleIds = allUserRoles[username] || [];
    const userRolesList = roles.filter(r => userRoleIds.includes(r.id));
    if (userRolesList.length > 0) return userRolesList[0].color;
    return '#ffffff';
  };

  const handleUpdatePresence = (status: PresenceStatus) => {
    socket?.emit('update-presence', status);
    setShowStatusMenu(false);
  };

  const handleChannelContextMenu = (e: React.MouseEvent, channel: Channel) => {
    if (!hasPermission('MANAGE_CHANNELS')) return;
    e.preventDefault();
    e.stopPropagation();
    setUserContextMenu({ visible: false, x: 0, y: 0, userId: null });
    const menuWidth = 192;
    let x = e.clientX;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    setContextMenu({ visible: true, x, y: e.clientY, channel: channel });
  };

  const handleUserContextMenu = (e: React.MouseEvent, userId: string) => {
    if (!hasPermission('MANAGE_ROLES')) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: false, x: 0, y: 0, channel: null });
    const menuWidth = 224;
    let x = e.clientX;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    setUserContextMenu({ visible: true, x, y: e.clientY, userId: userId });
  };
  
  const handleKickUser = (userId: string) => {
    if (currentVoiceChannel) socket?.emit('kick-user', { userId, channelId: currentVoiceChannel.id });
    setUserContextMenu({ visible: false, x: 0, y: 0, userId: null });
  };

  const handleDeleteUser = (userToDelete: string) => {
    if (confirm(`Are you sure you want to delete the user "${userToDelete}"? This action cannot be undone.`)) {
      socket?.emit('delete-user', userToDelete);
    }
  };

  const handleMentionSelect = (selectedUsername: string) => {
    if (!inputRef.current) return;
    const { value, selectionStart } = inputRef.current;
    const textBeforeCursor = value.substring(0, selectionStart || 0);
    const textAfterCursor = value.substring(selectionStart || 0);
    const updatedTextBefore = textBeforeCursor.replace(/@\w*$/, `@${selectedUsername} `);
    setInputValue(updatedTextBefore + textAfterCursor);
    setShowMentionSuggestions(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionSuggestions && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlightIndex((prev) => (prev + 1) % mentionSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlightIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(mentionSuggestions[mentionHighlightIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionSuggestions(false);
      }
    }
    if (editingMessage && e.key === 'Escape') {
      e.preventDefault();
      setEditingMessage(null);
      setInputValue('');
    }
  };

  const toggleMicTest = async () => {
    if (isMicTesting) {
      if (micTestAnimationRef.current) cancelAnimationFrame(micTestAnimationRef.current);
      micTestStreamRef.current?.getTracks().forEach(track => track.stop());
      micTestStreamRef.current = null;
      if (micTestAudioContextRef.current) await micTestAudioContextRef.current.close();
      micTestAudioContextRef.current = null;
      setIsMicTesting(false);
      setMicLevel(0);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO_CONSTRAINTS, sampleRate: voiceSampleRateRef.current } });
        micTestStreamRef.current = stream;
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
        if (audioContext.state === 'suspended') await audioContext.resume();
        micTestAudioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = outputVolume / 100;
        analyser.connect(gainNode);
        gainNode.connect(audioContext.destination);
        micTestAnalyzerRef.current = analyser;
        setIsMicTesting(true);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!micTestAnalyzerRef.current) return;
          micTestAnalyzerRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setMicLevel(Math.min(100, (average / 128) * 100));
          micTestAnimationRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (err) {
        console.error("Error accessing microphone for test:", err);
        alert("Could not access microphone. Please check permissions.");
      }
    }
  };
  
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length > 0) setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files?.length > 0) {
      handleSendMessage(undefined, undefined, e.dataTransfer.files[0]);
    }
  };

  const StatusIndicator = ({ status, size = 10, className }: { status?: PresenceStatus, size?: number, className?: string }) => {
    const colors = { online: 'bg-green-500', idle: 'bg-yellow-500', dnd: 'bg-red-500', offline: 'bg-gray-500' };
    return <div className={cn("rounded-full border-2 border-discord-sidebar", colors[status || 'offline'], className)} style={{ width: size, height: size }} />;
  };

  const PERMISSIONS: Permission[] = ['ADMINISTRATOR', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'KICK_MEMBERS', 'SEND_MESSAGES', 'CONNECT_VOICE', 'DELETE_MESSAGES', 'EDIT_MESSAGES'];

  const renderMessage = (text: string) => {
    const mentionRegex = /@(\w+)/g;
    const parts = text.split(mentionRegex);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const mentionedUser = Object.values(usernames).find(u => u.toLowerCase() === part.toLowerCase());
        if (mentionedUser) {
          return <span key={i} className={cn("font-semibold rounded px-1 transition-colors", mentionedUser === username ? "bg-yellow-500/30 text-yellow-300 hover:bg-yellow-500/50" : "text-discord-accent hover:bg-discord-accent/20")}>@{mentionedUser}</span>;
        }
        return `@${part}`;
      }
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return part.split(urlRegex).map((subPart, j) => subPart.match(urlRegex) ? <a key={`${i}-${j}`} href={subPart} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{subPart}</a> : subPart);
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const RightPanel = () => {
    const groupedUsers = Object.entries(usernames).reduce((acc, [id, name]) => {
      const userRoles = allUserRoles[name] || [];
      if (userRoles.length > 0) {
        userRoles.forEach(roleId => {
          const role = roles.find(r => r.id === roleId);
          if (role) {
            if (!acc[role.name]) acc[role.name] = [];
            acc[role.name].push({ id, name });
          }
        });
      } else {
        if (!acc['Online']) acc['Online'] = [];
        acc['Online'].push({ id, name });
      }
      return acc;
    }, {} as Record<string, { id: string, name: string }[]>);
  
    return (
      <div className="w-60 bg-discord-sidebar flex-col flex-shrink-0">
        <div className="h-12 border-b border-black/20 flex items-center px-4 shadow-sm"><h2 className="font-bold text-white">Users</h2></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {Object.entries(groupedUsers).map(([roleName, users]) => (
            <div key={roleName}>
              <h3 className="text-xs font-bold text-discord-muted uppercase mb-2">{roleName} - {users.length}</h3>
              {users.map(({ id, name }) => (
                <div key={id} className="flex items-center gap-3 cursor-pointer rounded hover:bg-white/5 -mx-4 px-4 py-2" onContextMenu={(e) => handleUserContextMenu(e, id)}>
                  <div className="relative">
                    <div className="w-8 h-8 bg-discord-accent rounded-full flex items-center justify-center text-white text-xs">{name.slice(0, 2).toUpperCase()}</div>
                    <StatusIndicator status={userPresence[id]} size={10} className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <span className="font-medium" style={{ color: getUserColor(name) }}>{name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-discord-dark overflow-hidden relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[999] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
            <UploadCloud size={64} className="text-white/80 mb-4" />
            <h2 className="text-2xl font-bold text-white">Drop to upload</h2>
            <p className="text-discord-muted">Release your file to upload it to the current channel.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReactionPicker.visible && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ top: showReactionPicker.y, left: showReactionPicker.x }} className="absolute z-[200]" onClick={(e) => e.stopPropagation()}>
            <EmojiPicker theme={Theme.DARK} onEmojiClick={(emojiData) => { if (showReactionPicker.messageId) handleAddReaction(showReactionPicker.messageId, emojiData.emoji); setShowReactionPicker({ visible: false, x: 0, y: 0, messageId: null }); }} width={350} height={400} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userContextMenu.visible && userContextMenu.userId && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ top: userContextMenu.y, left: userContextMenu.x }} className="absolute z-[200] w-56 bg-discord-guilds rounded-md shadow-2xl p-2 border border-black/20" onClick={(e) => e.stopPropagation()}>
            <div className="px-2 py-1.5"><div className="text-xs font-bold text-white uppercase">{usernames[userContextMenu.userId]}</div></div>
            <div className="h-[1px] bg-white/10 my-1.5" />
            <div className="space-y-1">
              <div className="px-2 py-1 text-xs text-discord-muted font-bold uppercase">Roles</div>
              {roles.map(role => (
                  <button key={role.id} onClick={() => handleAssignRole(usernames[userContextMenu.userId!], role.id)} className="w-full text-left px-2 py-1.5 rounded text-sm text-discord-text hover:bg-discord-accent hover:text-white transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} /><span>{role.name}</span></div>
                      {(allUserRoles[usernames[userContextMenu.userId!]] || []).includes(role.id) && <Check size={16} />}
                  </button>
              ))}
            </div>
            {hasPermission('KICK_MEMBERS') && (<>
              <div className="h-[1px] bg-white/10 my-1.5" />
              <button onClick={() => handleKickUser(userContextMenu.userId!)} className="w-full text-left px-2 py-1.5 rounded text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors flex items-center gap-2"><LogOut size={14} /> Kick User</button>
            </>)}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {contextMenu.visible && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ top: contextMenu.y, left: contextMenu.x }} className="absolute z-[200] w-48 bg-discord-guilds rounded-md shadow-2xl p-1.5 border border-black/20" onClick={(e) => e.stopPropagation()}>
            {contextMenu.channel && (<>
              <button onClick={() => { if (!contextMenu.channel) return; setEditingChannel(contextMenu.channel); setChannelNameInput(contextMenu.channel.name); setNewChannelType(contextMenu.channel.type); setShowChannelModal(true); setContextMenu({ visible: false, x: 0, y: 0, channel: null }); }} className="w-full text-left px-2 py-1.5 rounded text-sm text-discord-text hover:bg-discord-accent hover:text-white transition-colors flex items-center gap-2"><Pencil size={14} /> Edit Channel</button>
              <button onClick={() => { if (contextMenu.channel) handleDeleteChannel(contextMenu.channel.id); setContextMenu({ visible: false, x: 0, y: 0, channel: null }); }} className="w-full text-left px-2 py-1.5 rounded text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors flex items-center gap-2"><Trash2 size={14} /> Delete Channel</button>
              <div className="h-[1px] bg-white/10 my-1" />
            </>)}
            <button onClick={() => { setNewChannelType('text'); setEditingChannel(null); setChannelNameInput(''); setShowChannelModal(true); setContextMenu({ visible: false, x: 0, y: 0, channel: null }); }} className="w-full text-left px-2 py-1.5 rounded text-sm text-discord-text hover:bg-discord-accent hover:text-white transition-colors flex items-center gap-2"><Plus size={14} /> Create Text Channel</button>
            <button onClick={() => { setNewChannelType('voice'); setEditingChannel(null); setChannelNameInput(''); setShowChannelModal(true); setContextMenu({ visible: false, x: 0, y: 0, channel: null }); }} className="w-full text-left px-2 py-1.5 rounded text-sm text-discord-text hover:bg-discord-accent hover:text-white transition-colors flex items-center gap-2"><Plus size={14} /> Create Voice Channel</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSwitchConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSwitchConfirm(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-discord-dark rounded-lg shadow-2xl overflow-hidden">
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-2">Switch Voice Channels?</h2>
                <p className="text-discord-muted mb-6">You are already in a voice channel. Do you want to disconnect from <span className="text-white font-semibold">{currentVoiceChannel?.name}</span> and join <span className="text-white font-semibold">{pendingVoiceChannel?.name}</span>?</p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowSwitchConfirm(false)} className="px-4 py-2 text-white hover:underline transition-all">Cancel</button>
                  <button onClick={() => { if (pendingVoiceChannel) { stopVoice(); setShowSwitchConfirm(false); setTimeout(() => { setCurrentChannel(pendingVoiceChannel); startVoice(pendingVoiceChannel); }, 150); } }} className="px-6 py-2 bg-red-500 text-white font-bold rounded hover:bg-red-600 transition-colors">Switch Channel</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setPreviewImage(null)} className="absolute -top-8 right-0 text-white/80 hover:text-white transition-colors flex items-center gap-1"><span className="text-sm">Close</span><X size={20} /></button>
              <img src={previewImage.path} alt={previewImage.name} className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" />
              <a href={previewImage.path} download={previewImage.name} className="mt-4 flex items-center gap-2 px-4 py-2 bg-discord-sidebar rounded-md text-white hover:bg-white/20 transition-colors"><Download size={18} /><span>Download</span></a>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="w-18 bg-discord-guilds flex flex-col items-center py-3 gap-2 overflow-y-auto no-scrollbar">
        <div className="w-12 h-12 bg-discord-accent rounded-2xl flex items-center justify-center text-white cursor-pointer hover:rounded-xl transition-all duration-200"><img src={logo} alt="Drocsid Logo" className="w-8 h-8" /></div>
        <div className="w-8 h-[2px] bg-white/10 rounded-full my-1" />
        {[1, 2, 3].map((i) => <div key={i} className="w-12 h-12 bg-discord-sidebar rounded-full flex items-center justify-center text-discord-muted cursor-pointer hover:rounded-xl hover:bg-discord-accent hover:text-white transition-all duration-200"><span className="font-bold">S{i}</span></div>)}
      </div>

      <div className="w-60 bg-discord-sidebar flex flex-col">
        <div className="h-12 border-b border-black/20 flex items-center px-4 shadow-sm"><img src={logo} alt="Drocsid Logo" className="w-8 h-8 mr-2" /><h1 className="font-bold text-white truncate">Drocsid</h1></div>
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-4" onContextMenu={(e) => handleChannelContextMenu(e, null as any)}>
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[11px] font-bold text-discord-muted uppercase tracking-wider">Text Channels</span>
              {hasPermission('MANAGE_CHANNELS') && <button onClick={(e) => { e.stopPropagation(); setNewChannelType('text'); setEditingChannel(null); setChannelNameInput(''); setShowChannelModal(true); }} className="text-discord-muted hover:text-discord-text transition-colors"><Plus size={14} /></button>}
            </div>
            {channels.filter(c => c.type === 'text').map(channel => (
              <div key={channel.id} className="group relative" onContextMenu={(e) => handleChannelContextMenu(e, channel)}>
                <button onClick={() => handleChannelSelect(channel)} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors", currentChannel?.id === channel.id ? "bg-white/10 text-white" : "text-discord-muted hover:bg-white/5 hover:text-discord-text")}>
                  <Hash size={20} className="text-discord-muted group-hover:text-discord-text" /><span className="font-medium truncate">{channel.name}</span>
                  {unreadMentions[channel.id] && <div className="w-2 h-2 bg-red-500 rounded-full ml-auto animate-pulse" />}
                </button>
              </div>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[11px] font-bold text-discord-muted uppercase tracking-wider">Voice Channels</span>
              {hasPermission('MANAGE_CHANNELS') && <button onClick={(e) => { e.stopPropagation(); setNewChannelType('voice'); setEditingChannel(null); setChannelNameInput(''); setShowChannelModal(true); }} className="text-discord-muted hover:text-discord-text transition-colors"><Plus size={14} /></button>}
            </div>
            {channels.filter(c => c.type === 'voice').map(channel => (
              <div key={channel.id} className="space-y-1">
                <div className="group relative" onContextMenu={(e) => handleChannelContextMenu(e, channel)}>
                  <button onClick={() => handleChannelSelect(channel)} onDoubleClick={() => channel.type === 'voice' && startVoice(channel)} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors", currentChannel?.id === channel.id ? "bg-white/10 text-white" : "text-discord-muted hover:bg-white/5 hover:text-discord-text")}>
                    <Volume2 size={20} className="text-discord-muted group-hover:text-discord-text" /><span className="font-medium truncate">{channel.name}</span>
                    {screenSharers[channel.id] && <Monitor size={16} className="text-discord-accent ml-auto" />}
                  </button>
                </div>
                <div className="pl-8 space-y-1">
                  {(channelVoiceUsers[channel.id] || []).map(userId => (
                    <div key={userId} className="flex items-center gap-2 py-1 cursor-pointer rounded hover:bg-white/5 mx-[-8px] px-2" onContextMenu={(e) => handleUserContextMenu(e, userId)}>
                      <div className="relative shrink-0">
                        <div className={cn("w-6 h-6 bg-discord-accent rounded-full flex items-center justify-center text-[10px] text-white transition-all duration-200", voiceStates[userId]?.speaking && "ring-2 ring-green-500 ring-offset-1 ring-offset-discord-sidebar")}>{(usernames[userId] || '??').slice(0, 2).toUpperCase()}</div>
                        <StatusIndicator status={userPresence[userId]} size={10} className="absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={cn("text-sm truncate transition-colors", voiceStates[userId]?.speaking && "font-medium")} style={{ color: getUserColor(usernames[userId]) }}>{usernames[userId] || userId}</span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {voiceStates[userId]?.muted && <MicOff size={12} className="text-red-500" />}
                          {voiceStates[userId]?.deafened && <HeadphoneOff size={12} className="text-red-500" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {isJoinedVoice && currentVoiceChannel && (
          <div className="bg-[#232428] border-b border-black/20 p-2 flex items-center justify-between">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 text-green-500"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /><span className="text-[12px] font-bold uppercase tracking-wider">Voice Connected</span></div>
              <span className="text-xs text-discord-muted truncate">{currentVoiceChannel.name}</span>
            </div>
            <div className="flex items-center gap-1"><button onClick={stopVoice} className="p-1.5 text-discord-muted hover:bg-white/10 hover:text-red-400 rounded transition-colors" title="Disconnect"><LogOut size={18} /></button></div>
          </div>
        )}

        <div className="bg-[#232428] p-2 flex flex-col gap-2 relative">
          <div className="flex items-center gap-2 min-w-0 group">
            <div className="relative shrink-0 cursor-pointer" onClick={() => setShowStatusMenu(!showStatusMenu)}>
              <div className="w-8 h-8 bg-discord-accent rounded-full flex items-center justify-center text-white text-xs">{username.slice(0, 2).toUpperCase()}</div>
              <StatusIndicator status={userPresence[socket?.id || '']} size={12} className="absolute -bottom-0.5 -right-0.5 border-discord-guilds" />
            </div>
            <div className="min-w-0">
              {isEditingUsername ? (
                <form onSubmit={(e) => { e.preventDefault(); handleUsernameChange(); }}>
                  <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} onBlur={handleUsernameChange} onKeyDown={(e) => { if (e.key === 'Escape') { setIsEditingUsername(false); setNewUsername(username); } }} className="bg-transparent text-sm font-bold text-white w-full focus:outline-none border-b border-discord-accent" autoFocus />
                </form>
              ) : (
                <div className="text-sm font-bold truncate cursor-pointer" style={{ color: getUserColor(username) }} onClick={() => { setIsEditingUsername(true); setNewUsername(username); }}>{username}</div>
              )}
              <div className="text-[10px] text-discord-muted truncate capitalize cursor-pointer" onClick={() => setShowStatusMenu(!showStatusMenu)}>{userPresence[socket?.id || ''] || 'online'}</div>
            </div>
          </div>
          <AnimatePresence>
            {showStatusMenu && (
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute bottom-12 left-2 w-48 bg-discord-guilds rounded-md shadow-2xl p-1 z-50 border border-black/20">
                {(['online', 'idle', 'dnd', 'offline'] as PresenceStatus[]).map((status) => (
                  <button key={status} onClick={() => handleUpdatePresence(status)} className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-discord-accent text-discord-text hover:text-white transition-colors text-sm">
                    <StatusIndicator status={status} size={10} className="border-transparent" /><span className="capitalize">{status === 'dnd' ? 'Do Not Disturb' : status}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center justify-between gap-1">
            {isJoinedVoice && <button onClick={handleToggleScreenShare} className={cn("p-1.5 rounded transition-colors", isSharingScreen ? "text-discord-accent bg-discord-accent/10" : "text-discord-muted hover:bg-white/10 hover:text-discord-text")} title={isSharingScreen ? "Stop Sharing" : "Share Screen"}>{isSharingScreen ? <MonitorOff size={18} /> : <Monitor size={18} />}</button>}
            <button onClick={toggleMute} className="p-1.5 text-discord-muted hover:bg-white/10 hover:text-discord-text rounded transition-colors" title={isMuted ? "Unmute" : "Mute"}>{isMuted ? <MicOff size={18} className="text-red-500" /> : <Mic size={18} />}</button>
            <button onClick={toggleDeafen} className="p-1.5 text-discord-muted hover:bg-white/10 hover:text-discord-text rounded transition-colors" title={isDeafened ? "Undeafen" : "Deafen"}>{isDeafened ? <HeadphoneOff size={18} className="text-red-500" /> : <Headphones size={18} />}</button>
            <button onClick={() => setShowSettings(true)} className="p-1.5 text-discord-muted hover:bg-white/10 hover:text-discord-text rounded transition-colors"><Settings size={18} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-discord-dark relative min-w-0">
        <div className="h-12 border-b border-black/20 flex items-center justify-between px-4 shadow-sm shrink-0">
          <div className="flex items-center min-w-0">
            {currentChannel?.type === 'text' ? <Hash size={24} className="text-discord-muted mr-2 shrink-0" /> : <Volume2 size={24} className="text-discord-muted mr-2 shrink-0" />}
            <h2 className="font-bold text-white truncate">{currentChannel?.name || 'Select a channel'}</h2>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {currentChannel?.type === 'text' && (
                <div className="relative group">
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search" className="bg-discord-guilds text-discord-text text-sm px-2 py-1 rounded w-36 focus:w-64 transition-all duration-200 focus:outline-none placeholder:text-discord-muted" />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-discord-muted">{searchQuery ? <X size={14} className="cursor-pointer hover:text-discord-text" onClick={() => setSearchQuery('')} /> : <Search size={14} />}</div>
                </div>
            )}
            <button onClick={() => setShowRightPanel(!showRightPanel)} className={cn("text-discord-muted hover:text-white transition-colors", showRightPanel && "text-white bg-white/5")}><Users size={20} /></button>
        </div>
        </div>
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
            {currentChannel?.type === 'text' ? (
              <>
                <AnimatePresence initial={false}>
                  {(messages[currentChannel.id] || []).filter(msg => !searchQuery || msg.text.toLowerCase().includes(searchQuery.toLowerCase()) || msg.user?.toLowerCase().includes(searchQuery.toLowerCase())).map((msg) => (
                    <motion.div key={msg.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 group hover:bg-black/5 -mx-4 px-4 py-1 relative">
                      <div className="relative shrink-0 mt-1">
                        <div className="w-10 h-10 bg-discord-sidebar rounded-full flex items-center justify-center text-discord-muted">{msg.user?.slice(0, 2).toUpperCase()}</div>
                        {msg.userId && <StatusIndicator status={userPresence[msg.userId]} size={12} className="absolute -bottom-0.5 -right-0.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold hover:underline cursor-pointer" style={{ color: getUserColor(msg.user) }}>{msg.user}</span>
                          <span className="text-[10px] text-discord-muted">{new Date(msg.timestamp).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.edited && <span className="text-[10px] text-discord-muted italic">(edited)</span>}
                        </div>
                        {editingMessage?.id === msg.id ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(e);}} className="relative">
                                <input type="text" value={inputValue} onChange={handleInputChange} className="w-full bg-[#383a40] text-discord-text px-2 py-1 rounded-md focus:outline-none text-sm" autoFocus />
                                <div className="text-xs text-discord-muted mt-1">Press <span className="font-semibold text-discord-accent">Enter</span> to save, <span className="font-semibold text-discord-accent">Esc</span> to cancel</div>
                            </form>
                        ) : (
                          <p className="text-discord-text leading-relaxed break-words whitespace-pre-wrap">{renderMessage(msg.text)}</p>
                        )}
                        {msg.gifUrl && <div className="mt-2 rounded-lg overflow-hidden max-w-sm"><img src={msg.gifUrl} alt="GIF" className="w-full h-auto" /></div>}
                        {msg.file && (() => {
                          const isImage = /\.png|\.jpg|\.jpeg|\.gif|\.webp$/i.test(msg.file.name);
                          if (isImage) return <div className="mt-2 relative max-w-xs rounded-lg overflow-hidden"><img src={msg.file.path} alt={msg.file.name} className="max-w-full h-auto max-h-80 object-contain rounded-md cursor-pointer" onClick={() => setPreviewImage(msg.file)} /></div>;
                          const isAudio = /\.mp3|\.wav|\.ogg|\.flac$/i.test(msg.file.name);
                          if (isAudio) return <div className="mt-2 w-full max-w-sm"><audio controls src={msg.file.path} className="w-full rounded-lg" /></div>;
                          const isVideo = /\.mp4|\.webm|\.mov$/i.test(msg.file.name);
                          if (isVideo) return <div className="mt-2 relative max-w-sm rounded-lg overflow-hidden"><video controls src={msg.file.path} className="w-full h-auto rounded-lg" /></div>;
                          return <div className="mt-2 bg-discord-sidebar p-3 rounded-lg border border-black/20 max-w-sm flex items-center gap-3"><FileIcon size={40} className="text-discord-muted shrink-0" /><div className="flex-1 min-w-0"><a href={msg.file.path} download={msg.file.name} className="text-blue-400 hover:underline font-medium truncate block">{msg.file.name}</a><div className="text-xs text-discord-muted">{msg.file.size ? formatFileSize(msg.file.size) : ''}</div></div><a href={msg.file.path} download={msg.file.name} className="p-2 text-discord-muted hover:text-white transition-colors"><Download size={18} /></a></div>;
                        })()}
                        {msg.linkPreview && <a href={msg.linkPreview.url} target="_blank" rel="noopener noreferrer" className="mt-2 block bg-discord-sidebar p-3 rounded-lg border border-black/20 max-w-sm hover:bg-white/5 transition-colors">{msg.linkPreview.image && <img src={msg.linkPreview.image} alt={msg.linkPreview.title} className="w-full h-auto rounded-md mb-2" />}<h4 className="font-bold text-white text-sm">{msg.linkPreview.title}</h4>{msg.linkPreview.description && <p className="text-discord-muted text-xs mt-1">{msg.linkPreview.description}</p>}</a>}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(msg.reactions).map(([emoji, userIds]) => <button key={emoji} onClick={() => handleAddReaction(msg.id, emoji)} className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs border transition-colors", socket && (userIds as string[]).includes(socket.id) ? "bg-discord-accent/20 border-discord-accent text-discord-accent" : "bg-discord-sidebar border-transparent text-discord-muted hover:border-white/20")}><span>{emoji}</span><span className="font-bold">{(userIds as string[]).length}</span></button>)}
                          </div>
                        )}
                      </div>
                      <div className="absolute right-4 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-discord-sidebar border border-black/20 rounded-md shadow-lg p-1">
                        {hasPermission('EDIT_MESSAGES') && <button onClick={() => handleEditMessage(msg)} className="p-1 hover:bg-white/10 rounded text-discord-muted hover:text-discord-text"><Pencil size={16} /></button>}
                        <button onClick={() => handleAddReaction(msg.id, '👍')} className="p-1 hover:bg-white/10 rounded text-discord-muted hover:text-discord-text">👍</button>
                        <button onClick={() => handleAddReaction(msg.id, '❤️')} className="p-1 hover:bg-white/10 rounded text-discord-muted hover:text-discord-text">❤️</button>
                        <button onClick={() => handleAddReaction(msg.id, '😂')} className="p-1 hover:bg-white/10 rounded text-discord-muted hover:text-discord-text">😂</button>
                        <div className="w-[1px] bg-white/10 mx-1" />
                        <button onClick={(e) => { e.stopPropagation(); setShowReactionPicker({ visible: true, x: e.clientX - 350, y: e.clientY - 400, messageId: msg.id }); }} className="p-1 hover:bg-white/10 rounded text-discord-muted hover:text-discord-text"><Plus size={16} /></button>
                        {hasPermission('DELETE_MESSAGES') && <button onClick={() => handleDeleteMessage(msg.id)} className="p-1 hover:bg-red-500/20 rounded text-discord-muted hover:text-red-400"><Trash2 size={16} /></button>}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center space-y-8 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
                  {isSharingScreen && (
                    <div className="relative aspect-video bg-black rounded-xl overflow-hidden border-2 border-discord-accent shadow-2xl">
                      <div className="absolute top-2 left-2 z-10 bg-discord-accent text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Your Stream</div>
                      <video autoPlay muted ref={(el) => { if (el) el.srcObject = screenStreamRef.current; }} className="w-full h-full object-contain" />
                    </div>
                  )}
                  {Object.entries(remoteScreens).map(([userId, data]) => (
                    <div key={userId} className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-xl cursor-pointer" onClick={() => handleOpenStreamInNewWindow(userId)}>
                      <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">{usernames[userId] || userId}'s Stream</div>
                      <img src={data} alt="Screen Share" className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
                {!isSharingScreen && Object.keys(remoteScreens).length === 0 && (
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-discord-sidebar rounded-full flex items-center justify-center mx-auto text-discord-muted"><Monitor size={40} /></div>
                    <h3 className="text-xl font-bold text-white">No one is sharing their screen</h3>
                    <p className="text-discord-muted max-w-xs mx-auto">Click the screen share icon to start sharing your screen.</p>
                  </div>
                )}
                <div className="max-w-md w-full">
                  <h3 className="text-2xl font-bold text-white mb-2 text-center">Voice Channel: {currentChannel?.name}</h3>
                  {(!isJoinedVoice || (currentVoiceChannel && currentVoiceChannel.id !== currentChannel?.id)) ? (
                    <div className="space-y-4">
                      <p className="text-discord-muted mb-8 text-center">{isJoinedVoice ? `You are in ${currentVoiceChannel?.name}. Join this channel?` : 'Connect to start talking.'}</p>
                      <button onClick={() => { if (isJoinedVoice && currentVoiceChannel?.id !== currentChannel?.id) { setPendingVoiceChannel(currentChannel); setShowSwitchConfirm(true); } else { startVoice(currentChannel); } }} className="px-8 py-3 bg-discord-accent text-white font-bold rounded hover:bg-indigo-500 transition-colors flex items-center gap-2 mx-auto"><Mic size={20} />{isJoinedVoice ? 'Switch Channel' : 'Join Voice'}</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-discord-muted mb-8 text-center">You are connected.</p>
                      <div className="flex items-center justify-center gap-4"><div className="flex flex-col items-center"><div className={cn("w-16 h-16 rounded-full flex items-center justify-center mb-2 transition-all duration-300", isMuted ? "bg-red-500/20 text-red-500" : "bg-green-500/20 text-green-500 animate-pulse")}>{isMuted ? <MicOff size={32} /> : <Mic size={32} />}</div><span className="text-sm font-medium text-discord-text">{isMuted ? 'Muted' : 'Speaking...'}</span></div></div>
                      <button onClick={stopVoice} className="px-8 py-3 bg-red-500 text-white font-bold rounded hover:bg-red-600 transition-colors flex items-center gap-2 mx-auto"><LogOut size={20} />Leave Voice</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {showRightPanel && <RightPanel />}
        </div>
        {currentChannel?.type === 'text' && (
          <div className="p-4 shrink-0 relative">
            <AnimatePresence>
              {showMentionSuggestions && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute bottom-20 left-4 z-50 w-64 bg-discord-guilds border border-black/20 rounded-lg shadow-2xl p-2">
                  <div className="text-sm font-bold text-white mb-2 px-2">Mention a user</div>
                  {mentionSuggestions.map((user, index) => <button key={user} onClick={() => handleMentionSelect(user)} onMouseOver={() => setMentionHighlightIndex(index)} className={cn("w-full text-left px-2 py-1.5 rounded text-sm text-discord-text flex items-center gap-2", index === mentionHighlightIndex ? "bg-discord-accent text-white" : "hover:bg-white/5")}><div className="w-6 h-6 bg-discord-accent rounded-full flex items-center justify-center text-xs">{user.slice(0, 2).toUpperCase()}</div><span style={{ color: getUserColor(user) }}>{user}</span></button>)}
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {showEmojiPicker && <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute bottom-20 right-4 z-50"><EmojiPicker theme={Theme.DARK} onEmojiClick={handleEmojiClick} width={350} height={400} /></motion.div>}
            </AnimatePresence>
            <AnimatePresence>
              {showGifPicker && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute bottom-20 left-4 z-50 w-80 bg-discord-sidebar border border-black/20 rounded-lg shadow-2xl p-4">
                  <div className="flex items-center gap-2 mb-4"><ImageIcon size={20} className="text-discord-muted" /><input type="text" placeholder="Search GIFs..." className="flex-1 bg-discord-dark text-discord-text px-3 py-1.5 rounded focus:outline-none text-sm" value={gifSearch} onChange={(e) => searchGifs(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto no-scrollbar">
                    {gifs.map((url, i) => <button key={i} onClick={() => handleSendMessage(undefined, url)} className="rounded overflow-hidden hover:opacity-80 transition-opacity"><img src={url} alt="GIF" className="w-full h-24 object-cover" /></button>)}
                    {gifs.length === 0 && <div className="col-span-2 py-8 text-center text-discord-muted text-sm italic">Type to search for GIFs</div>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="absolute -top-1 left-4 h-5">
              <AnimatePresence>{currentChannel && typingUsers[currentChannel.id]?.length > 0 && <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="text-[12px] text-discord-muted italic"><span className="font-bold">{typingUsers[currentChannel.id].join(', ')}</span>{typingUsers[currentChannel.id].length === 1 ? ' is typing...' : ' are typing...'}</motion.div>}</AnimatePresence>
            </div>
            <form onSubmit={handleSendMessage} className="relative">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded transition-colors text-discord-muted hover:text-discord-text hover:bg-white/5"><Paperclip size={20} /></button>
                <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleSendMessage(undefined, undefined, e.target.files[0])} className="hidden" />
                <button type="button" onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }} className={cn("p-1.5 rounded transition-colors", showGifPicker ? "text-discord-text bg-white/10" : "text-discord-muted hover:text-discord-text hover:bg-white/5")}><ImageIcon size={20} /></button>
              </div>
              <input ref={inputRef} id="message-input" type="text" value={inputValue} onPaste={handlePaste} onKeyDown={handleInputKeyDown} onChange={handleInputChange} placeholder={editingMessage ? `Editing message...` : `Message #${currentChannel.name}`} className="w-full bg-[#383a40] text-discord-text pl-24 pr-12 py-2.5 rounded-lg focus:outline-none placeholder:text-discord-muted" />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                 {editingMessage && <button type="button" onClick={() => { setEditingMessage(null); setInputValue(''); }} className="p-1.5 rounded transition-colors text-discord-muted hover:text-discord-text hover:bg-white/5" title="Cancel edit"><X size={20} /></button>}
                <button type="button" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }} className={cn("p-1.5 rounded transition-colors", showEmojiPicker ? "text-discord-text bg-white/10" : "text-discord-muted hover:text-discord-text hover:bg-white/5")}><Smile size={20} /></button>
                <button type="submit" className="p-1.5 text-discord-muted hover:text-discord-text transition-colors disabled:opacity-50" disabled={!inputValue.trim() && !editingMessage}><Send size={20} /></button>
              </div>
            </form>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showChannelModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-discord-sidebar w-full max-w-md rounded-lg shadow-2xl overflow-hidden">
              <div className="p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">{editingChannel ? 'Edit Channel' : `Create ${newChannelType} Channel`}</h2>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-discord-muted uppercase">Channel Name</label>
                  <div className="relative"><div className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-muted">{newChannelType === 'text' ? <Hash size={18} /> : <Volume2 size={18} />}</div><input type="text" value={channelNameInput} onChange={(e) => setChannelNameInput(e.target.value)} placeholder="new-channel" className="w-full bg-discord-dark text-discord-text pl-10 pr-4 py-2 rounded focus:outline-none border border-transparent focus:border-discord-accent" autoFocus /></div>
                </div>
              </div>
              <div className="bg-discord-dark p-4 flex justify-end gap-3">
                <button onClick={() => setShowChannelModal(false)} className="px-4 py-2 text-white hover:underline text-sm font-medium">Cancel</button>
                <button onClick={editingChannel ? handleUpdateChannel : handleCreateChannel} disabled={!channelNameInput.trim()} className="px-6 py-2 bg-discord-accent text-white rounded font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{editingChannel ? 'Save Changes' : 'Create Channel'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-discord-dark flex">
            <div className="w-64 bg-discord-sidebar flex flex-col pt-16 px-6 items-end">
              <div className="w-full max-w-[180px] space-y-1">
                <div className="text-[12px] font-bold text-discord-muted uppercase tracking-wider px-2 mb-2">Server Settings</div>
                {hasPermission('ADMINISTRATOR') && <button onClick={() => setSettingsTab('users')} className={cn("w-full text-left px-2 py-1.5 rounded font-medium transition-colors", settingsTab === 'users' ? "bg-white/10 text-white" : "text-discord-muted hover:bg-white/5 hover:text-discord-text")}>Users</button>}
                <button onClick={() => setSettingsTab('roles')} className={cn("w-full text-left px-2 py-1.5 rounded font-medium transition-colors", settingsTab === 'roles' ? "bg-white/10 text-white" : "text-discord-muted hover:bg-white/5 hover:text-discord-text")}>Roles</button>
                <div className="h-[1px] bg-white/10 my-2" />
                <div className="text-[12px] font-bold text-discord-muted uppercase tracking-wider px-2 mb-2">User Settings</div>
                <button onClick={() => setSettingsTab('voice')} className={cn("w-full text-left px-2 py-1.5 rounded font-medium transition-colors", settingsTab === 'voice' ? "bg-white/10 text-white" : "text-discord-muted hover:bg-white/5 hover:text-discord-text")}>Voice & Video</button>
                <button className="w-full text-left px-2 py-1.5 rounded text-discord-muted hover:bg-white/5 hover:text-discord-text font-medium">Appearance</button>
                <button className="w-full text-left px-2 py-1.5 rounded text-discord-muted hover:bg-white/5 hover:text-discord-text font-medium">Accessibility</button>
                <div className="h-[1px] bg-white/10 my-2" />
                <button className="w-full text-left px-2 py-1.5 rounded text-red-400 hover:bg-red-400/10 font-medium">Log Out</button>
              </div>
            </div>
            <div className="flex-1 bg-discord-dark pt-16 px-10 overflow-y-auto">
              <div className="max-w-2xl">
                <div className="flex justify-between items-start mb-8">
                <h2 className="text-xl font-bold text-white uppercase tracking-tight">{settingsTab === 'voice' ? 'Voice & Video' : settingsTab === 'roles' ? 'Roles' : 'User Management'}</h2>
                  <button onClick={() => setShowSettings(false)} className="flex flex-col items-center gap-1 group"><div className="w-9 h-9 rounded-full border-2 border-discord-muted flex items-center justify-center group-hover:bg-white/10 group-hover:border-white transition-all"><Plus size={24} className="text-discord-muted group-hover:text-white rotate-45" /></div><span className="text-[12px] font-bold text-discord-muted group-hover:text-white uppercase">Esc</span></button>
                </div>
                {settingsTab === 'voice' ? (
                  <div className="space-y-8">
                    <section><h3 className="text-[12px] font-bold text-discord-muted uppercase tracking-wider mb-4">Voice Settings</h3><div className="grid grid-cols-2 gap-6"><div className="space-y-2"><label className="text-[12px] font-bold text-discord-muted uppercase">Input Device</label><select className="w-full bg-discord-guilds text-discord-text px-3 py-2 rounded border border-black/20"><option>Default</option></select></div><div className="space-y-2"><label className="text-[12px] font-bold text-discord-muted uppercase">Output Device</label><select className="w-full bg-discord-guilds text-discord-text px-3 py-2 rounded border border-black/20"><option>Default</option></select></div></div></section>
                    <section className="space-y-6"><div className="space-y-3"><div className="flex justify-between items-center"><label className="text-[12px] font-bold text-discord-muted uppercase">Input Volume</label><span className="text-sm text-discord-text">{inputVolume}%</span></div><input type="range" min="0" max="100" value={inputVolume} onChange={(e) => setInputVolume(parseInt(e.target.value))} className="w-full h-2 bg-discord-guilds rounded-lg appearance-none cursor-pointer accent-discord-accent" /></div><div className="space-y-3"><div className="flex justify-between items-center"><label className="text-[12px] font-bold text-discord-muted uppercase">Output Volume</label><span className="text-sm text-discord-text">{outputVolume}%</span></div><input type="range" min="0" max="200" value={outputVolume} onChange={(e) => setOutputVolume(parseInt(e.target.value))} className="w-full h-2 bg-discord-guilds rounded-lg appearance-none cursor-pointer accent-discord-accent" /></div></section>
                    <section className="space-y-6"><h3 className="text-[12px] font-bold text-discord-muted uppercase tracking-wider">Voice Quality</h3><div className="grid grid-cols-2 gap-6"><div className="space-y-2"><label className="text-[12px] font-bold text-discord-muted uppercase">Audio Codec</label><select value={audioCodec} onChange={(e) => setAudioCodec(e.target.value as any)} className="w-full bg-discord-guilds text-discord-text px-3 py-2 rounded border border-black/20"><option value="pcm">PCM</option><option value="opus">Opus</option><option value="aac">AAC</option></select><p className="text-[11px] text-discord-muted">Opus is recommended.</p></div><div className="space-y-2"><label className="text-[12px] font-bold text-discord-muted uppercase">Sample Rate</label><select value={voiceSampleRate} onChange={(e) => setVoiceSampleRate(parseInt(e.target.value))} className="w-full bg-discord-guilds text-discord-text px-3 py-2 rounded border border-black/20"><option value={16000}>16kHz</option><option value={24000}>24kHz</option><option value={44100}>44.1kHz</option><option value={48000}>48kHz</option></select><p className="text-[11px] text-discord-muted">Higher is better.</p></div></div></section>
                    <section className="bg-discord-sidebar p-4 rounded-lg border border-black/10"><h4 className="text-sm font-bold text-white mb-2">Mic Test</h4><p className="text-sm text-discord-muted mb-4">Check your mic. You'll hear yourself back.</p>{isMicTesting && <div className="mb-4 space-y-2"><div className="flex justify-between text-[10px] font-bold text-discord-muted uppercase"><span>Input Level</span><span>{Math.round(micLevel)}%</span></div><div className="h-2 bg-discord-guilds rounded-full overflow-hidden"><motion.div className="h-full bg-green-500" animate={{ width: `${micLevel}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.1 }} /></div></div>}<button onClick={toggleMicTest} className={cn("w-full py-2 font-bold rounded transition-colors", isMicTesting ? "bg-red-500 hover:bg-red-600 text-white" : "bg-discord-accent hover:bg-indigo-500 text-white")}>{isMicTesting ? "Stop Test" : "Let's Check"}</button></section>
                  </div>
                ) : settingsTab === 'roles' ? (
                  <div className="space-y-6"><div className="flex justify-between items-center"><p className="text-sm text-discord-muted">Use roles to group members and assign permissions.</p><button onClick={handleAddRole} className="px-4 py-1.5 bg-discord-accent text-white text-sm font-medium rounded hover:bg-indigo-500 transition-colors flex items-center gap-2"><Plus size={16} />Create Role</button></div><div className="space-y-4"><section className="space-y-4"><h3 className="text-[12px] font-bold text-discord-muted uppercase tracking-wider">Members</h3><div className="space-y-2">{Object.values(usernames).filter(Boolean).map((name) => <div key={name} className="bg-discord-sidebar rounded-lg p-3 border border-black/10 flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-discord-accent rounded-full flex items-center justify-center text-white text-xs">{name.slice(0, 2).toUpperCase()}</div><div><div className="text-sm font-bold text-white">{name}</div><div className="flex flex-wrap gap-1 mt-1">{(allUserRoles[name] || []).map(roleId => { const role = roles.find(r => r.id === roleId); if (!role) return null; return <span key={roleId} className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 group/tag" style={{ borderColor: role.color, color: role.color }}>{role.name}<button onClick={() => handleAssignRole(name, roleId)} className="hover:text-white transition-colors"><X size={10} /></button></span>; })}</div></div></div><div className="flex items-center gap-2"><select className="bg-discord-guilds text-discord-text text-xs px-2 py-1 rounded border border-black/20" onChange={(e) => { if (e.target.value) handleAssignRole(name, e.target.value); e.target.value = ""; }} value=""><option value="" disabled>Add Role...</option>{roles.map(role => <option key={role.id} value={role.id} disabled={(allUserRoles[name] || []).includes(role.id)}>{role.name}</option>)}</select></div></div>)}</div></section><div className="h-[1px] bg-white/10 my-6" /><section className="space-y-4"><h3 className="text-[12px] font-bold text-discord-muted uppercase tracking-wider">Roles</h3>{roles.map((role) => <div key={role.id} className="bg-discord-sidebar rounded-lg p-4 border border-black/10 space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-4 flex-1"><div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: role.color }} /><input type="text" value={role.name} onChange={(e) => handleUpdateRoleName(role.id, e.target.value)} className="bg-transparent text-white font-bold focus:outline-none border-b border-transparent focus:border-discord-accent px-1" /><input type="color" value={role.color} onChange={(e) => handleUpdateRoleColor(role.id, e.target.value)} className="w-8 h-8 bg-transparent border-none cursor-pointer" /></div><button onClick={() => handleDeleteRole(role.id)} className="p-2 text-discord-muted hover:text-red-400 transition-colors"><Trash2 size={18} /></button></div><div className="space-y-3"><h4 className="text-[11px] font-bold text-discord-muted uppercase tracking-wider">Permissions</h4><div className="grid grid-cols-2 gap-2">{PERMISSIONS.map((perm) => <button key={perm} onClick={() => handleTogglePermission(role.id, perm)} className={cn("flex items-center justify-between px-3 py-2 rounded text-sm transition-colors", role.permissions.includes(perm) ? "bg-discord-accent/20 text-discord-accent" : "bg-discord-guilds text-discord-muted hover:bg-white/5")}><span className="truncate">{perm.replace(/_/g, ' ')}</span>{role.permissions.includes(perm) && <Check size={14} />}</button>)}</div></div></div>)}</section></div></div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-discord-muted">Manage server members.</p>
                    </div>
                    <div className="space-y-4">
                      <section className="space-y-4">
                        <h3 className="text-[12px] font-bold text-discord-muted uppercase tracking-wider">Members</h3>
                        <div className="space-y-2">
                          {Object.values(usernames).filter(Boolean).map((name) => (
                            <div key={name} className="bg-discord-sidebar rounded-lg p-3 border border-black/10 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-discord-accent rounded-full flex items-center justify-center text-white text-xs">{name.slice(0, 2).toUpperCase()}</div>
                                <div>
                                  <div className="text-sm font-bold text-white">{name}</div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(allUserRoles[name] || []).map(roleId => {
                                      const role = roles.find(r => r.id === roleId);
                                      if (!role) return null;
                                      return <span key={roleId} className="text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 group/tag" style={{ borderColor: role.color, color: role.color }}>{role.name}</span>;
                                    })}
                                  </div>
                                </div>
                              </div>
                              {name !== username && (
                                <button
                                  onClick={() => handleDeleteUser(name)}
                                  className="px-4 py-1.5 bg-red-500 text-white text-sm font-medium rounded hover:bg-red-600 transition-colors flex items-center gap-2">
                                  <Trash2 size={16} />Delete User
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
