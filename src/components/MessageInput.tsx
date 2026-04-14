import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { PlusCircle, Loader2, Send, SmilePlus, X, Image as ImageIcon, AtSign } from 'lucide-react';
const EmojiPicker = lazy(() => import('emoji-picker-react'));
import PromptModal from './ui/PromptModal';
import socket from '../lib/socket';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const processImageForSupabase = async (file: File): Promise<string> => {
  const MAX_FILE_SIZE = 700 * 1024;

  if (file.size <= MAX_FILE_SIZE) {
    return await fileToBase64(file);
  }

  if (file.type === 'image/gif') {
    throw new Error("GIF_TOO_LARGE");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        
        if (compressedBase64.length > 1000000) {
          reject(new Error("IMAGE_STILL_TOO_LARGE"));
        } else {
          resolve(compressedBase64);
        }
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

import GifPicker from './GifPicker';

interface MessageInputProps {
  channelId: string;
  serverId: string;
  isDM?: boolean;
  replyingTo?: any;
  onCancelReply?: () => void;
}

export default function MessageInput({ channelId, serverId, isDM = false, replyingTo, onCancelReply }: MessageInputProps) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [promptConfig, setPromptConfig] = useState<{isOpen: boolean, title: string, label: string, onSubmit: (val: string) => void}>({
    isOpen: false, title: '', label: '', onSubmit: () => {}
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('*');
      if (data) setUsers(data);
    };
    fetchUsers();
  }, []);

  const filteredUsers = mentionQuery !== null 
    ? [{ username: 'everyone', id: 'everyone' }, ...users].filter(u => 
        (u.username || u.displayName || '').toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : [];

  const insertMention = (username: string) => {
    if (!inputRef.current) return;
    const cursorPosition = inputRef.current.selectionStart || 0;
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    
    const match = textBeforeCursor.match(/(?:^|\s)@([^"'\s]*)$/);
    if (match) {
      const start = cursorPosition - match[1].length - 1;
      const mentionText = /^[a-zA-Z0-9_-]+$/.test(username) ? `@${username}` : `@"${username}"`;
      const newContent = content.slice(0, start) + `${mentionText} ` + textAfterCursor;
      setContent(newContent);
      setMentionQuery(null);
      
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = start + mentionText.length + 1;
          inputRef.current.selectionEnd = start + mentionText.length + 1;
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    
    // Auto-resize textarea
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/(?:^|\s)@([^"'\s]*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }

    if (user) {
      socket.emit('typing', {
        channelId,
        userId: user.id,
        username: user.user_metadata?.username || 'User',
        isTyping: !!val.trim()
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredUsers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredUsers[mentionIndex].username);
      } else if (e.key === 'Escape') {
        setMentionQuery(null);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const sendPayload = async (textToSend: string, fileToSend: File | null, gifUrl: string | null = null) => {
    if ((!textToSend.trim() && !fileToSend && !gifUrl) || !user || isUploading) return;

    setIsUploading(true);
    let imageUrl = gifUrl;

    try {
      if (fileToSend) {
        const fileExt = fileToSend.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `chat-images/${channelId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, fileToSend);

        if (uploadError) {
          console.warn("Storage upload failed, falling back to base64 compression", uploadError);
          imageUrl = await processImageForSupabase(fileToSend);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath);
          imageUrl = publicUrl;
        }
      }

      let attachmentType = 'file';
      if (gifUrl || (fileToSend && fileToSend.type.startsWith('image/'))) {
        attachmentType = 'image';
      } else if (fileToSend && fileToSend.type.startsWith('video/')) {
        attachmentType = 'video';
      }

      const messageData: any = {
        author_id: user.id,
        content: textToSend.trim() || '',
        attachments: imageUrl ? [{ 
          url: imageUrl, 
          type: attachmentType,
          name: fileToSend?.name || (gifUrl ? 'gif' : 'file'),
          size: fileToSend?.size || 0
        }] : []
      };

      if (isDM) {
        messageData.dm_id = channelId;
      } else {
        messageData.channel_id = channelId;
        messageData.server_id = serverId;
      }

      if (replyingTo) {
        messageData.reply_to = replyingTo.id;
      }

      const tableName = isDM ? 'dm_messages' : 'messages';
      const { data: newMessage, error: insertError } = await supabase
        .from(tableName)
        .insert(messageData)
        .select()
        .maybeSingle();

      if (insertError || !newMessage) throw insertError || new Error("Failed to send message");

      // Emit via socket
      socket.emit(isDM ? 'new-dm-message' : 'new-message', newMessage);
      
      // Update last_message_at
      const parentTable = isDM ? 'dms' : 'channels';
      await supabase.from(parentTable).update({
        last_message_at: new Date().toISOString()
      }).eq('id', channelId);
      
      // Handle Mentions & Notifications (Simplified for now)
      // ...

      setContent('');
      setMentionQuery(null);
      if (onCancelReply) onCancelReply();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      if (user) {
        socket.emit('typing', {
          channelId,
          userId: user.id,
          username: user.user_metadata?.username || 'User',
          isTyping: false
        });
      }
      
      // Keep focus on input after sending
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    } catch (error: any) {
      console.error("Error sending message:", error);
      if (error.message === "GIF_TOO_LARGE") {
        alert("Ce GIF est trop lourd (max 700 Ko). Veuillez choisir un GIF plus léger.");
      } else if (error.message === "IMAGE_STILL_TOO_LARGE") {
        alert("Cette image est trop complexe pour être compressée suffisamment. Veuillez choisir une image plus légère.");
      } else {
        alert("Erreur lors de l'envoi du message.");
      }
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  };

  const handleFileSelect = async (e: any) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await sendPayload(content, file);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (mentionQuery !== null && filteredUsers.length > 0) {
      // If pressing enter while mention dropdown is open, insert mention instead of sending
      insertMention(filteredUsers[mentionIndex].username);
      return;
    }
    await sendPayload(content, null);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await sendPayload(content, file);
          break;
        }
      }
    }
  };

  const handleEmojiClick = (emojiData: any) => {
    setContent(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleGifClick = () => {
    setShowGifPicker(!showGifPicker);
  };

  const handleGifSelect = async (url: string) => {
    setShowGifPicker(false);
    await sendPayload(content, null, url);
  };

  const handleDrop = async (e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        await sendPayload(content, file);
      } else {
        alert("Seules les images sont supportées.");
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  return (
    <div className="p-4 pb-safe shrink-0 flex flex-col gap-2 relative">
      {mentionQuery !== null && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 w-64 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg overflow-hidden z-50">
          <div className="p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-700">
            Mentions
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filteredUsers.map((user, idx) => (
              <div
                key={user.id}
                onClick={() => insertMention(user.username)}
                className={`px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  idx === mentionIndex ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-700/50'
                }`}
              >
                <AtSign className="w-4 h-4 opacity-50" />
                <span className="font-medium">{user.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {replyingTo && (
        <div className="flex items-center justify-between bg-zinc-800/80 px-4 py-2 rounded-t-lg border-l-4 border-indigo-500 text-sm">
          <div className="flex items-center gap-2 text-zinc-300 truncate">
            <span className="font-semibold">En réponse à @{replyingTo.author_name}</span>
            <span className="text-zinc-500 truncate max-w-md">{replyingTo.content}</span>
          </div>
          <button onClick={onCancelReply} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      <form 
        onSubmit={handleSubmit} 
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`bg-zinc-700 flex items-center px-4 py-2 gap-3 ${replyingTo ? 'rounded-b-lg rounded-tr-lg' : 'rounded-lg'}`}
      >
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
          disabled={isUploading}
          title="Envoyer une image"
        >
          <PlusCircle className="w-6 h-6" />
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          accept="image/*"
          className="hidden" 
        />
        
        <textarea
          ref={inputRef}
          value={content}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={replyingTo ? `Répondre à @${replyingTo.author_name}...` : "Message..."}
          className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-zinc-100 placeholder-zinc-400 resize-none custom-scrollbar py-1"
          disabled={isUploading}
          rows={1}
          style={{ minHeight: '24px', maxHeight: '120px' }}
        />
        
        <div className="flex items-center gap-1 md:gap-2 relative shrink-0">
          <button 
            type="button"
            onClick={handleGifClick}
            className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center p-1"
            title="Ajouter un GIF"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {showGifPicker && (
            <GifPicker 
              onSelect={handleGifSelect} 
              onClose={() => setShowGifPicker(false)} 
            />
          )}

          <div className="relative flex items-center justify-center">
            <button 
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center p-1"
              title="Ajouter un emoji"
            >
              <SmilePlus className="w-5 h-5" />
            </button>
            
            {showEmojiPicker && (
              <div className="absolute right-0 bottom-full mb-4 z-50">
                <Suspense fallback={<div className="w-[300px] h-[350px] bg-zinc-800 rounded-lg flex items-center justify-center"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>}>
                  <EmojiPicker 
                    theme={'dark' as any} 
                    onEmojiClick={handleEmojiClick}
                    lazyLoadEmojis={true}
                    height={350}
                    width={300}
                  />
                </Suspense>
              </div>
            )}
          </div>

          {content.trim() && !isUploading && (
            <button 
              type="submit" 
              className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center justify-center p-1 ml-1"
            >
              <Send className="w-5 h-5" />
            </button>
          )}

          {isUploading && (
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin ml-1" />
          )}
        </div>
      </form>

      <PromptModal
        isOpen={promptConfig.isOpen}
        onClose={() => setPromptConfig(prev => ({ ...prev, isOpen: false }))}
        onSubmit={promptConfig.onSubmit}
        title={promptConfig.title}
        inputLabel={promptConfig.label}
      />
    </div>
  );
}
