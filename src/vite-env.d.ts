/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DOWNLOAD_URL?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_SUPERADMIN_EMAIL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_ENABLE_GOOGLE_AUTH?: string;
  readonly VITE_LIVEKIT_URL?: string;
  readonly VITE_LIVEKIT_TOKEN_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export interface DesktopSourceInfo {
  id: string;
  name: string;
  thumbnail: string;
  type: 'screen' | 'window';
  hwnd: string | null;
  pid: number | null;
  processName: string | null;
  canShareAppAudio: boolean;
}

export interface AppAudioStatusResponse {
  ok: boolean;
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'error';
  error?: string;
}

export interface LoopbackTestStatusResponse {
  ok: boolean;
  status: 'idle' | 'launching' | 'process_running' | 'stopping' | 'error';
  error?: string;
  outputPath?: string | null;
  stopFilePath?: string | null;
  pid?: number | null;
  processName: string | null;  
}

export interface UpdaterStatusData {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  error?: string;
}

declare global {
  interface Window {
    electron?: {
      getDesktopSources: () => Promise<DesktopSourceInfo[]>;
      setBadge: (count: number) => void;
      showNotification: (title: string, body: string) => void;
      onToggleMute: (callback: () => void) => void;
      removeToggleMute: (callback: () => void) => void;
      onToggleDeafen: (callback: () => void) => void;
      removeToggleDeafen: (callback: () => void) => void;
      onDisconnectVoice: (callback: () => void) => void;
      removeDisconnectVoice: (callback: () => void) => void;
      updateShortcuts: (shortcuts: any) => void;
      updateTray: (state: any) => void;
      setLaunchAtStartup: (enabled: boolean) => void;

      startAppAudioCapture: (pid: number) => Promise<AppAudioStatusResponse>;
      stopAppAudioCapture: () => Promise<AppAudioStatusResponse>;
      getAppAudioCaptureStatus: () => Promise<AppAudioStatusResponse>;

      configureLivekitAppAudio: (config: { url: string; token: string }) => Promise<{ ok: boolean; error?: string }>;

      launchLoopbackTest: (pid: number, outputPath?: string) => Promise<LoopbackTestStatusResponse>;
      stopLoopbackTest: () => Promise<LoopbackTestStatusResponse>;
      getLoopbackTestStatus: () => Promise<LoopbackTestStatusResponse>;

      // Auto-updater
      checkForUpdates?: () => Promise<{ ok: boolean; version?: string; error?: string }>;
      restartAndInstall?: (options?: { title?: string; subtitle?: string }) => Promise<void>;
      getAppVersion?: () => Promise<string>;
      onUpdaterStatus?: (callback: (data: UpdaterStatusData) => void) => () => void;
    };
  }
}