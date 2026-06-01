import { useEffect, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import VideoPlayer from './VideoPlayer';
import type { RemoteAudioTrack } from 'livekit-client';
import { useTranslation } from 'react-i18next';

function StreamAudioPlayer({
  ownerId,
  track,
  volume,
  muted,
  selectedSpeakerId,
}: {
  ownerId: string;
  track: RemoteAudioTrack;
  volume: number;
  muted: boolean;
  selectedSpeakerId?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.muted = muted;
    el.volume = Math.max(0, Math.min(1, volume));
    audioRef.current = el;

    track.attach(el);

    el.play().catch((e) => {
      console.error('[StreamAudio:viewer] playback failed', {
        ownerId,
        error: e?.message ?? e,
      });
    });

    return () => {
      track.detach(el);
      el.pause();
      el.srcObject = null;
      audioRef.current = null;
    };
  }, [ownerId, track]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!audioRef.current || !selectedSpeakerId) return;
    (audioRef.current as any).setSinkId?.(selectedSpeakerId).catch((e: any) => {
      console.error('[StreamAudio:viewer] setSinkId error', e);
    });
  }, [selectedSpeakerId]);

  return null;
}

export default function ScreenShareViewer() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const {
    remoteScreenShares,
    remoteScreenShareAudioTracks,
    localScreenShareStream,
    viewingScreenShares,
    streamVolume,
    isStreamVolumeMuted,
    isDeafened,
    voiceSettings,
    connectedVoiceChannelId,
    setStreamVolume,
    setIsStreamVolumeMuted,
    setViewingScreenShares,
    setActiveStreamFocus,
  } = useAppStore();

  const [poppedOutStreams, setPoppedOutStreams] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!connectedVoiceChannelId) {
      setViewingScreenShares(new Set());
      setActiveStreamFocus(null);
      setPoppedOutStreams(new Set());
    }
  }, [connectedVoiceChannelId, setViewingScreenShares, setActiveStreamFocus]);

  const handlePopOut = async (uid: string, stream: MediaStream) => {
    if (!connectedVoiceChannelId) return;

    if ('documentPictureInPicture' in window) {
      try {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 800,
          height: 600,
        });

        const wrapper = pipWindow.document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.position = 'relative';
        wrapper.style.background = '#000';

        const video = pipWindow.document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = uid === currentUser?.id;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.backgroundColor = '#000';

        wrapper.appendChild(video);
        pipWindow.document.body.style.margin = '0';
        pipWindow.document.body.style.backgroundColor = '#000';
        pipWindow.document.body.appendChild(wrapper);

        setPoppedOutStreams(prev => new Set(prev).add(uid));

        pipWindow.addEventListener('pagehide', () => {
          video.srcObject = null;
          setPoppedOutStreams(prev => {
            const next = new Set(prev);
            next.delete(uid);
            return next;
          });
        });
      } catch (err) {
        console.error('Failed to open PiP window:', err);
        fallbackPopOut(uid);
      }
    } else {
      fallbackPopOut(uid);
    }
  };

  const fallbackPopOut = (uid: string) => {
    if (!connectedVoiceChannelId) return;

    setPoppedOutStreams(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const allStreams = [
    ...(localScreenShareStream && currentUser && viewingScreenShares.has(currentUser.id)
      ? [[currentUser.id, localScreenShareStream] as const]
      : []),
    ...Array.from(Object.entries(remoteScreenShares)).filter(([uid]) =>
      viewingScreenShares.has(uid)
    ),
  ].filter(([uid]) => uid !== useAppStore.getState().activeStreamFocus);

  const audibleStreamIds = connectedVoiceChannelId
    ? Array.from(viewingScreenShares).filter(
        (uid) => uid !== currentUser?.id && !!remoteScreenShareAudioTracks[uid]
      )
    : [];

  if (!connectedVoiceChannelId) return null;
  if (allStreams.length === 0 && audibleStreamIds.length === 0) return null;

  return (
    <>
      {audibleStreamIds.map((uid) => {
        const audioTrack = remoteScreenShareAudioTracks[uid] as RemoteAudioTrack | undefined;
        if (!audioTrack) return null;

        return (
          <StreamAudioPlayer
            key={`stream-audio-${uid}`}
            ownerId={uid}
            track={audioTrack}
            volume={streamVolume}
            muted={isDeafened || isStreamVolumeMuted}
            selectedSpeakerId={voiceSettings.selectedSpeakerId}
          />
        );
      })}

      <div className="absolute top-14 md:top-4 right-4 z-50 flex flex-col gap-4 max-w-[220px] md:max-w-sm w-full pointer-events-none">
        {allStreams.map(([uid, stream]) => {
          if (poppedOutStreams.has(uid) && 'documentPictureInPicture' in window) return null;
          if (poppedOutStreams.has(uid)) return null;

          const isOwnStream = uid === currentUser?.id;
          const hasSeparateRemoteAudio = !isOwnStream && !!remoteScreenShareAudioTracks[uid];

          return (
            <div
              key={uid}
              className="bg-zinc-900 rounded-lg shadow-xl overflow-hidden pointer-events-auto border border-zinc-700 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
              onClick={() => {
                if (!connectedVoiceChannelId) return;
                useAppStore.getState().setActiveStreamFocus(uid);
                useAppStore.getState().setIsRightSidebarOpen(false);
              }}
            >
              <div className="bg-zinc-800 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-200 truncate">
                  {isOwnStream ? t('voice.yourScreenShare') : t('voice.screenShare')}
                </span>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePopOut(uid, stream);
                    }}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors"
                    title={t('voice.openInNewWindow')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      useAppStore.getState().setViewingScreenShares(prev => {
                        const next = new Set(prev);
                        next.delete(uid);
                        return next;
                      });
                    }}
                    className="text-zinc-400 hover:text-red-400 transition-colors"
                    title={t('common.closeStream')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="aspect-video bg-black relative">
                <VideoPlayer
                  stream={stream}
                  muted={isOwnStream}
                  showVolumeControls={!isOwnStream}
                  forceHasAudio={hasSeparateRemoteAudio}
                  externalVolume={streamVolume}
                  externalMuted={isStreamVolumeMuted || isDeafened}
                  onVolumeChange={setStreamVolume}
                  onToggleMuted={() => setIsStreamVolumeMuted(!isStreamVolumeMuted)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {Array.from(poppedOutStreams).filter(uid => !('documentPictureInPicture' in window)).length > 0 && (
        <div className="fixed inset-4 z-[100] bg-zinc-900 rounded-lg shadow-2xl overflow-hidden pointer-events-auto border border-zinc-700 flex flex-col">
          <div className="bg-zinc-800 px-4 py-3 flex items-center justify-between shrink-0">
            <span className="text-sm font-medium text-zinc-200">
              {t('voice.fullscreenShares')}
            </span>
            <button
              onClick={() =>
                setPoppedOutStreams(prev => {
                  const next = new Set(prev);
                  allStreams.forEach(([uid]) => next.delete(uid));
                  return next;
                })
              }
              className="p-1 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="flex-1 bg-black p-2 grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
          >
            {allStreams.map(([uid, stream]) => {
              if (!poppedOutStreams.has(uid) || 'documentPictureInPicture' in window) return null;

              const isOwnStream = uid === currentUser?.id;
              const hasSeparateRemoteAudio = !isOwnStream && !!remoteScreenShareAudioTracks[uid];

              return (
                <div
                  key={`fallback-${uid}`}
                  className="relative bg-zinc-900 rounded border border-zinc-800 overflow-hidden flex flex-col"
                >
                  <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-1 rounded text-xs text-white">
                    {isOwnStream ? t('voice.you') : t('voice.participant')}
                  </div>
                  <button
                    onClick={() => fallbackPopOut(uid)}
                    className="absolute top-2 right-2 z-10 p-1 bg-black/60 hover:bg-black/80 rounded text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <VideoPlayer
                    stream={stream}
                    muted={isOwnStream}
                    showVolumeControls={!isOwnStream}
                    forceHasAudio={hasSeparateRemoteAudio}
                    externalVolume={streamVolume}
                    externalMuted={isStreamVolumeMuted || isDeafened}
                    onVolumeChange={setStreamVolume}
                    onToggleMuted={() => setIsStreamVolumeMuted(!isStreamVolumeMuted)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}