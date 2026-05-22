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
import { playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound, playPTTActivateSound, playPTTDeactivateSound } from './lib/sounds';
import { Routes, Route } from 'react-router-dom';
import DownloadPage from './pages/DownloadPage';
import { getAudioUrl } from './lib/audioCache';

import { useTranslation } from 'react-i18next';

function MainAppContent() {
  const { t } = useTranslation();
  const { user, isAuthReady, isImpersonating, currentUserProfile, stopImpersonation } = useAuthStore();
  const { isCurrentInstanceValid } = useInstanceStore();
  const isInstanceValid = isCurrentInstanceValid();

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isInstanceValid) {
    return <InstanceSetupScreen />;
  }

  const isInIframe = window.self !== window.top;

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
      {isImpersonating && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm font-semibold flex items-center justify-center gap-4 z-50 relative shadow-md shrink-0">
          <span>You are currently impersonating {currentUserProfile?.username || 'a user'}.</span>
          <button 
            onClick={() => stopImpersonation()}
            className="px-3 py-1 bg-amber-950 text-amber-500 hover:text-amber-400 rounded hover:bg-amber-900 transition-colors"
          >
            Stop Impersonating
          </button>
        </div>
      )}
      {user ? <Layout /> : <Auth />} 
    </>
  );
}

