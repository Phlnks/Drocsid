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
import UserControlPanel from './UserControlPanel';
import VoicePanel from './VoicePanel';

export default function Layout() {
  const { selectedServerId, selectedDmId, activeStreamFocus, isRightSidebarOpen, isMobileNavOpen, setVoiceParticipants, connectedVoiceChannelId } = useAppStore();

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
      <div className={`flex flex-col h-full w-full md:w-[312px] bg-zinc-950 flex-shrink-0 border-r border-zinc-800/50 ${isMobileNavOpen ? 'flex' : 'hidden'} md:flex`}>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <ServerList />
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {selectedServerId === null ? (
              <DMSidebar />
            ) : (
              <ChannelList />
            )}
          </div>
        </div>
        {connectedVoiceChannelId && <VoicePanel />}
        <UserControlPanel />
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
