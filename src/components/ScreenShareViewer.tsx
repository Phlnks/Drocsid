import { useEffect, useRef, useState } from 'react';
import { Maximize2, X, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import VideoPlayer from './VideoPlayer';

export default function ScreenShareViewer() {
  const { user: currentUser } = useAuthStore();
  const { remoteScreenShares, localScreenShareStream, viewingScreenShares } = useAppStore();
  const [poppedOutStreams, setPoppedOutStreams] = useState<Set<string>>(new Set());

  const handlePopOut = async (uid: string, stream: MediaStream) => {
    if ('documentPictureInPicture' in window) {
      try {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 800,
          height: 600,
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.backgroundColor = '#000';
        
        pipWindow.document.body.style.margin = '0';
        pipWindow.document.body.style.backgroundColor = '#000';
        pipWindow.document.body.appendChild(video);

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
        console.error("Failed to open PiP window:", err);
        fallbackPopOut(uid, stream);
      }
    } else {
      fallbackPopOut(uid, stream);
    }
  };

  const fallbackPopOut = (uid: string, stream: MediaStream) => {
    // Fallback to in-app floating window if needed, but for now just toggle state
    // We'll render it in the main UI
    setPoppedOutStreams(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const allStreams = [
    ...(localScreenShareStream && currentUser && viewingScreenShares.has(currentUser.id) ? [[currentUser.id, localScreenShareStream] as const] : []),
    ...Array.from(Object.entries(remoteScreenShares)).filter(([uid]) => viewingScreenShares.has(uid))
  ].filter(([uid]) => uid !== useAppStore.getState().activeStreamFocus);

  if (allStreams.length === 0) return null;

  return (
    <>
      <div className="absolute top-14 md:top-4 right-4 z-50 flex flex-col gap-4 max-w-[200px] md:max-w-sm w-full pointer-events-none">
        {allStreams.map(([uid, stream]) => {
          if (poppedOutStreams.has(uid) && 'documentPictureInPicture' in window) {
            return null; // It's in a real separate window
          }

          const isPoppedOutFallback = poppedOutStreams.has(uid) && !('documentPictureInPicture' in window);

          if (isPoppedOutFallback) return null; // Rendered separately below

          return (
            <div 
              key={uid} 
              className="bg-zinc-900 rounded-lg shadow-xl overflow-hidden pointer-events-auto border border-zinc-700 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
              onClick={() => useAppStore.getState().setActiveStreamFocus(uid)}
            >
              <div className="bg-zinc-800 px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-200">
                  {uid === currentUser?.id ? 'Votre partage d\'écran' : 'Partage d\'écran'}
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handlePopOut(uid, stream); }}
                    className="text-zinc-400 hover:text-zinc-100 transition-colors"
                    title="Ouvrir dans une nouvelle fenêtre"
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
                    title="Fermer le stream"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="aspect-video bg-black relative">
                <VideoPlayer stream={stream} muted={uid === currentUser?.id} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Fallback Fullscreen Modals (Grid) */}
      {Array.from(poppedOutStreams).filter(uid => !('documentPictureInPicture' in window) || uid !== Array.from(poppedOutStreams)[0]).length > 0 && (
        <div className="fixed inset-4 z-[100] bg-zinc-900 rounded-lg shadow-2xl overflow-hidden pointer-events-auto border border-zinc-700 flex flex-col">
          <div className="bg-zinc-800 px-4 py-3 flex items-center justify-between shrink-0">
            <span className="text-sm font-medium text-zinc-200">
              Partages d'écran en plein écran
            </span>
            <button 
              onClick={() => {
                // Close all fallback popouts
                setPoppedOutStreams(prev => {
                  const next = new Set(prev);
                  allStreams.forEach(([uid]) => {
                    if (!('documentPictureInPicture' in window) || uid !== Array.from(prev)[0]) {
                      next.delete(uid);
                    }
                  });
                  return next;
                });
              }}
              className="p-1 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 bg-black p-2 grid gap-2" style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`
          }}>
            {allStreams.map(([uid, stream]) => {
              const isPoppedOutFallback = poppedOutStreams.has(uid) && (!('documentPictureInPicture' in window) || uid !== Array.from(poppedOutStreams)[0]);
              if (!isPoppedOutFallback) return null;

              return (
                <div key={`fallback-${uid}`} className="relative bg-zinc-900 rounded border border-zinc-800 overflow-hidden flex flex-col">
                  <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-1 rounded text-xs text-white">
                    {uid === 'local' ? 'Vous' : 'Participant'}
                  </div>
                  <button 
                    onClick={() => handlePopOut(uid, stream)}
                    className="absolute top-2 right-2 z-10 p-1 bg-black/60 hover:bg-black/80 rounded text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <VideoPlayer stream={stream} muted={uid === currentUser?.id} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
