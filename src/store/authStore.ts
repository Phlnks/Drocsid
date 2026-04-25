import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  currentUserProfile: any | null;
  isAuthReady: boolean;
  setUser: (user: User | null) => void;
  setCurrentUserProfile: (profile: any) => void;
  setAuthReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  currentUserProfile: null,
  isAuthReady: false,
  setUser: (user) => set({ user }),
  setCurrentUserProfile: (profile) => set((state) => ({ 
    currentUserProfile: typeof profile === 'function' ? profile(state.currentUserProfile) : profile 
  })),
  setAuthReady: (ready) => set({ isAuthReady: ready }),
}));
