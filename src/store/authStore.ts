import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  currentUserProfile: any | null;
  realUser: User | null;
  realUserProfile: any | null;
  isImpersonating: boolean;
  isAuthReady: boolean;
  setUser: (user: User | null) => void;
  setCurrentUserProfile: (profile: any) => void;
  setAuthReady: (ready: boolean) => void;
  startImpersonation: (user: User, profile: any) => void;
  stopImpersonation: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  currentUserProfile: null,
  realUser: null,
  realUserProfile: null,
  isImpersonating: false,
  isAuthReady: false,
  setUser: (user) => set((state) => {
    // Only update if the user ID or metadata changed to avoid unnecessary re-renders
    if (state.user?.id === user?.id && JSON.stringify(state.user?.user_metadata) === JSON.stringify(user?.user_metadata)) {
      return state;
    }
    // If impersonating, updating user will be ignored to keep impersonator
    if (state.isImpersonating) return state;
    return { user };
  }),
  setCurrentUserProfile: (profile) => set((state) => {
    if (state.isImpersonating) return state;
    return { currentUserProfile: typeof profile === 'function' ? profile(state.currentUserProfile) : profile };
  }),
  setAuthReady: (ready) => set((state) => {
    if (state.isAuthReady && !ready) return state;
    return { isAuthReady: ready };
  }),
  startImpersonation: (impersonateUser, impersonateProfile) => set((state) => {
    return {
      realUser: state.user,
      realUserProfile: state.currentUserProfile,
      user: impersonateUser,
      currentUserProfile: impersonateProfile,
      isImpersonating: true
    };
  }),
  stopImpersonation: () => set((state) => {
    if (!state.isImpersonating) return state;
    return {
      user: state.realUser,
      currentUserProfile: state.realUserProfile,
      realUser: null,
      realUserProfile: null,
      isImpersonating: false
    };
  }),
}));
