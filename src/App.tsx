import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';
import { useInstanceStore } from './store/instanceStore';
import Auth from './components/Auth';
import Layout from './components/Layout';
import { InstanceSetupScreen } from './components/InstanceSetupScreen';
import { InstanceSettingsModal } from './components/InstanceSettingsModal';
import { motion } from 'motion/react';
import Toaster from './components/ui/Toaster';
import socket from './lib/socket';
import ThemeManager from './components/ThemeManager';
import {
  playMuteSound,
  playUnmuteSound,
  playDeafenSound,
  playUndeafenSound,
  playPTTActivateSound,
  playPTTDeactivateSound,
} from './lib/sounds';
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
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
  const {
    theme,
    setTheme,
    setOnlineUserIds,
    addNotification,
    connectedVoiceChannelId,
    isVoiceMuted,
    isDeafened,
  } = useAppStore();
  const { isCurrentInstanceValid } = useInstanceStore();

  const isInstanceValid = isCurrentInstanceValid();

  const [showEmergency, setShowEmergency] = useState(false);
  const [isInstanceSettingsOpen, setIsInstanceSettingsOpen] = useState(false);

  useEffect(() => {
    if (!isAuthReady) {
      const timer = setTimeout(() => {
        setShowEmergency(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setShowEmergency(false);
    }
  }, [isAuthReady]);

  useEffect(() => {
    const handleSoundPlayed = (data: {
      soundId: string;
      channelId: string;
      userId: string;
      soundUrl: string;
    }) => {
      const state = useAppStore.getState();
      const connectedVoiceChannelId = state.connectedVoiceChannelId;
      const isDeafened = state.isDeafened;
      const isSoundboardMuted = state.isSoundboardMuted;
      const soundboardVolume = state.soundboardVolume;
      const currentUser = useAuthStore.getState().user;

      console.log('Soundboard: Global listener received event', data);

      if (!connectedVoiceChannelId) {
        console.log('Soundboard: User not in a voice channel, ignoring.');
        return;
      }

      const isSameChannel = data.channelId === connectedVoiceChannelId;
      const isNotMe = data.userId !== currentUser?.id;

      console.log('Soundboard: Global receiver checks', {
        isSameChannel,
        isDeafened,
        isNotMe,
        isSoundboardMuted,
        connectedVoiceChannelId,
        dataChannelId: data.channelId,
        myUserId: currentUser?.id,
      });

      if (isSameChannel && !isDeafened && isNotMe && !isSoundboardMuted) {
        console.log('Soundboard: Playing broadcast sound:', data.soundUrl);
        getAudioUrl(data.soundUrl)
          .then((urlToPlay) => {
            const audio = new Audio(urlToPlay);
            audio.volume = soundboardVolume;
            audio.play()
              .then(() => console.log('Soundboard: Playback success'))
              .catch((err) => console.error('Soundboard: Playback failed', err));
          })
          .catch((err) => console.error('Soundboard: Cache failed', err));
      }
    };

    const handleServerKick = async (data: { serverId: string }) => {
      const state = useAppStore.getState();
      const {
        selectedServerId,
        setSelectedServerId,
        connectedVoiceChannelId,
        setConnectedVoiceChannelId,
        addNotification,
      } = state;

      if (selectedServerId === data.serverId) {
        addNotification(
          t('notifications.kickedFromServer', 'Vous avez été exclu du serveur'),
          'error'
        );
        setSelectedServerId(null);
      }

      if (connectedVoiceChannelId) {
        const { data: channel } = await supabase
          .from('channels')
          .select('server_id')
          .eq('id', connectedVoiceChannelId)
          .maybeSingle();

        if (channel && channel.server_id === data.serverId) {
          setConnectedVoiceChannelId(null);
        }
      }
    };

    console.log("Soundboard: Registering global socket event 'v1.1'");
    socket.on('soundboard-sound-played', handleSoundPlayed);
    socket.on('server-kick', handleServerKick);

    return () => {
      socket.off('soundboard-sound-played', handleSoundPlayed);
      socket.off('server-kick', handleServerKick);
    };
  }, [t]);

  useEffect(() => {
    if ((theme as any) === 'default') {
      setTheme('classic');
      localStorage.setItem('drocsid-theme', 'classic');
    }
  }, [theme, setTheme]);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/invite\/([a-zA-Z0-9]+)(?:[\/#?].*)?$/);
    if (match && match[1]) {
      const code = match[1];
      console.log('Detected invite code in URL:', code);
      sessionStorage.setItem('pending_invite', code);
      window.history.replaceState(null, '', '/');
    }
  }, []);

  useEffect(() => {
    const handleToggleMute = () => {
      const s = useAppStore.getState();
      if (!s.connectedVoiceChannelId || s.isDeafened) return;

      const newMuted = !s.isVoiceMuted;
      if (newMuted) playMuteSound();
      else playUnmuteSound();

      s.setIsVoiceMuted(newMuted);
    };

    const handleToggleDeafen = () => {
      const s = useAppStore.getState();
      if (!s.connectedVoiceChannelId) return;

      const newDeaf = !s.isDeafened;
      if (newDeaf) playDeafenSound();
      else playUndeafenSound();

      s.setIsDeafened(newDeaf);
      if (newDeaf && !s.isVoiceMuted) {
        s.setIsVoiceMuted(true);
      }
    };

    const handlePTTDown = () => {
      const s = useAppStore.getState();
      if (!s.connectedVoiceChannelId || s.isPTTActive) return;

      playPTTActivateSound();
      s.setIsPTTActive(true);
    };

    const handlePTTUp = () => {
      const s = useAppStore.getState();
      if (!s.isPTTActive) return;

      playPTTDeactivateSound();
      s.setIsPTTActive(false);
    };

    const handleDisconnectVoice = () => {
      const s = useAppStore.getState();
      if (s.connectedVoiceChannelId) {
        s.setConnectedVoiceChannelId(null);
      }
    };

    const checkShortcut = (
      e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean },
      shortcut: string
    ): boolean => {
      if (!shortcut) return false;

      const parts = shortcut.split('+');
      const requiresCtrl = parts.includes('CommandOrControl');
      const requiresAlt = parts.includes('Alt');
      const requiresShift = parts.includes('Shift');
      const key = parts[parts.length - 1];

      const eCtrl = 'ctrlKey' in e ? !!e.ctrlKey : false;
      const eMeta = 'metaKey' in e ? !!e.metaKey : false;
      const eAlt = 'altKey' in e ? !!e.altKey : false;
      const eShift = 'shiftKey' in e ? !!e.shiftKey : false;

      if (requiresCtrl && !eCtrl && !eMeta && key !== 'CommandOrControl') return false;
      if (requiresAlt && !eAlt && key !== 'Alt') return false;
      if (requiresShift && !eShift && key !== 'Shift') return false;

      let pressedKey = e.key;
      if (pressedKey === ' ') pressedKey = 'Space';
      if (pressedKey === 'Control' || pressedKey === 'Meta') pressedKey = 'CommandOrControl';
      if (pressedKey.length === 1) pressedKey = pressedKey.toUpperCase();

      return pressedKey === key;
    };

    const isInputFocused = (): boolean => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return ['INPUT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable;
    };

    let cleanupGlobalInput: (() => void) | undefined;

    // Dans le useEffect des raccourcis globaux
	if ((window as any).electron?.onGlobalInputEvent) {
	  cleanupGlobalInput = (window as any).electron.onGlobalInputEvent((payload: any) => {
		const { keybinds } = useAppStore.getState();

		if (payload.type === 'keydown') {
		  if (checkShortcut(payload, keybinds.mute)) {
			handleToggleMute();
		  } else if (checkShortcut(payload, keybinds.deafen)) {
			handleToggleDeafen();
		  } else if (checkShortcut(payload, keybinds.pushToTalk)) {
			handlePTTDown();
		  }
		} else if (payload.type === 'keyup') {
		  if (checkShortcut(payload, keybinds.pushToTalk)) {
			handlePTTUp();
		  }
		} else if (payload.type === 'mousedown') {
		  const { keybinds: kb, isPTTActive, connectedVoiceChannelId } = useAppStore.getState();
		  const fakeEvt = { key: payload.button ?? '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

		  if (checkShortcut(fakeEvt, kb.pushToTalk)) {
			if (!isPTTActive && connectedVoiceChannelId) {
			  playPTTActivateSound();
			  useAppStore.getState().setIsPTTActive(true);
			}
		  }
		} else if (payload.type === 'mouseup') {
		  const { keybinds: kb, isPTTActive } = useAppStore.getState();
		  const fakeEvt = { key: payload.button ?? '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

		  if (checkShortcut(fakeEvt, kb.pushToTalk) && isPTTActive) {
			playPTTDeactivateSound();
			useAppStore.getState().setIsPTTActive(false);
		  }
		}
	  });

	  (window as any).electron.onToggleMute?.(handleToggleMute);
	  (window as any).electron.onToggleDeafen?.(handleToggleDeafen);
	  (window as any).electron.onDisconnectVoice?.(handleDisconnectVoice);
	  (window as any).electron.updateShortcuts?.(useAppStore.getState().keybinds);
	} else if ((window as any).electron) {
	  // fallback legacy seulement si uiohook indisponible
	  (window as any).electron.onToggleMute?.(handleToggleMute);
	  (window as any).electron.onToggleDeafen?.(handleToggleDeafen);
	  (window as any).electron.onDisconnectVoice?.(handleDisconnectVoice);
	  (window as any).electron.updateShortcuts?.(useAppStore.getState().keybinds);
	}

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((window as any).electron?.onGlobalInputEvent) return;

      const { keybinds } = useAppStore.getState();
      const inInput = isInputFocused();
      const isPrintable = !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1;

      if (checkShortcut(e, keybinds.mute)) {
        if (inInput && isPrintable) return;
        e.preventDefault();
        handleToggleMute();
      } else if (checkShortcut(e, keybinds.deafen)) {
        if (inInput && isPrintable) return;
        e.preventDefault();
        handleToggleDeafen();
      } else if (checkShortcut(e, keybinds.pushToTalk)) {
        if (inInput && isPrintable) return;
        handlePTTDown();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if ((window as any).electron?.onGlobalInputEvent) return;
      const { keybinds } = useAppStore.getState();
      if (checkShortcut(e, keybinds.pushToTalk)) {
        handlePTTUp();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if ((window as any).electron?.onGlobalInputEvent) return;

      const buttonMap: Record<number, string> = {
        1: 'Mouse Middle',
        3: 'Mouse Back',
        4: 'Mouse Forward',
      };
      const buttonName = buttonMap[e.button];
      if (!buttonName) return;

      const { keybinds } = useAppStore.getState();
      if (checkShortcut({ key: buttonName }, keybinds.pushToTalk)) {
        handlePTTDown();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if ((window as any).electron?.onGlobalInputEvent) return;

      const buttonMap: Record<number, string> = {
        1: 'Mouse Middle',
        3: 'Mouse Back',
        4: 'Mouse Forward',
      };
      const buttonName = buttonMap[e.button];
      if (!buttonName) return;

      const { keybinds } = useAppStore.getState();
      if (checkShortcut({ key: buttonName }, keybinds.pushToTalk)) {
        handlePTTUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
	  cleanupGlobalInput?.();

	  if ((window as any).electron) {
		(window as any).electron.removeToggleMute?.(handleToggleMute);
		(window as any).electron.removeToggleDeafen?.(handleToggleDeafen);
		(window as any).electron.removeDisconnectVoice?.(handleDisconnectVoice);
	  }

	  window.removeEventListener('keydown', handleKeyDown);
	  window.removeEventListener('keyup', handleKeyUp);
	  window.removeEventListener('mousedown', handleMouseDown);
	  window.removeEventListener('mouseup', handleMouseUp);
	};
  }, []);

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
    if (!user) return;

    const handleConnect = () => {
      socket.emit('identify', user.id);
    };

    socket.on('connect', handleConnect);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    import('./lib/usePushNotifications').then(({ subscribeToPush }) => {
      subscribeToPush(user.id);
    });

    const handleOnlineUsers = (userIds: string[]) => {
      setOnlineUserIds(userIds);
    };

    socket.on('online-users', handleOnlineUsers);

    const pendingInvite = sessionStorage.getItem('pending_invite');
    if (pendingInvite) {
      sessionStorage.removeItem('pending_invite');

      const joinServer = async () => {
        try {
          const { data: invite, error } = await supabase
            .from('invites')
            .select('*')
            .eq('code', pendingInvite)
            .maybeSingle();

          if (error || !invite) {
            addNotification(t('app.invalidInvite'), 'error');
            return;
          }

          if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
            addNotification(t('app.invalidInvite'), 'error');
            return;
          }

          const serverId = invite.server_id;

          const { data: serverData } = await supabase
            .from('servers')
            .select('default_role_id')
            .eq('id', serverId)
            .maybeSingle();

          const { data: ban } = await supabase
            .from('server_bans')
            .select('*')
            .eq('server_id', serverId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (ban) {
            addNotification(t('app.bannedFromServer'), 'error');
            return;
          }

          const { data: existingMember } = await supabase
            .from('server_members')
            .select('*')
            .eq('server_id', serverId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!existingMember) {
            const roles = ['member'];
            if (serverData?.default_role_id) {
              roles.push(serverData.default_role_id);
            }

            const { error: insertError } = await supabase.from('server_members').insert({
              server_id: serverId,
              user_id: user.id,
              roles,
            });

            if (insertError) throw insertError;
          }

          useAppStore.getState().setSelectedServerId(serverId);
        } catch (e) {
          console.error('Error joining server via link:', e);
          addNotification(t('app.errorJoinLink'), 'error');
        }
      };

      joinServer();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('online-users', handleOnlineUsers);
    };
  }, [user, setOnlineUserIds, addNotification, t]);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

      if (data) {
        setCurrentUserProfile(data);

        const updates: any = {};
        if (user.email && data.email !== user.email) {
          updates.email = user.email;
        }
        const superadminEmail = import.meta.env.VITE_SUPERADMIN_EMAIL || 'admin@example.com';
        if (user.email === superadminEmail && (!data.is_super_admin || !data.can_create_servers)) {
          updates.is_super_admin = true;
          updates.can_create_servers = true;
          updates.max_servers = 100;
        }

        if (Object.keys(updates).length > 0) {
          supabase.from('profiles').update(updates).eq('id', user.id).then();
        }
      } else if (!error || error.code === 'PGRST116') {
        const superadminEmail = import.meta.env.VITE_SUPERADMIN_EMAIL || 'admin@example.com';
        const isSuperadmin = user.email === superadminEmail;
        const { data: upsertedData } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            username:
              user.user_metadata?.username ||
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              user.email?.split('@')[0],
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
            email: user.email,
            status: 'online',
            is_super_admin: isSuperadmin,
            can_create_servers: isSuperadmin,
            max_servers: isSuperadmin ? 100 : 1,
          })
          .select()
          .maybeSingle();

        if (upsertedData) setCurrentUserProfile(upsertedData);
      }
    };

    fetchProfile();

    const fetchRelevantProfiles = async () => {
      const { data: memberships } = await supabase
        .from('server_members')
        .select('server_id')
        .eq('user_id', user.id);

      if (!memberships || memberships.length === 0) return;

      const serverIds = memberships.map((m) => m.server_id);

      const { data: serverMembers } = await supabase
        .from('server_members')
        .select('user_id')
        .in('server_id', serverIds);

      if (!serverMembers) return;

      const userIds = [...new Set(serverMembers.map((m) => m.user_id))];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profiles) {
        useAppStore.getState().setGlobalProfiles(profiles);
      }
    };

    fetchRelevantProfiles();

    const channelName = `global_profiles_listener_${user.id}`;
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${channelName}`) {
        supabase.removeChannel(c);
      }
    });

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            useAppStore.getState().setGlobalProfile(payload.new);
          }
          if (payload.new && (payload.new as any).id === user.id) {
            setCurrentUserProfile((prev: any) => ({ ...prev, ...payload.new }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, setCurrentUserProfile]);

  useEffect(() => {
    // Check current session immediately on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
      }
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth Event:', event);

      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setCurrentUserProfile(null);
      }

      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, [setUser, setCurrentUserProfile, setAuthReady]);

  const isInIframe = window.self !== window.top;

  if (!isAuthReady || isInstanceSettingsOpen) {
    return (
      <div className="min-h-screen bg-[#1e1f22] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center max-w-md w-full bg-[#313338] p-6 rounded-xl border border-[#1e1f22] text-center space-y-6 shadow-xl">
          <div className="w-8 h-8 border-4 border-[#5865F2] border-t-transparent rounded-full animate-spin" />
          
          {showEmergency && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 w-full"
            >
              <p className="text-[#b5bac1] text-sm leading-relaxed">
                {t('setup.connectionTimeout')}
              </p>
              <button
                onClick={() => setIsInstanceSettingsOpen(true)}
                className="w-full py-2.5 px-4 bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium rounded-lg transition-all"
              >
                {t('setup.reconfigureInstance')}
              </button>
            </motion.div>
          )}
        </div>
        
        {isInstanceSettingsOpen && (
          <InstanceSettingsModal
            isOpen={isInstanceSettingsOpen}
            onClose={() => setIsInstanceSettingsOpen(false)}
          />
        )}
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
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