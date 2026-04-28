import { useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';
import { useInstanceStore } from './store/instanceStore';
import Auth from './components/Auth';
import Layout from './components/Layout';
import { InstanceSetupScreen } from './components/InstanceSetupScreen';
import Toaster from './components/ui/Toaster';
import socket from './lib/socket';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import ThemeManager from './components/ThemeManager';

import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();
  const { user, isAuthReady, setUser, setAuthReady, setCurrentUserProfile } = useAuthStore();
  const { theme, setTheme, setOnlineUserIds, addNotification } = useAppStore();
  const { isCurrentInstanceValid } = useInstanceStore();

  const isInstanceValid = isCurrentInstanceValid();

  useEffect(() => {
    // Migration: If theme is 'default', change it to 'classic'
    if (theme === 'default' as any) {
      setTheme('classic');
      localStorage.setItem('drocsid-theme', 'classic');
    }
  }, [theme, setTheme]);

  useEffect(() => {
    // Handle Capacitor Deep Links
    const setupDeeplinks = async () => {
      CapApp.addListener('appUrlOpen', async (data: any) => {
        console.log('App opened with URL:', data.url);
        const url = new URL(data.url);
        
        // Supabase OAuth returns data in the hash (e.g. #access_token=...)
        const hash = url.hash || (data.url.includes('#') ? data.url.split('#')[1] : null);
        
        if (hash) {
          const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            console.log('Found OAuth tokens in URL, setting session...');
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (!error) {
              console.log('Session set successfully, closing browser');
              await Browser.close();
            } else {
              console.error('Error setting session:', error);
            }
          }
        }
      });
    };

    setupDeeplinks();

    // Check URL for invite code
    const path = window.location.pathname;
    // More robust regex to handle trailing slashes or query parameters
    const match = path.match(/\/invite\/([a-zA-Z0-9]+)(?:[\/#?].*)?$/);
    if (match && match[1]) {
      const code = match[1];
      console.log("Detected invite code in URL:", code);
      sessionStorage.setItem('pending_invite', code);
      window.history.replaceState(null, '', '/');
    }

    // Electron Global Shortcuts (Push-to-Talk alternative)
    if ((window as any).electron) {
      // Send initial keybinds to Electron background
      const initialKeybinds = useAppStore.getState().keybinds;
      (window as any).electron.updateShortcuts(initialKeybinds);

      const handleToggleMute = () => {
        const currentState = useAppStore.getState();
        if (!currentState.isDeafened && currentState.connectedVoiceChannelId) {
          const newState = !currentState.isVoiceMuted;
          currentState.setIsVoiceMuted(newState);
        }
      };

      const handleToggleDeafen = () => {
        const currentState = useAppStore.getState();
        if (currentState.connectedVoiceChannelId) {
          const newState = !currentState.isDeafened;
          currentState.setIsDeafened(newState);
          if (newState && !currentState.isVoiceMuted) {
             currentState.setIsVoiceMuted(true); // Deafening also mutes
          }
        }
      };

      (window as any).electron.onToggleMute(handleToggleMute);
      (window as any).electron.onToggleDeafen(handleToggleDeafen);
      
      return () => {
        (window as any).electron.removeToggleMute(handleToggleMute);
        (window as any).electron.removeToggleDeafen(handleToggleDeafen);
      };
    }
  }, []);

  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (user) {
      const handleConnect = () => {
        if (user && identifiedUserId.current !== user.id) {
          socket.emit('identify', user.id);
          identifiedUserId.current = user.id;
        }
      };

      socket.on('connect', handleConnect);
      
      // Initial identify
      if (socket.connected) {
        handleConnect();
      } else {
        socket.connect();
      }

      const handleOnlineUsers = (userIds: string[]) => {
        setOnlineUserIds(userIds);
      };

      socket.on('online-users', handleOnlineUsers);
      
      // Check for pending invite
      const pendingInvite = sessionStorage.getItem('pending_invite');
      if (pendingInvite) {
        sessionStorage.removeItem('pending_invite');
        const joinServer = async () => {
          try {
            const { data: invite, error } = await supabase.from('invites').select('*').eq('code', pendingInvite).maybeSingle();
            if (error || !invite) {
              addNotification(t('app.invalidInvite'), "error");
              return;
            }

            // Check if expired (if the table had expires_at, but based on schema view it has uses/max_uses)
            // Wait, schema view showed: code, server_id, creator_id, uses, max_uses, created_at
            if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
              addNotification(t('app.invalidInvite'), "error");
              return;
            }
            
            const serverId = invite.server_id;
            const { data: existingMember } = await supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', user.id).maybeSingle();
            
            if (!existingMember) {
              const { error: insertError } = await supabase.from('server_members').insert({
                server_id: serverId,
                user_id: user.id,
                roles: ['member']
              });
              if (insertError) throw insertError;
            }
            // Use the store hook directly inside the component? No, we already destructured what we need?
            // Actually, we need setSelectedServerId. We don't have it destructured.
            useAppStore.getState().setSelectedServerId(serverId);
          } catch (e) {
            console.error("Error joining server via link:", e);
            addNotification(t('app.errorJoinLink'), "error");
          }
        };
        joinServer();
      }

      return () => {
        socket.off('connect', handleConnect);
        socket.off('online-users', handleOnlineUsers);
      };
    }
  }, [user, setOnlineUserIds]);

  useEffect(() => {
    if (!user) return;

    // Fetch initial profile
    const fetchProfile = async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setCurrentUserProfile(data);
      } else if (!error || error.code === 'PGRST116') {
        // Profile missing, ensure it exists
        const { data: upsertedData } = await supabase.from('profiles').upsert({
          id: user.id,
          username: user.user_metadata?.username || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
          status: 'online'
        }).select().maybeSingle();
        if (upsertedData) setCurrentUserProfile(upsertedData);
      }
    };
    fetchProfile();

    // Global profile subscription for current user
    const channel = supabase.channel(`profile_${user.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles', 
        filter: `id=eq.${user.id}` 
      }, (payload) => {
        setCurrentUserProfile((prev: any) => ({ ...prev, ...payload.new }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
      }
      setAuthReady(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth Event:", event);
      if (session?.user) {
        // Use the store's stable setUser which now has internal checks
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setCurrentUserProfile(null);
      }
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []); // Empty array to prevent infinite loop

  const isInIframe = window.self !== window.top;

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isInstanceValid) {
    return (
      <>
        <InstanceSetupScreen />
        <Toaster />
      </>
    );
  }

  if (isInIframe) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white tracking-tight">
              {t('app.readyToChat')}
            </h1>
            <p className="text-zinc-400 text-lg">
              {t('app.openInNewTab')}
            </p>
          </div>
          
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {t('app.launchApp')}
          </button>
          
          <p className="text-zinc-500 text-sm">
            {t('app.secureLogin')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ThemeManager />
      <Toaster />
      {user ? <Layout /> : <Auth />}
    </>
  );
}

