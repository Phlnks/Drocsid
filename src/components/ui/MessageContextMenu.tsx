import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Smile, 
  Reply, 
  Pin, 
  PinOff, 
  Pencil, 
  Trash2, 
  Copy, 
  Check, 
  Hash, 
  Flag,
  Plus
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { copyToClipboard } from '../../lib/utils';

export interface MessageContextMenuProps {
  message: {
    id: string;
    content: string;
    author_id: string;
    is_pinned?: boolean;
    reactions?: Record<string, string[]>;
    [key: string]: any;
  };
  authorUsername?: string;
  position: { x: number; y: number };
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  canReply?: boolean;
  canReact?: boolean;
  canReport?: boolean;
  onClose: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onTogglePin?: () => void;
  onReaction?: (emoji: string) => void;
  onOpenFullEmojiPicker?: () => void;
  onReport?: () => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageContextMenu({
  message,
  position,
  canEdit,
  canDelete,
  canPin,
  canReply = true,
  canReact = true,
  canReport = false,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onTogglePin,
  onReaction,
  onOpenFullEmojiPicker,
  onReport,
}: MessageContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({
    x: position.x,
    y: position.y,
  });

  // Calculate position with boundary safety to never get truncated
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 12;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    let targetX = position.x;
    let targetY = position.y;

    if (targetX + rect.width > winWidth - margin) {
      targetX = Math.max(margin, winWidth - rect.width - margin);
    }
    if (targetY + rect.height > winHeight - margin) {
      targetY = Math.max(margin, winHeight - rect.height - margin);
    }

    targetX = Math.max(margin, targetX);
    targetY = Math.max(margin, targetY);

    setCoords({ x: targetX, y: targetY });
  }, [position.x, position.y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const handleCopyText = async () => {
    if (!message.content) return;
    try {
      await copyToClipboard(message.content);
      setCopiedText(true);
      setTimeout(() => {
        setCopiedText(false);
        onClose();
      }, 600);
    } catch (e) {
      console.error('Failed to copy text', e);
      onClose();
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className={clsx(
        "fixed z-[9999] bg-zinc-950 border border-zinc-800/90 rounded-lg shadow-2xl py-1.5 w-[220px] text-zinc-200 select-none animate-in fade-in zoom-in duration-75 text-sm font-medium backdrop-blur-md"
      )}
      style={{ left: coords.x, top: coords.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Quick Emoji Reaction Bar */}
      {canReact && (
        <div className="px-2 pt-1 pb-2 mb-1 border-b border-zinc-800/80">
          <div className="flex items-center justify-between gap-1 bg-zinc-900/90 p-1 rounded-md border border-zinc-800/50">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReaction?.(emoji);
                  onClose();
                }}
                className="w-7 h-7 flex items-center justify-center text-lg rounded hover:bg-zinc-700/60 hover:scale-125 transition-all"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
            {onOpenFullEmojiPicker && (
              <button
                type="button"
                onClick={() => {
                  onOpenFullEmojiPicker();
                  onClose();
                }}
                className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors"
                title={t('chatArea.moreEmojis')}
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Actions */}
      <div className="px-1 space-y-0.5">
        {canReact && onOpenFullEmojiPicker && (
          <button
            type="button"
            onClick={() => {
              onOpenFullEmojiPicker();
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-zinc-300 hover:bg-indigo-600 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Smile className="w-4 h-4 text-zinc-400 group-hover:text-white" />
              {t('chatArea.addReaction')}
            </span>
          </button>
        )}

        {canReply && onReply && (
          <button
            type="button"
            onClick={() => {
              onReply();
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-zinc-300 hover:bg-indigo-600 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Reply className="w-4 h-4 text-zinc-400" />
              {t('chatArea.reply')}
            </span>
          </button>
        )}

        {canEdit && onEdit && (
          <button
            type="button"
            onClick={() => {
              onEdit();
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-zinc-300 hover:bg-indigo-600 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Pencil className="w-4 h-4 text-zinc-400" />
              {t('chatArea.editMessage')}
            </span>
          </button>
        )}

        {canPin && onTogglePin && (
          <button
            type="button"
            onClick={() => {
              onTogglePin();
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-zinc-300 hover:bg-indigo-600 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2.5">
              {message.is_pinned ? (
                <PinOff className="w-4 h-4 text-indigo-400" />
              ) : (
                <Pin className="w-4 h-4 text-zinc-400" />
              )}
              {message.is_pinned ? t('chatArea.unpinMessage') : t('chatArea.pinMessage')}
            </span>
          </button>
        )}
      </div>

      {/* Utilities Section */}
      <div className="h-px bg-zinc-800/80 my-1 mx-1" />

      <div className="px-1 space-y-0.5">
        {message.content && (
          <button
            type="button"
            onClick={handleCopyText}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-zinc-300 hover:bg-indigo-600 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2.5">
              {copiedText ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 text-zinc-400" />
              )}
              {copiedText ? t('chatArea.copied') : t('chatArea.copyText')}
            </span>
          </button>
        )}

        {canReport && onReport && (
          <button
            type="button"
            onClick={() => {
              onReport();
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-zinc-300 hover:bg-amber-600 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <Flag className="w-4 h-4 text-amber-400" />
              {t('chatArea.reportMessage')}
            </span>
          </button>
        )}
      </div>

      {/* Danger Zone: Delete */}
      {canDelete && onDelete && (
        <>
          <div className="h-px bg-zinc-800/80 my-1 mx-1" />
          <div className="px-1">
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-red-400 hover:bg-red-600 hover:text-white transition-colors group"
            >
              <span className="flex items-center gap-2.5">
                <Trash2 className="w-4 h-4 text-red-400 group-hover:text-white" />
                {t('chatArea.deleteMessage')}
              </span>
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
