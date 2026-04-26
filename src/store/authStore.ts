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
  setUser: (user) => set((state) => {
    // Only update if the user ID or metadata changed to avoid unnecessary re-renders
    if (state.user?.id === user?.id && JSON.stringify(state.user?.user_metadata) === JSON.stringify(user?.user_metadata)) {
      return state;
    }
    return { user };
  }),
  setCurrentUserProfile: (profile) => set((state) => ({ 
    currentUserProfile: typeof profile === 'function' ? profile(state.currentUserProfile) : profile 
  })),
  setAuthReady: (ready) => set((state) => {
    if (state.isAuthReady && !ready) return state;
    return { isAuthReady: ready };
  }),
}));
