import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';

export default function VideoPlayer({
  stream,
  muted = false,
  showVolumeControls = false,
  forceHasAudio = false,
  externalVolume,
  externalMuted,
  onVolumeChange,
  onToggleMuted,
  controlsMode = 'hover',
}: {
  stream: MediaStream;
  muted?: boolean;
  showVolumeControls?: boolean;
  forceHasAudio?: boolean;
  externalVolume?: number;
  externalMuted?: boolean;
  onVolumeChange?: (value: number) => void;
  onToggleMuted?: () => void;
  controlsMode?: 'hover' | 'always';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [internalVolume, setInternalVolume] = useState(1);
  const [internalMuted, setInternalMuted] = useState(muted);

  const effectiveMuted = typeof externalMuted === 'boolean' ? externalMuted : internalMuted;
  const effectiveVolume = typeof externalVolume === 'number' ? externalVolume : internalVolume;
  const shouldShowAudioUi = showVolumeControls && !muted && (hasAudio || forceHasAudio);
  const controlsVisible = controlsMode === 'always' ? true : showControls;

  useEffect(() => {
    setInternalMuted(muted);
  }, [muted]);

  // Volume/muted sync — séparé du bind stream
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = Math.max(0, Math.min(1, effectiveVolume));
    videoRef.current.muted = muted;
  }, [effectiveVolume, muted]);

  // Bind stream — NE dépend PAS du volume pour éviter les rebinds
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let watchdogInterval: ReturnType<typeof setInterval> | null = null;

    const updateHasAudio = () => {
      if (cancelled) return;
      setHasAudio(stream.getAudioTracks().length > 0);
    };

    const safePlay = () => {
      if (cancelled || !videoRef.current) return;
      videoRef.current.play().catch((e) => {
        if (e?.name !== 'AbortError') {
          console.warn('[VideoPlayer] play failed', e);
        }
      });
    };

    const bindStream = (reason: string) => {
      if (cancelled || !videoRef.current) return;
      const el = videoRef.current;
      const currentTrack = stream.getVideoTracks()[0];

      console.log('[VideoPlayer] bindStream', {
        reason,
        videoTracks: stream.getVideoTracks().length,
        readyState: currentTrack?.readyState,
        enabled: currentTrack?.enabled,
        muted: currentTrack?.muted,
      });

      // Reset seulement si nécessaire
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        safePlay();
      } else {
        // Force un rebind propre en cas de track gelée
        el.srcObject = null;
        requestAnimationFrame(() => {
          if (cancelled || !videoRef.current) return;
          videoRef.current.srcObject = stream;
          safePlay();
        });
      }
    };

    const handleLoadedMetadata = () => safePlay();
    const handleCanPlay = () => safePlay();

    const handleVideoTrackUnmute = () => bindStream('video-track-unmute');

    const handleAddTrack = () => {
      updateHasAudio();
      bindStream('stream-addtrack');
    };

    const handleRemoveTrack = () => {
      updateHasAudio();
      bindStream('stream-removetrack');
    };

    updateHasAudio();

    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted;
    video.volume = Math.max(0, Math.min(1, typeof externalVolume === 'number' ? externalVolume : 1));

    const videoTrack = stream.getVideoTracks()[0];

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    stream.addEventListener('addtrack', handleAddTrack);
    stream.addEventListener('removetrack', handleRemoveTrack);

    if (videoTrack) {
      videoTrack.addEventListener('unmute', handleVideoTrackUnmute);
    }

    // Bind initial : immédiat si la track est déjà live
    const track = stream.getVideoTracks()[0];
    if (track && track.readyState === 'live') {
      video.srcObject = stream;
      safePlay();
    } else {
      bindStream('initial');
    }

    fallbackTimeout = setTimeout(() => {
      if (cancelled || !videoRef.current) return;
      const el = videoRef.current;
      const noVisualProgress = el.readyState < 2 || el.videoWidth === 0 || el.videoHeight === 0;
      if (noVisualProgress) {
        console.warn('[VideoPlayer] fallback rebind triggered');
        bindStream('fallback-timeout');
      }
    }, 700);

    watchdogInterval = setInterval(() => {
      if (cancelled || !videoRef.current) return;
      const el = videoRef.current;
      const hasVideoTrack = stream.getVideoTracks().length > 0;
      if (!hasVideoTrack) return;
      const looksStuck =
        !el.paused &&
        el.currentTime < 0.05 &&
        (el.videoWidth === 0 || el.readyState < 2);
      if (looksStuck) {
        console.warn('[VideoPlayer] watchdog rebind triggered');
        bindStream('watchdog');
      }
    }, 2000);

    return () => {
      cancelled = true;
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (watchdogInterval) clearInterval(watchdogInterval);

      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      stream.removeEventListener('addtrack', handleAddTrack);
      stream.removeEventListener('removetrack', handleRemoveTrack);

      if (videoTrack) {
        videoTrack.removeEventListener('unmute', handleVideoTrackUnmute);
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [stream, muted]); // ← Volume retiré des dépendances intentionnellement

  return (
    <div
      className="relative w-full h-full bg-black group"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
      />

      {shouldShowAudioUi && (
        <div
          className={clsx(
            'absolute bottom-4 right-4 bg-zinc-900/90 backdrop-blur-sm p-2 rounded-lg flex items-center gap-2 border border-zinc-700/50 transition-all duration-300 shadow-xl z-30',
            controlsVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 pointer-events-none'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              if (onToggleMuted) {
                onToggleMuted();
              } else {
                setInternalMuted(!internalMuted);
              }
            }}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-300 hover:text-white transition-colors"
            title={effectiveMuted ? 'Réactiver le son' : 'Couper le son'}
          >
            {effectiveMuted || effectiveVolume === 0 ? (
              <VolumeX className="w-5 h-5 text-red-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-indigo-400" />
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={effectiveMuted ? 0 : effectiveVolume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (onVolumeChange) {
                onVolumeChange(val);
              } else {
                setInternalVolume(val);
                if (val > 0 && internalMuted) setInternalMuted(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-24 accent-indigo-500 cursor-pointer"
          />
        </div>
      )}

      {shouldShowAudioUi && (effectiveMuted || effectiveVolume === 0) && !controlsVisible && (
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm p-1.5 rounded-full border border-white/10 z-20">
          <VolumeX className="w-4 h-4 text-red-400/80" />
        </div>
      )}
    </div>
  );
}