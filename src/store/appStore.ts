import { create } from 'zustand';

interface VoiceSettings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  micSensitivity: number;
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
}

interface AppState {
  selectedServerId: string | null;
  selectedChannelId: string | null;
  selectedDmId: string | null;
  connectedVoiceChannelId: string | null;
  isVoiceMuted: boolean;
  isDeafened: boolean;
  voiceSettings: VoiceSettings;
  notificationSettings: NotificationSettings;
  speakingUsers: Record<string, boolean>;
  isScreenSharing: boolean;
  screenShareQuality: ScreenShareQuality | null;
  localScreenShareStream: MediaStream | null;
  remoteScreenShares: Record<string, MediaStream>;
  viewingScreenShares: Set<string>;
  activeStreamFocus: string | null;
  isRightSidebarOpen: boolean;
  isMobileNavOpen: boolean;
  theme: 'default' | 'neon';
  onlineUserIds: string[];
  voiceParticipants: Record<string, any[]>;
  highlightedMessageId: string | null;
  
  setSelectedServerId: (id: string | null) => void;
  setSelectedChannelId: (id: string | null) => void;
  setSelectedDmId: (id: string | null) => void;
  setConnectedVoiceChannelId: (id: string | null) => void;
  setIsVoiceMuted: (muted: boolean) => void;
  setIsDeafened: (deafened: boolean) => void;
  setVoiceSettings: (settings: Partial<VoiceSettings>) => void;
  setNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  setSpeakingUsers: (users: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  setIsScreenSharing: (isSharing: boolean) => void;
  setScreenShareQuality: (quality: ScreenShareQuality | null) => void;
  setLocalScreenShareStream: (stream: MediaStream | null) => void;
  setRemoteScreenShares: (shares: Record<string, MediaStream> | ((prev: Record<string, MediaStream>) => Record<string, MediaStream>)) => void;
  setViewingScreenShares: (shares: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setActiveStreamFocus: (uid: string | null) => void;
  setIsRightSidebarOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  setIsMobileNavOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  setTheme: (theme: 'default' | 'neon') => void;
  setOnlineUserIds: (ids: string[]) => void;
  setVoiceParticipants: (channelId: string, participants: any[]) => void;
  setHighlightedMessageId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedServerId: null,
  selectedChannelId: null,
  selectedDmId: null,
  connectedVoiceChannelId: null,
  isVoiceMuted: false,
  isDeafened: false,
  voiceSettings: JSON.parse(localStorage.getItem('drocsid-voice-settings') || '{"echoCancellation":true,"noiseSuppression":true,"autoGainControl":true,"micSensitivity":10}'),
  notificationSettings: JSON.parse(localStorage.getItem('drocsid-notification-settings') || '{"desktop":true,"sounds":true,"everyone":true}'),
  speakingUsers: {},
  isScreenSharing: false,
  screenShareQuality: null,
  localScreenShareStream: null,
  remoteScreenShares: {},
  viewingScreenShares: new Set(),
  activeStreamFocus: null,
  isRightSidebarOpen: false,
  isMobileNavOpen: true,
  theme: (localStorage.getItem('drocsid-theme') as 'default' | 'neon') || 'default',
  onlineUserIds: [],
  voiceParticipants: {},
  highlightedMessageId: null,
  
  setSelectedServerId: (id) => set({ selectedServerId: id, selectedChannelId: null, selectedDmId: null, activeStreamFocus: null, isMobileNavOpen: true }),
  setSelectedChannelId: (id) => set({ selectedChannelId: id, selectedDmId: null, activeStreamFocus: null, isMobileNavOpen: false }),
  setSelectedDmId: (id) => set({ selectedDmId: id, selectedServerId: null, selectedChannelId: null, activeStreamFocus: null, isMobileNavOpen: false }),
  setConnectedVoiceChannelId: (id) => set({ connectedVoiceChannelId: id }),
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
  setSpeakingUsers: (users) => set((state) => ({ 
    speakingUsers: typeof users === 'function' ? users(state.speakingUsers) : users 
  })),
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
  setViewingScreenShares: (shares) => set((state) => ({
    viewingScreenShares: typeof shares === 'function' ? shares(state.viewingScreenShares) : shares
  })),
  setActiveStreamFocus: (uid) => set({ activeStreamFocus: uid }),
  setIsRightSidebarOpen: (isOpen) => set((state) => ({
    isRightSidebarOpen: typeof isOpen === 'function' ? isOpen(state.isRightSidebarOpen) : isOpen
  })),
  setIsMobileNavOpen: (isOpen) => set((state) => ({
    isMobileNavOpen: typeof isOpen === 'function' ? isOpen(state.isMobileNavOpen) : isOpen
  })),
  setTheme: (theme) => {
    localStorage.setItem('drocsid-theme', theme);
    set({ theme });
  },
  setOnlineUserIds: (ids: string[]) => set({ onlineUserIds: ids }),
  setVoiceParticipants: (channelId: string, participants: any[]) => set((state) => ({
    voiceParticipants: {
      ...state.voiceParticipants,
      [channelId]: participants
    }
  })),
  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),
}));

