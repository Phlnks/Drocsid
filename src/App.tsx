import { useEffect } from 'react';
import { supabase } from './supabase';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';
import Auth from './components/Auth';
import Layout from './components/Layout';
import socket from './lib/socket';

export default function App() {
  const { user, isAuthReady, setUser, setAuthReady } = useAuthStore();
  const { theme, setOnlineUserIds } = useAppStore();

  useEffect(() => {
    if (user) {
      const handleConnect = () => {
        socket.emit('identify', user.id);
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
      
      return () => {
        socket.off('connect', handleConnect);
        socket.off('online-users', handleOnlineUsers);
      };
    }
  }, [user, setOnlineUserIds]);

  useEffect(() => {
    if (theme === 'neon') {
      document.documentElement.classList.add('theme-neon');
    } else {
      document.documentElement.classList.remove('theme-neon');
    }
  }, [theme]);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
      
      // Test connection and ensure profile exists
      if (session?.user) {
        supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle().then(({ data, error }) => {
          if (error && error.code === 'PGRST116') {
            // Profile missing, create it using upsert to be safe
            console.log("Profile missing, creating for user:", session.user.id);
            supabase.from('profiles').upsert({
              id: session.user.id,
              username: session.user.user_metadata?.username || session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
              avatar_url: session.user.user_metadata?.avatar_url,
              status: 'online'
            }).then(({ error: upsertError }) => {
              if (upsertError) console.error("Error ensuring profile exists:", upsertError);
              else console.log("Profile ensured successfully");
            });
          } else if (error) {
            // If it's a 406 error, it means columns are missing, but we still want to know
            console.error("Supabase connection test failed (check if columns exist):", error);
          } else {
            console.log("Supabase connection test successful, profile exists");
          }
        });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, [setUser, setAuthReady]);

  const isInIframe = window.self !== window.top;

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isInIframe) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white tracking-tight">
              Prêt à discuter ?
            </h1>
            <p className="text-zinc-400 text-lg">
              Pour une expérience optimale et pour permettre la connexion Google, l'application doit être ouverte dans un nouvel onglet.
            </p>
          </div>
          
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Lancer l'application
          </button>
          
          <p className="text-zinc-500 text-sm">
            Une fois ouvert, vous pourrez vous connecter en toute sécurité.
          </p>
        </div>
      </div>
    );
  }

  return user ? <Layout /> : <Auth />;
}

