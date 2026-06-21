import { create } from 'zustand';
import { type DesktopSourceInfo } from '../vite-env';

function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function participantsSig(arr: any[] | undefined): string {
  if (!arr || arr.length === 0) return '';
  return arr
    .map(p => `${p.id}:${p.isMuted ? 1 : 0}:${p.isDeafened ? 1 : 0}:${p.isStreaming ? 1 : 0}`)
    .sort()
    .join('|');
}

const isTechnicalParticipant = (id?: string) => !!id && id.endsWith('-appaudio');

interface VoiceSettings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  micSensitivity: number;
  selectedMicrophoneId?: string;
  selectedSpeakerId?: string;
  inputMode?: 'voice_activity' | 'push_to_talk';
}

interface ScreenShareQuality {
  width: number;
  height: number;
  frameRate: number;
}

interface NotificationSettings {
  desktop: boolean;
  sounds: boolean;
  everyone: boolean;
  notifyChatMessages: boolean;
  notifyDms: boolean;
  notifyMentions: boolean;
}

interface Keybinds {
  mute: string;
  deafen: string;
  pushToTalk: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface VoiceParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
  isMuted: boolean;
  isDeafened?: boolean;
  isStreaming: boolean;
  joinedAt: string;
}

interface AppState {
  isSoundsLoading: boolean;
  setSoundsLoading: (loading: boolean) => void;
  callJoinedSoundPlayed: boolean;
  setCallJoinedSoundPlayed: (played: boolean) => void;
  serverSounds: any[];
  canUseSoundboard: boolean;
  setServerSounds: (sounds: any[]) => void;
  setCanUseSoundboard: (can: boolean) => void;
  selectedServerId: string | null;
  selectedChannelId: string | null;
  selectedDmId: string | null;
  connectedVoiceChannelId: string | null;
  connectedVoiceServerId: string | null;
  isVoiceMuted: boolean;
  isDeafened: boolean;
  voiceSettings: VoiceSettings;
  isPTTActive: boolean;
  setIsPTTActive: (active: boolean) => void;
  notificationSettings: NotificationSettings;
  mutedServers: string[];
  mutedDms: string[];
  keybinds: Keybinds;
  isScreenSharing: boolean;
  screenShareQuality: ScreenShareQuality | null;
  localScreenShareStream: MediaStream | null;
  
  activeShareSource: DesktopSourceInfo | null;
  loopbackStatus: 'idle' | 'launching' | 'process_running' | 'stopping' | 'error';
  loopbackOutputPath: string | null;
  loopbackError: string | null;
  screenShareHasAudio: boolean;
  
  remoteScreenShares: Record<string, MediaStream>;
  remoteScreenShareAudioTracks: Record<string, any>;
  viewingScreenShares: Set<string>;
  activeStreamFocus: string | null;
  isRightSidebarOpen: boolean;
  isMobileNavOpen: boolean;
  mobileTab: 'messages' | 'servers' | 'channels' | 'notifications' | 'profile';
  theme: 'classic' | 'neon' | 'ocean' | 'forest' | 'sunset' | 'dracula' | 'synthwave' | 'nord' | 'monokai' | 'cyberpunk' | 'custom';
  customTheme: {
    primaryColor: string;
    intensity: number;
    appearance: 'dark' | 'light';
  };
  onlineUserIds: string[];
  voiceParticipants: Record<string, VoiceParticipant[]>;
  livekitParticipantIdentities: Set<string>; // ✅ Truth from LiveKit
  globalProfiles: Record<string, any>;
  highlightedMessageId: string | null;
  notifications: Notification[];
  drafts: Record<string, string>;
  soundboardVolume: number;
  isSoundboardMuted: boolean;
  voiceVolume: number;
  isVoiceVolumeMuted: boolean;
  streamVolume: number;
  isStreamVolumeMuted: boolean;
  peerVolumes: Record<string, number>;
  setPeerVolume: (peerId: string, volume: number) => void;
  setStreamVolume: (volume: number) => void;
  setIsStreamVolumeMuted: (muted: boolean) => void;
  serverSettingsModal: {
    isOpen: boolean;
    serverId: string | null;
    initialTab: 'overview' | 'roles' | 'members' | 'invites' | 'channels' | 'emojis' | 'logs' | 'soundboard' | null;
  };
  appSettings: {
    launchAtStartup: boolean;
    dateFormat: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';
    timeFormat: 'HH:mm' | 'hh:mm a';
  };
  serverOrder: string[];
  
