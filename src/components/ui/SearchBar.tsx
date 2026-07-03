import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Filter, Loader2, Calendar, FileType, User, Hash } from 'lucide-react';
import { supabase } from '../../supabase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import UserAvatar from './UserAvatar';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
  channelId: string;
  serverId?: string;
  isDM?: boolean;
  onJumpToMessage: (id: string) => void;
  usersMap: Record<string, any>;
}

export default function SearchBar({ channelId, serverId, isDM = false, onJumpToMessage, usersMap }: SearchBarProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() && Object.keys(parseQuery(query)).length === 0) return;

    setIsSearching(true);
    setHasSearched(true);
    setIsOpen(true);

    const { from, has, search, attr } = parseQuery(query);
    const filterHas = has || attr;

    // Use RPC if available, but since we cannot easily modify schema right now without breaking,
    // we'll use PostgREST filters combined with client side refinement if necessary.
    let q = supabase
      .from(isDM ? 'dm_messages' : 'messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    // Apply Scope
    if (isDM) {
      q = q.eq('dm_id', channelId);
    } else {
      q = q.eq('channel_id', channelId);
      // To scale to server-wide later: q.eq('server_id', serverId)
    }

    // Apply text search
    if (search) {
      q = q.ilike('content', `%${search}%`);
    }

    // Apply user filter ('from:username')
    if (from) {
      // Find user ID from usersMap
      const targetUser = Object.values(usersMap).find(
        (u: any) => u.username?.toLowerCase() === from.toLowerCase() || u.display_name?.toLowerCase() === from.toLowerCase()
      );
      if (targetUser) {
        q = q.eq('author_id', targetUser.id);
      } else {
        // If user not found, force empty result
        q = q.eq('author_id', '00000000-0000-0000-0000-000000000000'); 
      }
    }

    const { data, error } = await q;

    if (error) {
      console.error("Search error", error);
      setIsSearching(false);
      return;
    }

    let finalResults = data || [];

    // Apply array/JSON filtering client-side for "has:file" / "attr:video" etc.
    if (filterHas) {
      finalResults = finalResults.filter(msg => {
        if (!msg.attachments || msg.attachments.length === 0) return false;
        
        if (filterHas === 'file' || filterHas === 'fichier') return true;
        
        return msg.attachments.some((att: any) => {
          if (filterHas === 'image' && att.type === 'image') return true;
          if (filterHas === 'video' && att.type === 'video') return true;
          if ((filterHas === 'audio' || filterHas === 'vocal') && att.type === 'audio') return true;
          if (filterHas === 'link' || filterHas === 'lien') return !!msg.content.match(/https?:\/\//);
          return false;
        });
      });
    }

    setResults(finalResults);
    setIsSearching(false);
  };

  const parseQuery = (text: string) => {
    const filters = { from: '', has: '', attr: '', search: '' };
    const parts = text.split(' ');
    const remaining = [];
    
    for (const part of parts) {
      if (part.startsWith('from:')) filters.from = part.substring(5);
      else if (part.startsWith('has:')) filters.has = part.substring(4);
      else if (part.startsWith('attr:')) filters.attr = part.substring(5);
      else remaining.push(part);
    }
    filters.search = remaining.join(' ').trim();
    return filters;
  };

  const insertFilter = (filterText: string) => {
    setQuery(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed} ${filterText}` : filterText;
    });
    inputRef.current?.focus();
  };

  return (
    <div className="relative" ref={containerRef}>
      <form 
        onSubmit={handleSearch}
        className="relative flex items-center"
      >
        <div className={`flex items-center bg-zinc-900 border transition-all duration-200 overflow-hidden ${isOpen ? 'border-indigo-500 ring-2 ring-indigo-500/20 w-64 rounded-md' : 'border-zinc-700 w-48 rounded-md hover:border-zinc-500'}`}>
          <input
            ref={inputRef}
            type="text"
            placeholder={t("chatArea.searchPlaceholder", "Rechercher...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            className="w-full bg-transparent border-none text-sm text-zinc-200 px-3 py-1.5 focus:outline-none placeholder:text-zinc-500"
          />
          <div className="pr-3 flex items-center">
            {query ? (
              <button 
                type="button" 
                onClick={() => { setQuery(''); setResults([]); setHasSearched(false); }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <Search className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </div>
      </form>

      {/* Search Flyout / Results Panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 max-h-[400px] bg-zinc-800 border border-zinc-700 shadow-2xl rounded-lg overflow-y-auto custom-scrollbar z-50 flex flex-col">
          
          {!query && !hasSearched && (
            <div className="p-3 text-xs flex flex-col gap-2">
              <div className="text-zinc-400 font-semibold uppercase tracking-wider mb-1">Filtres de recherche</div>
              <button onClick={() => insertFilter('from:')} className="flex items-center gap-2 text-zinc-300 hover:bg-zinc-700 p-2 rounded-md transition-colors text-left">
                <User className="w-4 h-4 text-indigo-400" />
                <span><span className="font-semibold">from:</span> utilisateur</span>
              </button>
              <button onClick={() => insertFilter('has:file')} className="flex items-center gap-2 text-zinc-300 hover:bg-zinc-700 p-2 rounded-md transition-colors text-left">
                <FileType className="w-4 h-4 text-emerald-400" />
                <span><span className="font-semibold">has:file</span> messages avec fichiers</span>
              </button>
              <button onClick={() => insertFilter('has:image')} className="flex items-center gap-2 text-zinc-300 hover:bg-zinc-700 p-2 rounded-md transition-colors text-left">
                <Filter className="w-4 h-4 text-sky-400" />
                <span><span className="font-semibold">has:image</span> messages avec images</span>
              </button>
            </div>
          )}

          {isSearching && (
            <div className="flex-1 flex items-center justify-center py-8 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500 shrink-0" />
              <span className="ml-3 text-sm">Recherche en cours...</span>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-zinc-500">
              <Search className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-sm">Aucun résultat trouvé</span>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="flex flex-col">
              <div className="sticky top-0 bg-zinc-800/95 backdrop-blur-sm border-b border-zinc-700 p-2 text-xs font-semibold text-zinc-400 z-10 flex justify-between items-center">
                <span>{results.length} résultat{results.length > 1 ? 's' : ''}</span>
              </div>
              <div className="px-2 py-2">
                {results.map((msg) => {
                  const author = usersMap[msg.author_id];
                  const timestamp = new Date(msg.created_at);
                  
                  return (
                    <div 
                      key={msg.id} 
                      onClick={() => {
                        setIsOpen(false);
                        onJumpToMessage(msg.id);
                      }}
                      className="group flex flex-col gap-1 p-3 rounded-md hover:bg-zinc-700/50 cursor-pointer transition-colors border border-transparent hover:border-zinc-600/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserAvatar user={author || { username: 'User' }} size="sm" showStatus={false} />
                          <span className="text-sm font-medium text-zinc-200">{author?.username || 'User'}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {format(timestamp, 'dd MMM', { locale: fr })}
                        </span>
                      </div>
                      
                      <div className="text-sm text-zinc-300 line-clamp-3 ml-7">
                        {msg.content}
                      </div>

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="ml-7 mt-1 text-xs text-indigo-400 flex items-center gap-1 bg-indigo-500/10 self-start px-2 py-1 rounded w-fit">
                          <FileType className="w-3 h-3" />
                          <span>{msg.attachments.length} fichier{msg.attachments.length > 1 ? 's' : ''} joint{msg.attachments.length > 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
