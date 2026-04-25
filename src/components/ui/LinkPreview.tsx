import { useState, useEffect } from 'react';

const previewCache = new Map<string, any>();

export default function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetadata = async () => {
      if (previewCache.has(url)) {
        setData(previewCache.get(url));
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        const json = await res.json();
        if (json.status === 'success') {
          previewCache.set(url, json.data);
          setData(json.data);
        }
      } catch (e) {
        console.error("Failed to fetch link preview", e);
      } finally {
        setLoading(false);
      }
    };
    fetchMetadata();
  }, [url]);

  if (loading) return null;
  if (!data || (!data.title && !data.image)) return null;

  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="mt-2 flex flex-col max-w-md bg-zinc-800/50 rounded-md overflow-hidden border border-zinc-700/50 hover:bg-zinc-800 transition-colors"
    >
      <div className="p-3">
        <div className="text-zinc-300 font-semibold text-sm truncate">{data.title || data.publisher}</div>
        {data.description && (
          <div className="text-zinc-400 text-xs mt-1 line-clamp-2">{data.description}</div>
        )}
      </div>
      {data.image?.url && (
        <img 
          src={data.image.url} 
          alt="Preview" 
          className="w-full max-h-64 object-cover border-t border-zinc-700/50"
          referrerPolicy="no-referrer"
        />
      )}
    </a>
  );
}
