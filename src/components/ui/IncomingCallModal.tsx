import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { Phone, PhoneOff } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { playRingtone, stopRingtone } from '../../lib/sounds';
import socket from '../../lib/socket';

export default function IncomingCallModal() {
  const { user } = useAuthStore();
  const { setConnectedVoiceChannelId, connectedVoiceChannelId, setSelectedDmId } = useAppStore();
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [caller, setCaller] = useState<any>(null);

  useEffect(() => {
    if (!user) return;

    const fetchCall = async () => {
      const { data: calls } = await supabase.from('calls')
        .select('*')
        .contains('participants', [user.id])
        .eq('status', 'ringing');
      
      const call = calls?.find(c => c.caller_id !== user.id);
      
      if (call) {
        if (connectedVoiceChannelId === call.dm_id) {
          setIncomingCall(null);
          stopRingtone();
          return;
        }
        
        setIncomingCall(call);
        
        if (call.caller_id) {
          const { data: callerData } = await supabase.from('profiles').select('id, username, display_name, avatar_url, status').eq('id', call.caller_id).maybeSingle();
          if (callerData) setCaller(callerData);
        }

        playRingtone();
      } else {
        setIncomingCall(null);
        stopRingtone();
      }
    };

    fetchCall();

    const handleIncomingCall = async (data: any) => {
      if (connectedVoiceChannelId === data.dmId) return;
      
      setIncomingCall({
        id: data.callId,
        dm_id: data.dmId,
        caller_id: data.callerId,
        participants: data.participants
      });

      const { data: callerData } = await supabase.from('profiles').select('id, username, display_name, avatar_url, status').eq('id', data.callerId).maybeSingle();
      if (callerData) setCaller(callerData);
      
      playRingtone();
    };

    const handleCallDeclined = (data: any) => {
      if (incomingCall?.id === data.callId) {
        setIncomingCall(null);
        stopRingtone();
      }
    };

    const handleCallAccepted = (data: any) => {
      if (incomingCall?.id === data.callId) {
        setIncomingCall(null);
        stopRingtone();
      }
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-declined', handleCallDeclined);
    socket.on('call-accepted', handleCallAccepted);

    const channel = supabase.channel(`incoming_calls_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, (payload) => {
        const call = payload.new as any || payload.old as any;
        if (call && call.participants && call.participants.includes(user.id)) {
          fetchCall();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-declined', handleCallDeclined);
      socket.off('call-accepted', handleCallAccepted);
      stopRingtone();
    };
  }, [user, connectedVoiceChannelId, incomingCall?.id]);

  const handleAccept = async () => {
    if (!incomingCall) return;
    
    stopRingtone();
    
    socket.emit('accept-call', {
      callId: incomingCall.id,
      participants: incomingCall.participants,
      userId: user?.id
    });
    
    setConnectedVoiceChannelId(incomingCall.dm_id);
    setSelectedDmId(incomingCall.dm_id);
    
    if (incomingCall.participants.length <= 2) {
      await supabase.from('calls').update({ status: 'active' }).eq('id', incomingCall.id);
    }
    
    setIncomingCall(null);
  };

  const handleDecline = async () => {
    if (!incomingCall || !user) return;
    
    stopRingtone();
    
    socket.emit('decline-call', {
      callId: incomingCall.id,
      participants: incomingCall.participants,
      userId: user.id
    });
    
    if (incomingCall.participants.length <= 2) {
      await supabase.from('calls').delete().eq('id', incomingCall.id);
    } else {
      const newParticipants = incomingCall.participants.filter((id: string) => id !== user.id);
      await supabase.from('calls').update({ participants: newParticipants }).eq('id', incomingCall.id);
    }
    
    setIncomingCall(null);
  };

  if (!incomingCall || !caller) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
      <div className="bg-zinc-900 w-[calc(100vw-2rem)] max-w-sm rounded-2xl shadow-2xl flex flex-col items-center p-8 animate-in fade-in zoom-in duration-300">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-20"></div>
          <UserAvatar 
            user={{
              username: caller.username,
              avatar_url: caller.avatar_url,
              status: caller.status
            }} 
            size="xl" 
          />
        </div>
        
        <h2 className="text-2xl font-bold text-zinc-100 mb-2">
          {caller.username || caller.displayName}
        </h2>
        <p className="text-zinc-400 mb-8">Appel vocal entrant...</p>
        
        <div className="flex items-center gap-8">
          <button 
            onClick={handleDecline}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg transition-transform hover:scale-110"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
          
          <button 
            onClick={handleAccept}
            className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg transition-transform hover:scale-110 animate-bounce"
          >
            <Phone className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
