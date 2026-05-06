import { useAppStore } from '../store/appStore';
import { PhoneOff, Mic, MicOff, Headphones, HeadphonesIcon } from 'lucide-react';
import { playDisconnectSound, playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from '../lib/sounds';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';

export default function MobileVoiceControl() {
  const { 
    connectedVoiceChannelId, 
    setConnectedVoiceChannelId,
    isVoiceMuted, 
    setIsVoiceMuted, 
    isDeafened, 
    setIsDeafened,
    isMobileNavOpen
  } = useAppStore();

  const { user: currentUser } = useAuthStore();
  if (!connectedVoiceChannelId || isMobileNavOpen) return null;

  const handleDisconnect = async () => {
    if (!currentUser) return;
    try {
      await supabase.from('profiles').update({
        voice_state: null
      }).eq('id', currentUser.id);
      playDisconnectSound();
      setConnectedVoiceChannelId(null);
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  };

  // Detect AFK from channel name if we had access to it, but for now we rely on the store states
  // We'll add a way to check if current channel is AFK in the future or just use the disabled state
  // For now let's just make sure the toggles work correctly with the forced state.

  const toggleMute = () => {
    if (isVoiceMuted && !isDeafened) {
      playUnmuteSound();
      setIsVoiceMuted(false);
    } else if (!isVoiceMuted) {
      playMuteSound();
      setIsVoiceMuted(true);
    }
  };

  const toggleDeafen = () => {
    if (isDeafened) {
      playUndeafenSound();
      setIsDeafened(false);
    } else {
      playDeafenSound();
      setIsDeafened(true);
      if (!isVoiceMuted) {
        setIsVoiceMuted(true);
      }
    }
  };

  return (
    <div className="md:hidden fixed bottom-16 right-4 z-50 bg-zinc-900/95 backdrop-blur border border-zinc-700 shadow-2xl rounded-xl p-2 flex items-center justify-end animate-in slide-in-from-bottom duration-300 w-fit">
      <div className="flex items-center gap-2">
        <button 
          onClick={toggleMute}
          className={`p-2 rounded-md transition-colors ${isVoiceMuted ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
        >
          {isVoiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button 
          onClick={toggleDeafen}
          className={`p-2 rounded-md transition-colors ${isDeafened ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
        >
          {isDeafened ? <HeadphonesIcon className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>
        <button 
          onClick={handleDisconnect}
          className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-500 transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
