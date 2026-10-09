import { create } from 'zustand';

export interface Instance {
  id: string;
  name: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  socketUrl: string;
  livekitUrl?: string;
  livekitTokenEndpoint?: string;
  isFavorite: boolean;
  lastUsed: number;
}

export function exportInstanceToJSON(instance: Instance): string {
  const payload: Record<string, string> = {
    name: instance.name,
    supabaseUrl: instance.supabaseUrl,
    supabaseAnonKey: instance.supabaseAnonKey,
    socketUrl: instance.socketUrl,
  };
  if (instance.livekitUrl) payload.livekitUrl = instance.livekitUrl;
  if (instance.livekitTokenEndpoint) payload.livekitTokenEndpoint = instance.livekitTokenEndpoint;
  return JSON.stringify(payload, null, 2);
}

export function parseInstanceConfig(text: string): {
  name: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  socketUrl: string;
  livekitUrl?: string;
  livekitTokenEndpoint?: string;
} | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // 1. Try direct JSON parsing
  try {
    let cleanText = trimmed;
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(cleanText);
    if (parsed && typeof parsed === 'object') {
      const name = parsed.name || parsed.instanceName || parsed.title || 'Nouvelle Instance';
      const supabaseUrl = parsed.supabaseUrl || parsed.supabase_url || parsed.url || parsed.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = parsed.supabaseAnonKey || parsed.supabase_anon_key || parsed.anonKey || parsed.supabaseKey || parsed.key || parsed.VITE_SUPABASE_PUBLISHABLE_KEY || '';
      const socketUrl = parsed.socketUrl || parsed.socket_url || parsed.backendUrl || parsed.backend_url || parsed.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');
      const livekitUrl = parsed.livekitUrl || parsed.livekit_url || parsed.VITE_LIVEKIT_URL || '';
      const livekitTokenEndpoint = parsed.livekitTokenEndpoint || parsed.livekit_token_endpoint || parsed.tokenEndpoint || parsed.VITE_LIVEKIT_TOKEN_ENDPOINT || '';

      if (supabaseUrl && supabaseAnonKey) {
        return {
          name,
          supabaseUrl,
          supabaseAnonKey,
          socketUrl: socketUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
          livekitUrl: livekitUrl || undefined,
          livekitTokenEndpoint: livekitTokenEndpoint || undefined
        };
      }
    }
  } catch (e) {}

  // 2. Fallback: Parse key-value lines (env vars or YAML-like key: value)
  try {
    const lines = trimmed.split('\n');
    const result: Record<string, string> = {};
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('{') || line.startsWith('}')) continue;
      const sep = line.indexOf(':') !== -1 ? line.indexOf(':') : line.indexOf('=');
      if (sep !== -1) {
        const key = line.substring(0, sep).trim().replace(/^['"]|['"]$/g, '');
        let val = line.substring(sep + 1).trim().replace(/^['"]|['"]$/g, '');
        if (val.endsWith(',')) val = val.slice(0, -1).trim().replace(/^['"]|['"]$/g, '');
        result[key] = val;
      }
    }

    const name = result.name || result.instanceName || result.INSTANCE_NAME || 'Nouvelle Instance';
    const supabaseUrl = result.supabaseUrl || result.supabase_url || result.VITE_SUPABASE_URL || result.url || '';
    const supabaseAnonKey = result.supabaseAnonKey || result.supabase_anon_key || result.supabaseKey || result.anonKey || result.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    const socketUrl = result.socketUrl || result.socket_url || result.backendUrl || result.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const livekitUrl = result.livekitUrl || result.livekit_url || result.VITE_LIVEKIT_URL || '';
    const livekitTokenEndpoint = result.livekitTokenEndpoint || result.livekit_token_endpoint || result.VITE_LIVEKIT_TOKEN_ENDPOINT || '';

    if (supabaseUrl && supabaseAnonKey) {
      return {
        name,
        supabaseUrl,
        supabaseAnonKey,
        socketUrl: socketUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
        livekitUrl: livekitUrl || undefined,
        livekitTokenEndpoint: livekitTokenEndpoint || undefined
      };
    }
  } catch (e) {}

  return null;
}

interface InstanceState {
  instances: Instance[];
  currentInstanceId: string;
  addInstance: (instance: Omit<Instance, 'id' | 'lastUsed'>) => void;
  removeInstance: (id: string) => void;
  updateInstance: (id: string, updates: Partial<Instance>) => void;
  selectInstance: (id: string) => void;
  toggleFavorite: (id: string) => void;
  getCurrentInstance: () => Instance | undefined;
  isCurrentInstanceValid: () => boolean;
}

const DEFAULT_INSTANCE_ID = 'default';

// Get initial instances from localStorage or use defaults from env
const getInitialInstances = (): Instance[] => {
  const saved = localStorage.getItem('drocsid-instances');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse instances from localStorage', e);
    }
  }

  // Default instance from env
  return [{
    id: DEFAULT_INSTANCE_ID,
    name: 'Default Instance',
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    socketUrl: import.meta.env.VITE_BACKEND_URL || window.location.origin,
    isFavorite: true,
    lastUsed: Date.now()
  }];
};

const getInitialCurrentId = (): string => {
  return localStorage.getItem('drocsid-current-instance-id') || DEFAULT_INSTANCE_ID;
};

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: getInitialInstances(),
  currentInstanceId: getInitialCurrentId(),

  addInstance: (instance) => set((state) => {
    const newInstance: Instance = {
      ...instance,
      id: Math.random().toString(36).substring(2, 9),
      lastUsed: Date.now()
    };
    const newInstances = [...state.instances, newInstance];
    localStorage.setItem('drocsid-instances', JSON.stringify(newInstances));
    return { instances: newInstances };
  }),

  removeInstance: (id) => set((state) => {
    if (id === DEFAULT_INSTANCE_ID) return state; // Don't allow removing default
    const newInstances = state.instances.filter(i => i.id !== id);
    localStorage.setItem('drocsid-instances', JSON.stringify(newInstances));
    
    // If we removed the current one, switch back to default
    if (state.currentInstanceId === id) {
      localStorage.setItem('drocsid-current-instance-id', DEFAULT_INSTANCE_ID);
      return { instances: newInstances, currentInstanceId: DEFAULT_INSTANCE_ID };
    }
    return { instances: newInstances };
  }),

  updateInstance: (id, updates) => set((state) => {
    const newInstances = state.instances.map(i => i.id === id ? { ...i, ...updates } : i);
    localStorage.setItem('drocsid-instances', JSON.stringify(newInstances));
    return { instances: newInstances };
  }),

  selectInstance: (id) => set((state) => {
    const instance = state.instances.find(i => i.id === id);
    if (!instance) return state;

    localStorage.setItem('drocsid-current-instance-id', id);
    
    // Update lastUsed
    const newInstances = state.instances.map(i => i.id === id ? { ...i, lastUsed: Date.now() } : i);
    localStorage.setItem('drocsid-instances', JSON.stringify(newInstances));

    // Reload page to re-initialize everything with new config
    // This is the simplest and safest way to ensure all singletons are reset
    window.location.reload();

    return { currentInstanceId: id, instances: newInstances };
  }),

  toggleFavorite: (id) => set((state) => {
    const newInstances = state.instances.map(i => i.id === id ? { ...i, isFavorite: !i.isFavorite } : i);
    localStorage.setItem('drocsid-instances', JSON.stringify(newInstances));
    return { instances: newInstances };
  }),

    getCurrentInstance: () => {
    const state = get();
    return state.instances.find(i => i.id === state.currentInstanceId);
  },

  isCurrentInstanceValid: () => {
    const state = get();
    const current = state.instances.find(i => i.id === state.currentInstanceId);
    if (!current) return false;
    return !!(current.supabaseUrl && current.supabaseAnonKey);
  }
}));