export default function App() {
  const { t } = useTranslation();
  const { user, isAuthReady, setUser, setAuthReady, setCurrentUserProfile } = useAuthStore();
  const { theme, setTheme, setOnlineUserIds, addNotification, connectedVoiceChannelId, isVoiceMuted, isDeafened } = useAppStore();
  const { isCurrentInstanceValid } = useInstanceStore();

  const isInstanceValid = isCurrentInstanceValid();

  useEffect(() => {
    // Soundboard listener (Global)
    const handleSoundPlayed = (data: { soundId: string, channelId: string, userId: string, soundUrl: string }) => {
      const state = useAppStore.getState();
      const connectedVoiceChannelId = state.connectedVoiceChannelId;
      const isDeafened = state.isDeafened;
      const isSoundboardMuted = state.isSoundboardMuted;
      const soundboardVolume = state.soundboardVolume;
      const currentUser = useAuthStore.getState().user;

      console.log("Soundboard: Global listener received event", data);
      
      if (!connectedVoiceChannelId) {
        console.log("Soundboard: User not in a voice channel, ignoring.");
        return;
      }

      const isSameChannel = data.channelId === connectedVoiceChannelId;
      const isNotMe = data.userId !== currentUser?.id;
      
      console.log("Soundboard: Global receiver checks", { 
        isSameChannel, 
        isDeafened, 
        isNotMe, 
        isSoundboardMuted, 
        connectedVoiceChannelId,
        dataChannelId: data.channelId,
        myUserId: currentUser?.id
      });

      if (isSameChannel && !isDeafened && isNotMe && !isSoundboardMuted) {
        console.log("Soundboard: Playing broadcast sound:", data.soundUrl);
        getAudioUrl(data.soundUrl).then(urlToPlay => {
          const audio = new Audio(urlToPlay);
          audio.volume = soundboardVolume;
          audio.play()
            .then(() => console.log("Soundboard: Playback success"))
            .catch(err => console.error("Soundboard: Playback failed", err));
        }).catch(err => console.error("Soundboard: Cache failed", err));
      }
    };

    console.log("Soundboard: Registering global socket event 'v1.1'");
    socket.on('soundboard-sound-played', handleSoundPlayed);
    
    // Server kick listener
    const handleServerKick = async (data: { serverId: string }) => {
      const state = useAppStore.getState();
      const { selectedServerId, setSelectedServerId, connectedVoiceChannelId, setConnectedVoiceChannelId, addNotification } = state;

      if (selectedServerId === data.serverId) {
        addNotification(t('notifications.kickedFromServer', 'Vous avez été exclu du serveur'), "error");
        setSelectedServerId(null);
      }

      // If connected to a voice channel in this server, disconnect
      if (connectedVoiceChannelId) {
        const { data: channel } = await supabase.from('channels').select('server_id').eq('id', connectedVoiceChannelId).maybeSingle();
        if (channel && channel.server_id === data.serverId) {
          setConnectedVoiceChannelId(null);
        }
      }
    };

    socket.on('server-kick', handleServerKick);

    return () => {
      socket.off('soundboard-sound-played', handleSoundPlayed);
      socket.off('server-kick', handleServerKick);
    };
  }, []);

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

    // Global Shortcuts (Browser + Electron Push-to-Talk alternative)
    const handleToggleMute = () => {
      const currentState = useAppStore.getState();
      if (!currentState.isDeafened && currentState.connectedVoiceChannelId) {
        const newState = !currentState.isVoiceMuted;
        if (newState) {
          playMuteSound();
        } else {
          playUnmuteSound();
        }
        currentState.setIsVoiceMuted(newState);
      }
    };

    const handleToggleDeafen = () => {
      const currentState = useAppStore.getState();
      if (currentState.connectedVoiceChannelId) {
        const newState = !currentState.isDeafened;
        if (newState) {
          playDeafenSound();
        } else {
          playUndeafenSound();
        }
        currentState.setIsDeafened(newState);
        if (newState && !currentState.isVoiceMuted) {
           currentState.setIsVoiceMuted(true); // Deafening also mutes
        }
      }
    };

    if ((window as any).electron) {
      // Send initial keybinds to Electron background
      const initialKeybinds = useAppStore.getState().keybinds;
      (window as any).electron.updateShortcuts(initialKeybinds);
      (window as any).electron.onToggleMute(handleToggleMute);
      (window as any).electron.onToggleDeafen(handleToggleDeafen);
    }

    const checkShortcut = (e: KeyboardEvent, shortcut: string) => {
      if (!shortcut) return false;
      const parts = shortcut.split('+');
      const requiresCtrl = parts.includes('CommandOrControl');
      const requiresAlt = parts.includes('Alt');
      const requiresShift = parts.includes('Shift');
      const key = parts[parts.length - 1];
      
      if (requiresCtrl && !e.ctrlKey && !e.metaKey) return false;
      if (requiresAlt && !e.altKey) return false;
      if (requiresShift && !e.shiftKey) return false;
      
      let pressedKey = e.key;
      if (pressedKey === ' ') pressedKey = 'Space';
      if (pressedKey.length === 1) pressedKey = pressedKey.toUpperCase();
      
      return pressedKey === key;
    };

    const isInputFocusedMode = () => {
      const activeEl = document.activeElement as HTMLElement;
      if (!activeEl) return false;
      return ['INPUT', 'TEXTAREA'].includes(activeEl.tagName) || activeEl.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifierOnly = e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta';
      if (isModifierOnly) return; 
      
      const { keybinds } = useAppStore.getState();
      const inInput = isInputFocusedMode();
      // Allow function keys or combo with modifiers even if input is focused. 
      // Do not block single character shortcuts (like V) if we are typing.
      const isPrintableSingleChar = !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1;

      if (checkShortcut(e, keybinds.mute)) {
         if (inInput && isPrintableSingleChar) return;
         e.preventDefault();
         handleToggleMute();
      } else if (checkShortcut(e, keybinds.deafen)) {
         if (inInput && isPrintableSingleChar) return;
         e.preventDefault();
         handleToggleDeafen();
      } else if (checkShortcut(e, keybinds.pushToTalk)) {
         if (inInput && isPrintableSingleChar) return;
         const currentState = useAppStore.getState();
         if (!currentState.isPTTActive && currentState.connectedVoiceChannelId) {
             playPTTActivateSound();
             currentState.setIsPTTActive(true);
         }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const { keybinds, isPTTActive, setIsPTTActive } = useAppStore.getState();
      if (checkShortcut(e, keybinds.pushToTalk)) {
         if (isPTTActive) {
            playPTTDeactivateSound();
            setIsPTTActive(false);
         }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      if ((window as any).electron) {
        (window as any).electron.removeToggleMute(handleToggleMute);
        (window as any).electron.removeToggleDeafen(handleToggleDeafen);
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ─── Tray sync — mute / deafen / déconnexion ──────────────────────────────
  useEffect(() => {
    if (!(window as any).electron?.updateTray) return;
    (window as any).electron.updateTray({
      inVoice: !!connectedVoiceChannelId,
      isMuted: isVoiceMuted,
      isDeafened,
      isSpeaking: false,
    });
  }, [connectedVoiceChannelId, isVoiceMuted, isDeafened]);

  useEffect(() => {
    if (user) {
      const handleConnect = () => {
        if (user) {
          socket.emit('identify', user.id);
        }
      };

      socket.on('connect', handleConnect);
      
      // Initial identify
      if (socket.connected) {
        handleConnect();        
      } else {
        socket.connect();
      }

      // ── Web Push : s'abonner aux notifications ──────────────────────
      import('./lib/usePushNotifications').then(({ subscribeToPush }) => {
        subscribeToPush(user.id);
      });
      // ───────────────────────────────────────────────────────────────

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

            // Fetch server details to get default role
            const { data: serverData } = await supabase.from('servers').select('default_role_id').eq('id', serverId).maybeSingle();

            // Check if banned
            const { data: ban } = await supabase.from('server_bans').select('*').eq('server_id', serverId).eq('user_id', user.id).maybeSingle();
            if (ban) {
              addNotification(t('app.bannedFromServer'), "error");
              return;
            }

            const { data: existingMember } = await supabase.from('server_members').select('*').eq('server_id', serverId).eq('user_id', user.id).maybeSingle();
            
            if (!existingMember) {
              const roles = ['member'];
              if (serverData?.default_role_id) {
                roles.push(serverData.default_role_id);
              }

              const { error: insertError } = await supabase.from('server_members').insert({
                server_id: serverId,
                user_id: user.id,
                roles: roles
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
        
        let updates: any = {};
        if (user.email && data.email !== user.email) {
          updates.email = user.email;
        }
        if (user.email === 'phinks07@gmail.com' && (!data.is_superadmin || !data.can_create_servers)) {
          updates.is_superadmin = true;
          updates.can_create_servers = true;
          updates.server_limit = 100;
        }
        
        if (Object.keys(updates).length > 0) {
          // Sync profile fields in background
          supabase.from('profiles').update(updates).eq('id', user.id).then();
        }
      } else if (!error || error.code === 'PGRST116') {
        // Profile missing, ensure it exists
        const isSuperadmin = user.email === 'phinks07@gmail.com';
        const { data: upsertedData } = await supabase.from('profiles').upsert({
          id: user.id,
          username: user.user_metadata?.username || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
          email: user.email,
          status: 'online',
          is_superadmin: isSuperadmin,
          can_create_servers: isSuperadmin,
          server_limit: isSuperadmin ? 100 : 5
        }).select().maybeSingle();
        if (upsertedData) setCurrentUserProfile(upsertedData);
      }
    };
    fetchProfile();

    // Charger uniquement les profils des serveurs où l'utilisateur est membre
	const fetchRelevantProfiles = async () => {
	  // 1. Récupérer les serveurs de l'utilisateur
	  const { data: memberships } = await supabase
		.from('server_members')
		.select('server_id')
		.eq('user_id', user.id)

	  if (!memberships || memberships.length === 0) return

	  const serverIds = memberships.map(m => m.server_id)

	  // 2. Récupérer uniquement les membres de ces serveurs
	  const { data: serverMembers } = await supabase
		.from('server_members')
		.select('user_id')
		.in('server_id', serverIds)

	  if (!serverMembers) return

	  const userIds = [...new Set(serverMembers.map(m => m.user_id))]

	  // 3. Charger uniquement ces profils
	  const { data: profiles } = await supabase
		.from('profiles')
		.select('*')
		.in('id', userIds)

	  if (profiles) useAppStore.getState().setGlobalProfiles(profiles)
	}
	fetchRelevantProfiles()

    // Global profile subscription for all users
    const channelName = `global_profiles_listener_${user.id}`;
    supabase.getChannels().forEach(c => {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    });
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'profiles'
      }, (payload) => {
        if (payload.new && Object.keys(payload.new).length > 0) {
          useAppStore.getState().setGlobalProfile(payload.new);
        }
        if (payload.new && (payload.new as any).id === user.id) {
          setCurrentUserProfile((prev: any) => ({ ...prev, ...payload.new }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth Event:", event);
      if (session?.user) {
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
      <Toaster />
      <Routes>
        <Route path="/download" element={<DownloadPage />} />
        <Route path="*" element={<MainAppContent />} />
      </Routes>
    </>
  );
}

