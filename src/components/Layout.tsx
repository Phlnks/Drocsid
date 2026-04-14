import { useEffect } from 'react';
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
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden relative">
      <WebRTCManager />
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
      <div className={`flex-1 h-full min-w-0 ${!isMobileNavOpen ? 'flex' : 'hidden'} md:flex`}>
        {selectedServerId === null ? (
          activeStreamFocus ? <FocusedScreenShare /> : (selectedDmId ? <DMChatArea /> : <FriendsDashboard />)
        ) : (
          activeStreamFocus ? <FocusedScreenShare /> : <ChatArea />
        )}
      </div>

      {/* Right Sidebar */}
      <div className={`absolute right-0 top-0 bottom-0 z-30 md:relative ${isRightSidebarOpen && !isMobileNavOpen ? 'block' : 'hidden'} md:block w-full md:w-auto`}>
        {isRightSidebarOpen && <RightSidebar />}
      </div>
    </div>
  );
}