  setServerOrder: (order: string[]) => void;
  setSelectedServerId: (id: string | null) => void;
  setSelectedChannelId: (id: string | null) => void;
  setSelectedDmId: (id: string | null) => void;
  setConnectedVoiceChannelId: (id: string | null, serverId?: string | null) => void;
  setIsVoiceMuted: (muted: boolean) => void;
  setIsDeafened: (deafened: boolean) => void;
  setVoiceSettings: (settings: Partial<VoiceSettings>) => void;
  setNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  setAppSettings: (settings: Partial<AppState['appSettings']>) => void;
  setSoundboardVolume: (volume: number) => void;
  setIsSoundboardMuted: (muted: boolean) => void;
  setVoiceVolume: (volume: number) => void;
  setIsVoiceVolumeMuted: (muted: boolean) => void;
  setServerSettingsModal: (config: Partial<AppState['serverSettingsModal']>) => void;
  toggleMuteServer: (serverId: string) => void;
  toggleMuteDm: (dmId: string) => void;
  setKeybinds: (keybinds: Partial<Keybinds>) => void;
  setIsScreenSharing: (isSharing: boolean) => void;
  setScreenShareQuality: (quality: ScreenShareQuality | null) => void;
  setLocalScreenShareStream: (stream: MediaStream | null) => void;
  setRemoteScreenShares: (shares: Record<string, MediaStream> | ((prev: Record<string, MediaStream>) => Record<string, MediaStream>)) => void;
  setRemoteScreenShareAudioTracks: (tracks: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  setViewingScreenShares: (shares: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setActiveStreamFocus: (uid: string | null) => void;
  setActiveShareSource: (source: DesktopSourceInfo | null) => void;
  setLoopbackStatus: (status: 'idle' | 'launching' | 'process_running' | 'stopping' | 'error') => void;
  setLoopbackOutputPath: (path: string | null) => void;
  setLoopbackError: (error: string | null) => void;
  setScreenShareHasAudio: (hasAudio: boolean) => void;
  setIsRightSidebarOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  setIsMobileNavOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  setTheme: (theme: 'classic' | 'neon' | 'ocean' | 'forest' | 'sunset' | 'dracula' | 'synthwave' | 'nord' | 'monokai' | 'cyberpunk' | 'custom') => void;
  setCustomTheme: (theme: Partial<AppState['customTheme']>) => void;
  setOnlineUserIds: (ids: string[]) => void;
  setVoiceParticipants: (channelId: string, participants: VoiceParticipant[]) => void;
  setGlobalProfile: (profile: any) => void;
  setGlobalProfiles: (profiles: any[]) => void;
  syncVoiceParticipantsWithLiveKit: (channelId: string, identities: string[]) => void;
  setHighlightedMessageId: (id: string | null) => void;
  setDraft: (id: string, content: string) => void;
  addNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeNotification: (id: string) => void;
  setMobileTab: (tab: 'messages' | 'servers' | 'channels' | 'notifications' | 'profile') => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSoundsLoading: false,
  setSoundsLoading: (loading) => set({ isSoundsLoading: loading }),
  callJoinedSoundPlayed: false,
  setCallJoinedSoundPlayed: (played) => set({ callJoinedSoundPlayed: played }),
  serverSounds: [],
  canUseSoundboard: false,
  selectedServerId: null,
  selectedChannelId: null,
  selectedDmId: null,
  connectedVoiceChannelId: null,
  connectedVoiceServerId: null,
  isVoiceMuted: false,
  isDeafened: false,
  isPTTActive: false,
  setIsPTTActive: (active) => set({ isPTTActive: active }),
  voiceSettings: safeParse('drocsid-voice-settings', { echoCancellation: true, noiseSuppression: true, autoGainControl: true, micSensitivity: 25, inputMode: 'voice_activity' }),
  notificationSettings: safeParse('drocsid-notification-settings', { desktop: true, sounds: true, everyone: true, notifyChatMessages: true, notifyDms: true, notifyMentions: true }),
  mutedServers: safeParse('drocsid-muted-servers', []),
  mutedDms: safeParse('drocsid-muted-dms', []),
  isScreenSharing: false,
  screenShareQuality: null,
  localScreenShareStream: null,

  activeShareSource: null,
  loopbackStatus: 'idle',
  loopbackOutputPath: null,
  loopbackError: null,
  screenShareHasAudio: false,

  remoteScreenShares: {},
  remoteScreenShareAudioTracks: {},
  viewingScreenShares: new Set(),
  activeStreamFocus: null,
  isRightSidebarOpen: false,
  isMobileNavOpen: true,
  mobileTab: 'messages',
  theme: (localStorage.getItem('drocsid-theme') as 'classic' | 'neon' | 'ocean' | 'forest' | 'sunset' | 'dracula' | 'synthwave' | 'nord' | 'monokai' | 'cyberpunk' | 'custom') || 'classic',
  customTheme: safeParse('drocsid-custom-theme', { primaryColor: '#5865F2', intensity: 75, appearance: 'dark' }),
  onlineUserIds: [],
  voiceParticipants: {},
  livekitParticipantIdentities: new Set(),
  globalProfiles: {},
  highlightedMessageId: null,
  notifications: [],
  drafts: safeParse('drocsid-drafts', {}),
  soundboardVolume: safeParse('drocsid-soundboard-volume', 0.1),
  isSoundboardMuted: safeParse('drocsid-soundboard-muted', false),
  voiceVolume: safeParse('drocsid-voice-volume', 1.0),
  isVoiceVolumeMuted: safeParse('drocsid-voice-volume-muted', false),
  streamVolume: safeParse('drocsid-stream-volume', 1.0),
  isStreamVolumeMuted: safeParse('drocsid-stream-volume-muted', false),
  peerVolumes: safeParse('drocsid-peer-volumes', {}),
  serverSettingsModal: {
    isOpen: false,
    serverId: null,
    initialTab: null
  },
  keybinds: safeParse('drocsid-keybinds', { mute: 'CommandOrControl+Shift+M', deafen: 'CommandOrControl+Shift+D', pushToTalk: '' }),
  appSettings: safeParse('drocsid-app-settings', { launchAtStartup: false, dateFormat: 'dd/MM/yyyy', timeFormat: 'HH:mm' }),
  serverOrder: safeParse('drocsid-server-order', []),
  
  setServerOrder: (order) => set(() => {
    localStorage.setItem('drocsid-server-order', JSON.stringify(order));
    return { serverOrder: order };
  }),
  setServerSounds: (sounds) => set({ serverSounds: sounds }),
  setCanUseSoundboard: (can) => set({ canUseSoundboard: can }),
  setSelectedServerId: (id) => set((state) => {
    if (state.selectedServerId === id && id !== null) return state;
    return { selectedServerId: id, selectedChannelId: null, selectedDmId: null, activeStreamFocus: null, isMobileNavOpen: true };
  }),
  setSelectedChannelId: (id) => set({ selectedChannelId: id, selectedDmId: null, activeStreamFocus: null, isMobileNavOpen: false }),
  setSelectedDmId: (id) => set({ selectedDmId: id, selectedServerId: null, selectedChannelId: null, activeStreamFocus: null, isMobileNavOpen: false }),
  setConnectedVoiceChannelId: (id, serverId = null) => {
    const state = useAppStore.getState();
    // Reset call joined sound flag when joining or leaving
    if (id !== state.connectedVoiceChannelId) {
      set({ callJoinedSoundPlayed: false });
    }
    if (!id) {
      set({ livekitParticipantIdentities: new Set() });
    }
    set({ connectedVoiceChannelId: id, connectedVoiceServerId: serverId });
  },
  setIsVoiceMuted: (muted) => set({ isVoiceMuted: muted }),
  setIsDeafened: (deafened) => set({ isDeafened: deafened }),
  setVoiceSettings: (settings) => set((state) => {
    const newSettings = { ...state.voiceSettings, ...settings };
    localStorage.setItem('drocsid-voice-settings', JSON.stringify(newSettings));
    return { voiceSettings: newSettings };
  }),
  setNotificationSettings: (settings) => set((state) => {
    const newSettings = { ...state.notificationSettings, ...settings };
    localStorage.setItem('drocsid-notification-settings', JSON.stringify(newSettings));
    return { notificationSettings: newSettings };
  }),
  setAppSettings: (settings) => set((state) => {
    const newSettings = { ...state.appSettings, ...settings };
    localStorage.setItem('drocsid-app-settings', JSON.stringify(newSettings));
    
    // Notify Electron about startup preference if it changed
    if ((window as any).electron && typeof (window as any).electron.setLaunchAtStartup === 'function' && settings.hasOwnProperty('launchAtStartup')) {
        (window as any).electron.setLaunchAtStartup(newSettings.launchAtStartup);
    }
    
    return { appSettings: newSettings };
  }),
  setServerSettingsModal: (config) => set((state) => ({
    serverSettingsModal: { ...state.serverSettingsModal, ...config }
  })),
  toggleMuteServer: (serverId) => set((state) => {
    const isMuted = state.mutedServers.includes(serverId);
    const newMuted = isMuted 
      ? state.mutedServers.filter(id => id !== serverId)
      : [...state.mutedServers, serverId];
    localStorage.setItem('drocsid-muted-servers', JSON.stringify(newMuted));
    return { mutedServers: newMuted };
  }),
  toggleMuteDm: (dmId) => set((state) => {
    const isMuted = state.mutedDms.includes(dmId);
    const newMuted = isMuted 
      ? state.mutedDms.filter(id => id !== dmId)
      : [...state.mutedDms, dmId];
    localStorage.setItem('drocsid-muted-dms', JSON.stringify(newMuted));
    return { mutedDms: newMuted };
  }),
  setKeybinds: (keybinds) => set((state) => {
    const newKeybinds = { ...state.keybinds, ...keybinds };
    localStorage.setItem('drocsid-keybinds', JSON.stringify(newKeybinds));
    
    // Notify Electron immediately
    if ((window as any).electron && typeof (window as any).electron.updateShortcuts === 'function') {
        (window as any).electron.updateShortcuts(newKeybinds);
    }
    
    return { keybinds: newKeybinds };
  }),
  setIsScreenSharing: (isSharing) => set({ isScreenSharing: isSharing }),
  setScreenShareQuality: (quality) => set({ screenShareQuality: quality }),
  setLocalScreenShareStream: (stream) => set((state) => {
    if (stream === null && state.localScreenShareStream) {
      state.localScreenShareStream.getTracks().forEach(track => {
        track.stop();
      });
    }
    return { localScreenShareStream: stream };
  }),
  setRemoteScreenShares: (shares) => set((state) => {
    const newShares = typeof shares === 'function' ? shares(state.remoteScreenShares) : shares;
    // Clean up removed remote streams
    Object.keys(state.remoteScreenShares).forEach(uid => {
      if (!newShares[uid] && state.remoteScreenShares[uid]) {
        state.remoteScreenShares[uid].getTracks().forEach(track => track.stop());
      }
    });
    return { remoteScreenShares: newShares };
  }),
  setRemoteScreenShareAudioTracks: (tracks) => set((state) => ({
    remoteScreenShareAudioTracks:
      typeof tracks === 'function' ? tracks(state.remoteScreenShareAudioTracks) : tracks
  })),
  setViewingScreenShares: (shares) => set((state) => ({
    viewingScreenShares: typeof shares === 'function' ? shares(state.viewingScreenShares) : shares
  })),
  setActiveStreamFocus: (uid) => set({ activeStreamFocus: uid }),
  setIsRightSidebarOpen: (isOpen) => set((state) => ({
    isRightSidebarOpen: typeof isOpen === 'function' ? isOpen(state.isRightSidebarOpen) : isOpen
  })),
  setActiveShareSource: (source) => set({ activeShareSource: source }),
  setLoopbackStatus: (status) => set({ loopbackStatus: status }),
  setLoopbackOutputPath: (path) => set({ loopbackOutputPath: path }),
  setLoopbackError: (error) => set({ loopbackError: error }),
  setScreenShareHasAudio: (hasAudio) => set({ screenShareHasAudio: hasAudio }),
  setIsMobileNavOpen: (isOpen) => set((state) => ({
    isMobileNavOpen: typeof isOpen === 'function' ? isOpen(state.isMobileNavOpen) : isOpen
  })),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setSoundboardVolume: (volume) => set(() => {
    localStorage.setItem('drocsid-soundboard-volume', JSON.stringify(volume));
    return { soundboardVolume: volume };
  }),
  setIsSoundboardMuted: (muted) => set(() => {
    localStorage.setItem('drocsid-soundboard-muted', JSON.stringify(muted));
    return { isSoundboardMuted: muted };
  }),
  setVoiceVolume: (volume) => set(() => {
    localStorage.setItem('drocsid-voice-volume', JSON.stringify(volume));
    return { voiceVolume: volume };
  }),
  setIsVoiceVolumeMuted: (muted) => set(() => {
    localStorage.setItem('drocsid-voice-volume-muted', JSON.stringify(muted));
    return { isVoiceVolumeMuted: muted };
  }),
  setPeerVolume: (peerId, volume) => set((state) => {
    const newPeerVolumes = { ...state.peerVolumes, [peerId]: volume };
    localStorage.setItem('drocsid-peer-volumes', JSON.stringify(newPeerVolumes));
    return { peerVolumes: newPeerVolumes };
  }),
	setStreamVolume: (volume) => set(() => {
	  localStorage.setItem('drocsid-stream-volume', JSON.stringify(volume));
	  return { streamVolume: volume };
	}),
	setIsStreamVolumeMuted: (muted) => set(() => {
	  localStorage.setItem('drocsid-stream-volume-muted', JSON.stringify(muted));
	  return { isStreamVolumeMuted: muted };
	}),
  setTheme: (theme) => {
    localStorage.setItem('drocsid-theme', theme);
    set({ theme });
  },
  setCustomTheme: (customTheme) => set((state) => {
    const newCustomTheme = { ...state.customTheme, ...customTheme };
    localStorage.setItem('drocsid-custom-theme', JSON.stringify(newCustomTheme));
    return { customTheme: newCustomTheme };
  }),
  setOnlineUserIds: (ids: string[]) => set({ onlineUserIds: ids }),
  setVoiceParticipants: (channelId: string, participants: any[]) => set((state) => {
  const sanitized = participants.filter(p => !isTechnicalParticipant(p.id));
  const current = state.voiceParticipants[channelId];
  
  const finalParticipants = sanitized;
  const socketIds = new Set(sanitized.map(p => p.id));
  const missingLiveKitUsers = Array.from(state.livekitParticipantIdentities).filter(id => !socketIds.has(id));

  if (participantsSig(current) === participantsSig(finalParticipants)) return state;

  // Charger les profils manquants en arrière-plan
  const currentProfiles = state.globalProfiles;
  const missingProfileIds = finalParticipants
    .map(p => p.id)
    .filter(id => !currentProfiles[id] && !isTechnicalParticipant(id));

  if (missingProfileIds.length > 0) {
    import('../supabase').then(({ supabase }) => {
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', missingProfileIds)
        .then(({ data }) => {
          if (data && data.length > 0) {
            useAppStore.getState().setGlobalProfiles(data);
          }
        });
    });
  }

  return {
    voiceParticipants: {
      ...state.voiceParticipants,
      [channelId]: finalParticipants
    }
  };
}),
  setGlobalProfile: (profile: any) => set((state) => ({
    globalProfiles: { ...state.globalProfiles, [profile.id]: profile }
  })),
  setGlobalProfiles: (profiles: any[]) => set((state) => {
    const newProfiles = { ...state.globalProfiles };
    profiles.forEach(p => {
      newProfiles[p.id] = p;
    });
    return { globalProfiles: newProfiles };
  }),
  syncVoiceParticipantsWithLiveKit: (channelId, identities) => set((state) => {
    const cleanIdentities = identities.filter(id => !isTechnicalParticipant(id));
	const current = state.voiceParticipants[channelId] || [];
    const activeIds = new Set(cleanIdentities);
    
    // 1. Filter out participants who are definitely not in LiveKit anymore
    const filtered = current.filter(p => activeIds.has(p.id));
    
    // 2. Identify missing participants
    const existingIds = new Set(filtered.map(p => p.id));
    const missingIds = cleanIdentities.filter(id => !existingIds.has(id));
    
    // Update the "Truth" set
    const nextIdentities = new Set(cleanIdentities);

    if (missingIds.length === 0 && filtered.length === current.length && 
        cleanIdentities.length === state.livekitParticipantIdentities.size &&
        cleanIdentities.every(id => state.livekitParticipantIdentities.has(id))) {
      return state;
    }
    
    const next = [...filtered];
    missingIds.forEach(id => {
      const profile = state.globalProfiles[id];
      next.push({
        id,
        name: profile?.username || profile?.display_name || 'Utilisateur',
        avatarUrl: profile?.avatar_url,
        isMuted: false, // Default till update
        isStreaming: false,
        joinedAt: new Date().toISOString()
      });
    });
    
    return {
      livekitParticipantIdentities: nextIdentities,
      voiceParticipants: {
        ...state.voiceParticipants,
        [channelId]: next
      }
    };
  }),
  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),
  setDraft: (id, content) => set((state) => {
    const newDrafts = { ...state.drafts, [id]: content };
    if (!content) delete newDrafts[id];
    localStorage.setItem('drocsid-drafts', JSON.stringify(newDrafts));
    return { drafts: newDrafts };
  }),
  addNotification: (message, type = 'success') => set((state) => {
    const id = Math.random().toString(36).substring(2, 9);
    return { notifications: [...state.notifications, { id, message, type }] };
  }),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),
}));

