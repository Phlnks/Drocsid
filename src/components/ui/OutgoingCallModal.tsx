import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { PhoneOff } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { stopRingtone } from '../../lib/sounds';
import socket from '../../lib/socket';

export default function OutgoingCallModal() {
  const { user } = useAuthStore();
  const { connectedVoiceChannelId, setConnectedVoiceChannelId } = useAppStore();
  const [outgoingCall, setOutgoingCall] = useState<any>(null);
  const [recipient, setRecipient] = useState<any>(null);

  useEffect(() => {
    if (!user || !connectedVoiceChannelId) {
      setOutgoingCall(null);
      return;
    }

    const fetchCall = async () => {
      const { data: calls } = await supabase.from('calls')
        .select('*')
        .eq('id', connectedVoiceChannelId)
        .eq('caller_id', user.id)
        .eq('status', 'ringing');

      const call = calls?.[0];

      if (call) {
        setOutgoingCall(call);
        // Find the recipient (the other participant)
        const recipientId = call.participants.find((id: string) => id !== user.id);
        if (recipientId) {
          const { data: recipientData } = await supabase.from('profiles').select('id, username, display_name, avatar_url, status').eq('id', recipientId).maybeSingle();
          if (recipientData) setRecipient(recipientData);
        }
      } else {
        setOutgoingCall(null);
      }
    };

    fetchCall();

    const handleCallDeclined = (data: any) => {
      if (data.callId === connectedVoiceChannelId) {
        setOutgoingCall(null);
        setConnectedVoiceChannelId(null);
        stopRingtone();
      }
    };

    const handleCallAccepted = (data: any) => {
      if (data.callId === connectedVoiceChannelId) {
        setOutgoingCall(null);
        stopRingtone();
      }
    };

    socket.on('call-declined', handleCallDeclined);
    socket.on('call-accepted', handleCallAccepted);

    const channelName = `outgoing_calls_${connectedVoiceChannelId}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `id=eq.${connectedVoiceChannelId}` }, (payload) => {
        const call = payload.new as any;
        if (!call || call.status !== 'ringing') {
          setOutgoingCall(null);
          if (call && call.status === 'active') stopRingtone();
        } else {
          fetchCall();
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'calls', filter: `id=eq.${connectedVoiceChannelId}` }, () => {
        setOutgoingCall(null);
        setConnectedVoiceChannelId(null);
        stopRingtone();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      socket.off('call-declined', handleCallDeclined);
      socket.off('call-accepted', handleCallAccepted);
    };
  }, [user, connectedVoiceChannelId, setConnectedVoiceChannelId]);

  const handleCancelCall = async () => {
    if (!outgoingCall) return;
    
    stopRingtone();
    setConnectedVoiceChannelId(null);
    
    // Simulate decline to notify recipient
    socket.emit('decline-call', {
      callId: outgoingCall.id,
      participants: outgoingCall.participants,
      userId: user?.id
    });
    
    await supabase.from('calls').delete().eq('id', outgoingCall.id);
    setOutgoingCall(null);
  };

  if (!outgoingCall || !recipient) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
      <div className="bg-zinc-900 w-[calc(100vw-2rem)] max-w-sm rounded-2xl shadow-2xl flex flex-col items-center p-8 animate-in fade-in zoom-in duration-300">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
          <UserAvatar 
            user={{
              username: recipient.username,
              avatar_url: recipient.avatar_url,
              status: recipient.status
            }} 
            size="xl" 
          />
        </div>
        
        <h2 className="text-2xl font-bold text-zinc-100 mb-2">
          {recipient.username || recipient.display_name}
        </h2>
        <p className="text-zinc-400 mb-8">Appel en cours...</p>
        
        <div className="flex items-center justify-center w-full">
          <button 
            onClick={handleCancelCall}
            className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg transition-transform hover:scale-110"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
