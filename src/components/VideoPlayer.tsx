import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../store/appStore';

export default function VideoPlayer({ stream, muted = false }: { stream: MediaStream, muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isDeafened } = useAppStore();
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(muted);
  const [showControls, setShowControls] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !stream) return;

    videoRef.current.srcObject = stream;

    const checkAudio = () => {
      setHasAudio(stream.getAudioTracks().length > 0);
    };

    checkAudio();
    stream.onaddtrack = checkAudio;
    stream.onremovetrack = checkAudio;

    const tryPlay = () => {
      if (!videoRef.current) return;
      videoRef.current.play().catch(e => {
        if (e.name !== 'AbortError') console.warn("Video play failed:", e);
      });
    };

    // ✅ Si la video track est déjà active, on joue immédiatement
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && videoTrack.readyState === 'live') {
      tryPlay();
    } else if (videoTrack) {
      // Track pas encore prête → attendre qu'elle s'active
      videoTrack.addEventListener('unmute', tryPlay, { once: true });
      // Fallback : réessayer après 300ms au cas où l'event ne se déclenche pas
      const fallback = setTimeout(tryPlay, 300);
      return () => {
        videoTrack.removeEventListener('unmute', tryPlay);
        clearTimeout(fallback);
        stream.onaddtrack = null;
        stream.onremovetrack = null;
      };
    }

    return () => {
      stream.onaddtrack = null;
      stream.onremovetrack = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }
    };
  }, [stream, muted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted || (isDeafened && !muted);
      
      if (!videoRef.current.muted && videoRef.current.paused && !muted) {
        videoRef.current.play().catch(e => {
          if (e.name !== 'AbortError') {
            console.error("Video play error in effect:", e);
          }
        });
      }
    }
  }, [volume, isMuted, isDeafened, muted]);

  // Update internal mute state if prop changes (e.g. for local stream)
  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

  return (
    <div 
      className="relative w-full h-full group bg-black cursor-pointer"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={() => {
        if (isMuted || isDeafened) {
          setIsMuted(false);
          useAppStore.getState().setIsDeafened(false);
        }
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted || (isDeafened && !muted)}
        className="w-full h-full object-contain"
      />
      
      {hasAudio && !muted && (isMuted || isDeafened) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-zinc-900/90 border border-white/10 shadow-2xl scale-90 group-hover:scale-100 transition-transform">
            <div className="p-4 bg-red-500/20 rounded-full">
              <VolumeX className="w-8 h-8 text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold">Son désactivé</p>
              <p className="text-zinc-400 text-xs mt-1">Cliquez pour activer l'audio</p>
            </div>
          </div>
        </div>
      )}

      {hasAudio && !muted && (
        <div className={clsx(
          "absolute bottom-4 right-4 bg-zinc-900/90 backdrop-blur-sm p-2 rounded-lg flex items-center gap-2 border border-zinc-700/50 transition-all duration-300 shadow-xl z-20",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        )}>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-300 hover:text-white transition-colors"
            title={isMuted ? "Réactiver le son" : "Couper le son"}
          >
            {(isMuted || isDeafened || volume === 0) ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-indigo-400" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={(isMuted || isDeafened) ? 0 : volume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setVolume(val);
              if (val > 0 && isMuted) setIsMuted(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-24 accent-indigo-500 cursor-pointer"
          />
        </div>
      )}

      {hasAudio && !muted && (isMuted || isDeafened) && !showControls && (
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm p-1.5 rounded-full border border-white/10">
          <VolumeX className="w-4 h-4 text-red-400/80" />
        </div>
      )}
    </div>
  );
}
