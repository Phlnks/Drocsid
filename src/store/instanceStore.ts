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
