import { useEffect, useRef } from 'react';

export default function VideoPlayer({
  stream,
  muted = false,
}: {
  stream: MediaStream;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let watchdogInterval: ReturnType<typeof setInterval> | null = null;

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
        audioTracks: stream.getAudioTracks().length,
        readyState: currentTrack?.readyState,
        enabled: currentTrack?.enabled,
        muted: currentTrack?.muted,
      });

      el.srcObject = null;

      requestAnimationFrame(() => {
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        safePlay();
      });
    };

    const handleLoadedMetadata = () => {
      console.log('[VideoPlayer] loadedmetadata');
      safePlay();
    };

    const handleCanPlay = () => {
      console.log('[VideoPlayer] canplay');
      safePlay();
    };

    const handlePlaying = () => {
      console.log('[VideoPlayer] playing');
    };

    const handleWaiting = () => {
      console.warn('[VideoPlayer] waiting');
    };

    const handleVideoTrackUnmute = () => {
      console.log('[VideoPlayer] video track unmuted');
      bindStream('video-track-unmute');
    };

    const handleVideoTrackEnded = () => {
      console.warn('[VideoPlayer] video track ended');
    };

    const handleAddTrack = () => {
      console.log('[VideoPlayer] stream addtrack');
      bindStream('stream-addtrack');
    };

    const handleRemoveTrack = () => {
      console.log('[VideoPlayer] stream removetrack');
      bindStream('stream-removetrack');
    };

    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted;

    const videoTrack = stream.getVideoTracks()[0];

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);

    stream.addEventListener('addtrack', handleAddTrack);
    stream.addEventListener('removetrack', handleRemoveTrack);

    if (videoTrack) {
      videoTrack.addEventListener('unmute', handleVideoTrackUnmute);
      videoTrack.addEventListener('ended', handleVideoTrackEnded);
    }

    bindStream('initial');

    fallbackTimeout = setTimeout(() => {
      if (cancelled || !videoRef.current) return;

      const el = videoRef.current;
      const noVisualProgress =
        el.readyState < 2 ||
        el.videoWidth === 0 ||
        el.videoHeight === 0;

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
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);

      stream.removeEventListener('addtrack', handleAddTrack);
      stream.removeEventListener('removetrack', handleRemoveTrack);

      if (videoTrack) {
        videoTrack.removeEventListener('unmute', handleVideoTrackUnmute);
        videoTrack.removeEventListener('ended', handleVideoTrackEnded);
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [stream, muted]);

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
      />
    </div>
  );
}