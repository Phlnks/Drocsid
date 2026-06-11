import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ServerList from './ServerList';
import ChannelList from './ChannelList';
import ChatArea from './ChatArea';
import DMSidebar from './DMSidebar';
import DMChatArea from './DMChatArea';
import FriendsDashboard from './FriendsDashboard';
import WebRTCManager from './WebRTCManager';
import RightSidebar from './RightSidebar';
import ScreenShareViewer from './ScreenShareViewer';
import FocusedScreenShare from './FocusedScreenShare';
import MobileVoiceControl from './MobileVoiceControl';
import NotificationManager from './NotificationManager';
import MobileBottomNav from './MobileBottomNav';
import { useAppStore } from '../store/appStore';
import ServerDataPreloader from './ServerDataPreloader';
import socket from '../lib/socket';
import UserControlPanel from './UserControlPanel';
import VoicePanel from './VoicePanel';

export default function Layout() {
  const { selectedServerId, selectedDmId, activeStreamFocus, isRightSidebarOpen, isMobileNavOpen, setVoiceParticipants, connectedVoiceChannelId, mobileTab } = useAppStore();

  useEffect(() => {
    socket.emit('request-voice-states');
    
    const handleConnect = () => {
      socket.emit('request-voice-states');
    };

    const handleVoiceParticipantsUpdate = (data: { channelId: string, participants: any[] }) => {
      console.log(`[Socket] Réception d'une mise à jour de la liste des participants vocaux (Source de vérité = Serveur/LiveKit Webhook) :`, data);
	    setVoiceParticipants(data.channelId, data.participants);
    };

    socket.on('connect', handleConnect);
    socket.on('voice-participants-update', handleVoiceParticipantsUpdate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('voice-participants-update', handleVoiceParticipantsUpdate);
    };
  }, [setVoiceParticipants]);

  return (
    <div className="flex h-screen h-[100dvh] bg-zinc-900 text-zinc-100 overflow-hidden relative overscroll-none">
      <ServerDataPreloader />
      <WebRTCManager />
      <NotificationManager />
      <ScreenShareViewer />
      <MobileVoiceControl />
      
      {/* Navigation (ServerList + ChannelList/DMSidebar) */}
      <div className={`flex flex-col h-full w-full md:w-[312px] bg-zinc-950 flex-shrink-0 border-r border-zinc-800/50 pb-[60px] md:pb-0 ${isMobileNavOpen ? 'flex' : 'hidden'} md:flex`}>
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          
          {/* Desktop Left-most Server Bar OR Mobile 'servers' tab */}
          <div className={`${mobileTab === 'servers' ? 'flex' : 'hidden'} md:flex shrink-0 z-10 bg-zinc-950 h-full`}>
            <ServerList />
          </div>
 
          {/* Mobile content wrapper (hidden on desktop) */}
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col w-full h-full bg-zinc-900 md:hidden ${mobileTab === 'servers' ? 'rounded-tl-2xl' : ''}`}>
             {mobileTab === 'profile' ? (
                <div className="flex-1 flex flex-col pt-6 px-4 gap-4">
                  <h2 className="text-2xl font-bold">Profil & Paramètres</h2>
                  <div className="rounded-xl bg-zinc-950 overflow-hidden border border-zinc-800">
                     <UserControlPanel />
                  </div>
                  <p className="text-zinc-500 text-sm mt-4 px-2">
                    Cliquez sur votre profil pour ouvrir les paramètres complets.
                  </p>
                </div>
             ) : mobileTab === 'notifications' ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <RightSidebar forceTab="notifications" />
                </div>
             ) : mobileTab === 'messages' ? (
                <DMSidebar />             
             ) : mobileTab === 'channels' ? (
                 <ChannelList />
             ) : (
                <ChannelList />
             )}
          </div>

          {/* Desktop content wrapper (hidden on mobile) */}
          <div className="hidden md:flex flex-1 min-h-0 overflow-hidden flex-col">
              {selectedServerId === null ? <DMSidebar /> : <ChannelList />}
          </div>
        </div>

        {connectedVoiceChannelId && <VoicePanel />}
        <div className="hidden md:block">
          <UserControlPanel />
        </div>
      </div>

      <MobileBottomNav />

      {/* Main Content (ChatArea/DMChatArea/FriendsDashboard) */}
      <div className={`flex-1 h-full min-w-0 min-h-0 ${!isMobileNavOpen ? 'flex' : 'hidden'} md:flex`}>
        {selectedServerId === null ? (
          activeStreamFocus ? <FocusedScreenShare /> : (selectedDmId ? <DMChatArea key={`dm-${selectedDmId}`} /> : <FriendsDashboard />)
        ) : (
          activeStreamFocus ? <FocusedScreenShare /> : <ChatArea key={`server-${selectedServerId}`} />
        )}
      </div>

      {/* Right Sidebar */}
      <AnimatePresence>
        {isRightSidebarOpen && (
          <motion.div 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`absolute right-0 top-0 bottom-0 z-40 md:relative flex w-full md:w-72 bg-zinc-900 md:bg-transparent`}
          >
            <RightSidebar />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
