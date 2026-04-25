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
import IncomingCallModal from './ui/IncomingCallModal';
import ScreenShareViewer from './ScreenShareViewer';
import FocusedScreenShare from './FocusedScreenShare';
import MobileVoiceControl from './MobileVoiceControl';
import NotificationManager from './NotificationManager';
import { useAppStore } from '../store/appStore';
import socket from '../lib/socket';

export default function Layout() {
  const { selectedServerId, selectedDmId, activeStreamFocus, isRightSidebarOpen, isMobileNavOpen, setVoiceParticipants } = useAppStore();

  useEffect(() => {
    socket.emit('request-voice-states');
    
    const handleVoiceParticipantsUpdate = (data: { channelId: string, participants: any[] }) => {
      setVoiceParticipants(data.channelId, data.participants);
    };

    socket.on('voice-participants-update', handleVoiceParticipantsUpdate);

    return () => {
      socket.off('voice-participants-update', handleVoiceParticipantsUpdate);
    };
  }, [setVoiceParticipants]);

  return (
    <div className="flex h-screen h-[100dvh] bg-zinc-900 text-zinc-100 overflow-hidden relative">
      <WebRTCManager />
      <NotificationManager />
      <IncomingCallModal />
      <ScreenShareViewer />
      <MobileVoiceControl />
      
      {/* Navigation (ServerList + ChannelList/DMSidebar) */}
      <div className={`flex h-full w-full md:w-auto ${isMobileNavOpen ? 'flex' : 'hidden'} md:flex`}>
        <ServerList />
        {selectedServerId === null ? (
          <DMSidebar />
        ) : (
          <ChannelList />
        )}
      </div>

      {/* Main Content (ChatArea/DMChatArea/FriendsDashboard) */}
      <div className={`flex-1 h-full min-w-0 min-h-0 ${!isMobileNavOpen ? 'flex' : 'hidden'} md:flex`}>
        {selectedServerId === null ? (
          activeStreamFocus ? <FocusedScreenShare /> : (selectedDmId ? <DMChatArea /> : <FriendsDashboard />)
        ) : (
          activeStreamFocus ? <FocusedScreenShare /> : <ChatArea />
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
