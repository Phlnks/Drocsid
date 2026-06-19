/// <reference types="vite/client" />

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
    };
  }
}