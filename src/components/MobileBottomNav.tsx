import { MessageSquare, Server, Bell, Settings } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useTranslation } from 'react-i18next';

export default function MobileBottomNav() {
  const { t } = useTranslation();
  const { 
    setSelectedServerId, 
    setSelectedDmId,
    isMobileNavOpen,
    mobileTab,
    setMobileTab
  } = useAppStore();

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
        <MessageSquare className="w-6 h-6 shrink-0" strokeWidth={2.5} />
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
        <Bell className="w-6 h-6 shrink-0" strokeWidth={2.5} />
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
