import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RenameChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newName: string) => void;
  initialName: string;
}

export default function RenameChannelModal({ isOpen, onClose, onSubmit, initialName }: RenameChannelModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName.replace(' [AFK]', ''));

  useEffect(() => {
    setName(initialName.replace(' [AFK]', ''));
  }, [initialName, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t('modals.renameChannel.title')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">
              {t('modals.renameChannel.channelName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-950 text-zinc-100 px-3 py-2 rounded border border-zinc-800 focus:border-indigo-500 focus:outline-none transition-colors"
              autoFocus
              placeholder={t('modals.renameChannel.placeholder')}
            />
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:underline"
            >
              {t('modals.renameChannel.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim() === initialName}
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
            >
              {t('modals.renameChannel.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
