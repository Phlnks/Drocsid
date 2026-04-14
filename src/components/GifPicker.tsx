import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Tenor API key (public test key)
  const TENOR_API_KEY = 'LIVDSRZULELA';

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

  useEffect(() => {
    const fetchTrending = async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://g.tenor.com/v1/trending?key=${TENOR_API_KEY}&limit=20`);
        const data = await res.json();
        if (data.results) {
          setGifs(data.results);
        }
      } catch (error) {
        console.error('Error fetching trending GIFs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, []);

  useEffect(() => {
    if (!query.trim()) return;

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=20`);
        const data = await res.json();
        if (data.results) {
          setGifs(data.results);
        }
      } catch (error) {
        console.error('Error searching GIFs:', error);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  return (
    <div ref={pickerRef} className="absolute bottom-full right-0 mb-2 w-72 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50 flex flex-col h-96">
      <div className="p-3 border-b border-zinc-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un GIF..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            autoFocus
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {loading && gifs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.media[0].gif.url)}
                className="relative aspect-square rounded-md overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all focus:outline-none"
              >
                <img
                  src={gif.media[0].tinygif.url}
                  alt="GIF"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
