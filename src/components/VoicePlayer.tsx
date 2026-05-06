import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface VoicePlayerProps {
  url: string;
  filename?: string;
}

export default function VoicePlayer({ url, filename }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-zinc-800 border border-zinc-700/50 rounded-2xl p-3 mt-2 max-w-sm flex items-center gap-4 shadow-sm group hover:border-zinc-700 transition-all">
      <audio 
        ref={audioRef} 
        src={url} 
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        hidden
      />
      
      <button 
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white hover:bg-indigo-600 transition-colors shrink-0 shadow-lg shadow-indigo-500/20"
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {filename && (
          <div className="text-[11px] font-medium text-zinc-400 truncate mb-0.5" title={filename}>
            {filename}
          </div>
        )}
        <div className="relative h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 h-full bg-indigo-400 transition-all duration-100 ease-linear"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-medium text-indigo-300">
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-1">
             <Volume2 className="w-3 h-3 text-zinc-500" />
             <span className="text-[10px] font-mono font-medium text-zinc-500">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
