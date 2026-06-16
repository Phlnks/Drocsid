import { MessageSquare, Server, Bell, Settings } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabase';
import { useEffect, useState } from 'react';

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [hasUnreadMentions, setHasUnreadMentions] = useState(false);
  const [unreadDMsCount, setUnreadDMsCount] = useState(0);
  
  const { 
    setSelectedServerId, 
    setSelectedDmId,
    isMobileNavOpen,
    mobileTab,
    setMobileTab
  } = useAppStore();

  useEffect(() => {
    if (!user) return;
    
    const checkNotifications = async () => {
      const { data: notifs } = await supabase
        .from('notifications')
        .select('type, data')
        .eq('user_id', user.id)
        .eq('read', false);
        
      if (notifs) {
        const dms = notifs.filter(n => {
          let data = n.data;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) {}
          }
          return n.type === 'dm' || data?.is_dm === true;
        });
        const others = notifs.filter(n => {
          let data = n.data;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) {}
          }
          return n.type !== 'dm' && data?.is_dm !== true;
        });
        
        setUnreadDMsCount(dms.length);
        setHasUnreadMentions(others.length > 0);
      }
    };
    
    checkNotifications();
    
    const sub = supabase.channel(`mobile_nav_notifs_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        checkNotifications();
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(sub);
    };
  }, [user]);

  if (!isMobileNavOpen) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-2 pt-1 pb-safe z-50 select-none">
      <button 
        onClick={() => {
          setMobileTab('messages');
          setSelectedServerId(null);
          setSelectedDmId(null);
        }}
        className={`flex flex-col items-center justify-center w-20 py-2 gap-1 transition-colors ${mobileTab === 'messages' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <div className="relative">
          <MessageSquare className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          {unreadDMsCount > 0 && (
            <div className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center px-1 rounded-full border-2 border-zinc-950 z-20 shadow-sm animate-in zoom-in duration-300">
              {unreadDMsCount > 99 ? "99+" : unreadDMsCount}
            </div>
          )}
        </div>
        <span className="text-[10px] font-medium leading-none">{t('app.sidebar.directMessages')}</span>
      </button>

      <button 
        onClick={() => {
          setMobileTab('servers');
        }}
        className={`flex flex-col items-center justify-center w-20 py-2 gap-1 transition-colors ${mobileTab === 'servers' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <Server className="w-6 h-6 shrink-0" strokeWidth={2.5} />
        <span className="text-[10px] font-medium leading-none">Serveurs</span>
      </button>

      <button 
        onClick={() => setMobileTab('notifications')}
        className={`flex flex-col items-center justify-center w-20 py-2 gap-1 transition-colors ${mobileTab === 'notifications' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <div className="relative">
          <Bell className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          {hasUnreadMentions && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center border-2 border-zinc-950 shadow-sm animate-in zoom-in duration-300">
              <span className="text-white text-[8px] font-bold">!</span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-medium leading-none">{t('settings.notifications')}</span>
      </button>

      <button 
        onClick={() => setMobileTab('profile')}
        className={`flex flex-col items-center justify-center w-20 py-2 gap-1 transition-colors ${mobileTab === 'profile' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <Settings className="w-6 h-6 shrink-0" strokeWidth={2.5} />
        <span className="text-[10px] font-medium leading-none">Paramètres</span>
      </button>
    </div>
  );
}
