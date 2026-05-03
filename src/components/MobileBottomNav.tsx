import { MessageSquare, Compass, Bell, User } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export default function MobileBottomNav() {
  const { 
    selectedServerId, 
    setSelectedServerId,
    setSelectedDmId,
    isMobileNavOpen,
    mobileTab,
    setMobileTab
  } = useAppStore();

  if (!isMobileNavOpen) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-2 pb-safe z-50">
      <button 
        onClick={() => {
          setMobileTab('messages');
          setSelectedServerId(null);
        }}
        className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${mobileTab === 'messages' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <MessageSquare className="w-6 h-6" />
        <span className="text-[10px] font-medium">Messages</span>
      </button>

      <button 
        onClick={() => {
          setMobileTab('servers');
          // We don't unset the server id, we just switch the view mode
        }}
        className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${mobileTab === 'servers' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <Compass className="w-6 h-6" />
        <span className="text-[10px] font-medium">Serveurs</span>
      </button>

      <button 
        onClick={() => setMobileTab('notifications')}
        className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${mobileTab === 'notifications' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <Bell className="w-6 h-6" />
        <span className="text-[10px] font-medium">Notifs</span>
      </button>

      <button 
        onClick={() => setMobileTab('profile')}
        className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors ${mobileTab === 'profile' ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      >
        <User className="w-6 h-6" />
        <span className="text-[10px] font-medium">Profil</span>
      </button>
    </div>
  );
}
