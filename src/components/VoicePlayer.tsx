import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, AlertCircle, Download, Loader2 } from 'lucide-react';

interface VoicePlayerProps {
  url: string;
  filename?: string;
}

export default function VoicePlayer({ url, filename }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioSrc, setAudioSrc] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Reset state on url change
    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setError(false);
    setIsLoading(true);
    
    let isMounted = true;
    let currentObjectUrl = '';

    const loadAudioBlob = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        if (!isMounted) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setAudioSrc(currentObjectUrl);
        setIsLoading(false);
      } catch (err) {
        console.error("Audio blob fetch error, falling back to direct URL:", err);
        if (!isMounted) return;
        setAudioSrc(url);
        setIsLoading(false);
      }
    };

    loadAudioBlob();

    return () => {
      isMounted = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [url]);

  useEffect(() => {
    if (audioSrc && audioRef.current) {
      audioRef.current.load();
    }
  }, [audioSrc]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setError(false);
            })
            .catch((err) => {
              console.error("Audio playback error:", err);
              if (audioRef.current?.error) {
                console.error("Audio error code:", audioRef.current.error.code);
              }
              setError(true);
              setIsPlaying(false);
            });
        } else {
          setIsPlaying(true);
        }
      }
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      if (dur !== Infinity && !isNaN(dur)) {
        setDuration(dur);
      } else {
        // Fallback for WebM recorded audio that lacks initial duration
        setDuration(0);
      }
    }
    setError(false);
  };

  const onDurationChange = () => {
    if (audioRef.current && audioRef.current.duration !== Infinity && !isNaN(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      // Resolve WebM Infinity duration issue dynamically as it plays
      if ((duration === 0 || duration === Infinity) && audioRef.current.duration !== Infinity && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      } else if (duration === 0 && audioRef.current.currentTime > 0) {
        // If duration is stuck at 0 or Infinity, we can at least show progressing time as max duration trick
        setDuration(Math.max(duration, audioRef.current.currentTime));
      }
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      if (duration === 0 || duration === Infinity) {
        setDuration(audioRef.current.duration);
      }
    }
  };
  
  const onError = (e: any) => {
    console.error("Audio target error:", e);
    setError(true);
    setIsPlaying(false);
    setIsLoading(false);
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time) || time === Infinity) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressRatio = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div className="bg-zinc-800 border border-zinc-700/50 rounded-2xl p-3 mt-2 max-w-sm flex items-center gap-4 shadow-sm group hover:border-zinc-700 transition-all">
      <audio 
        ref={audioRef} 
        src={audioSrc} 
        preload="auto"
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onDurationChange}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={onError}
        className="hidden"
      />
      
      <button 
        onClick={togglePlay}
        disabled={error || isLoading}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 shadow-lg ${
          error ? 'bg-red-500/20 text-red-500 cursor-not-allowed' : 
          isLoading ? 'bg-zinc-700 text-zinc-400 cursor-wait' :
          'bg-indigo-500 text-white hover:bg-indigo-600 shadow-indigo-500/20'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : error ? (
          <AlertCircle className="w-5 h-5 opacity-80" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {filename && (
          <div className="flex justify-between items-center gap-2 mb-0.5">
            <div className="text-[11px] font-medium text-zinc-400 truncate" title={filename}>
              {filename}
            </div>
            {error && (
              <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer" 
                download={filename || 'audio_file'}
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[10px]"
                title="Télécharger le fichier manuellement"
              >
                <Download className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
        <div className="relative h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 h-full bg-indigo-400 transition-all duration-100 ease-linear"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-medium text-indigo-300">
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-1">
             <Volume2 className="w-3 h-3 text-zinc-500" />
             <span className="text-[10px] font-mono font-medium text-zinc-500">
              {error ? 'Erreur' : isLoading ? 'Chargement...' : formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
