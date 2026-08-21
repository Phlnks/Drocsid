import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Sparkles } from 'lucide-react';

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // GIPHY public beta API key
  const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest('button[title="Ajouter un GIF"]')) {
          return;
        }
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Load trending gifs on initial mount or when query is cleared
  useEffect(() => {
    if (query.trim()) return;

    let isMounted = true;
    const fetchTrending = async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`);
        const data = await res.json();
        if (isMounted && data.data) {
          setGifs(data.data);
        }
      } catch (error) {
        console.error('Error fetching trending GIFs:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTrending();
    return () => {
      isMounted = false;
    };
  }, [query]);

  // Search gifs with debounce
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    let isMounted = true;
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(trimmed)}&limit=24&rating=g`);
        const data = await res.json();
        if (isMounted && data.data) {
          setGifs(data.data);
        }
      } catch (error) {
        console.error('Error searching GIFs:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(delayDebounceFn);
    };
  }, [query]);

  return (
    <div 
      ref={pickerRef} 
      id="gif-picker-popover"
      className="absolute bottom-full right-0 mb-2 w-80 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col h-[400px]"
    >
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/60">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            id="gif-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher sur GIPHY..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            autoFocus
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2.5 custom-scrollbar">
        {loading && gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            <span className="text-xs">Chargement des GIFs...</span>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
            <Sparkles className="w-8 h-8 text-zinc-600" />
            <span className="text-xs">Aucun GIF trouvé</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => {
              const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || gif.images?.original?.url;
              const fullUrl = gif.images?.original?.url || gif.images?.downsized_medium?.url || previewUrl;
              if (!previewUrl) return null;

              return (
                <button
                  key={gif.id}
                  id={`gif-item-${gif.id}`}
                  onClick={() => onSelect(fullUrl)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-indigo-500 hover:scale-[1.02] transition-all focus:outline-none group"
                >
                  <img
                    src={previewUrl}
                    alt={gif.title || 'GIF'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="px-3 py-1.5 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Propulsé par GIPHY</span>
        {loading && gifs.length > 0 && (
          <span className="flex items-center gap-1 text-indigo-400">
            <Loader2 className="w-3 h-3 animate-spin" /> Recherche...
          </span>
        )}
      </div>
    </div>
  );
}

