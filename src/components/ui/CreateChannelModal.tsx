import { useState, useEffect } from 'react';
import { X, Hash, Volume2, Moon } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, type: 'TEXT' | 'VOICE' | 'AFK', categoryId: string | null) => void;
  categories: any[];
  initialCategoryId?: string | null;
}

export default function CreateChannelModal({ isOpen, onClose, onSubmit, categories, initialCategoryId = null }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<'TEXT' | 'VOICE' | 'AFK'>('TEXT');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('TEXT');
      setCategoryId(initialCategoryId);
    }
  }, [isOpen, initialCategoryId]);

  if (!isOpen) return null;

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim().toLowerCase().replace(/\s+/g, '-'), type, categoryId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-800 rounded-xl w-full max-w-md p-6 shadow-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-zinc-100">{t('modals.createChannel.title')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-xs font-bold text-zinc-300 uppercase mb-2">
              {t('modals.createChannel.channelType')}
            </label>
            <div className="flex flex-col gap-2">
              <div 
                onClick={() => setType('TEXT')}
                className={clsx(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                  type === 'TEXT' ? "bg-zinc-700 border-indigo-500" : "bg-zinc-900 border-transparent hover:bg-zinc-700/50"
                )}
              >
                <Hash className="w-6 h-6 text-zinc-400" />
                <div>
                  <div className="font-medium text-zinc-100">{t('modals.createChannel.text')}</div>
                  <div className="text-xs text-zinc-400">{t('modals.createChannel.textDesc')}</div>
                </div>
                <div className="ml-auto">
                  <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", type === 'TEXT' ? "border-indigo-500" : "border-zinc-500")}>
                    {type === 'TEXT' && <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />}
                  </div>
                </div>
              </div>

              <div 
                onClick={() => setType('VOICE')}
                className={clsx(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                  type === 'VOICE' ? "bg-zinc-700 border-indigo-500" : "bg-zinc-900 border-transparent hover:bg-zinc-700/50"
                )}
              >
                <Volume2 className="w-6 h-6 text-zinc-400" />
                <div>
                  <div className="font-medium text-zinc-100">{t('modals.createChannel.voice')}</div>
                  <div className="text-xs text-zinc-400">{t('modals.createChannel.voiceDesc')}</div>
                </div>
                <div className="ml-auto">
                  <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", type === 'VOICE' ? "border-indigo-500" : "border-zinc-500")}>
                    {type === 'VOICE' && <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />}
                  </div>
                </div>
              </div>

              <div 
                onClick={() => setType('AFK')}
                className={clsx(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                  type === 'AFK' ? "bg-zinc-700 border-indigo-500" : "bg-zinc-900 border-transparent hover:bg-zinc-700/50"
                )}
              >
                <Moon className="w-6 h-6 text-zinc-400" />
                <div>
                  <div className="font-medium text-zinc-100">{t('modals.createChannel.afk')}</div>
                  <div className="text-xs text-zinc-400">{t('modals.createChannel.afkDesc')}</div>
                </div>
                <div className="ml-auto">
                  <div className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center", type === 'AFK' ? "border-indigo-500" : "border-zinc-500")}>
                    {type === 'AFK' && <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="mb-6">
              <label className="block text-xs font-bold text-zinc-300 uppercase mb-2">
                {t('modals.createChannel.category')}
              </label>
              <select
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value || null)}
                className="w-full bg-zinc-900 border border-zinc-950 rounded p-2 text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">{t('modals.createChannel.noCategory')}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-bold text-zinc-300 uppercase mb-2">
              {t('modals.createChannel.channelName')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                {type === 'TEXT' ? <Hash className="w-4 h-4" /> : type === 'VOICE' ? <Volume2 className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-950 rounded p-2 pl-9 text-zinc-100 focus:outline-none focus:border-indigo-500"
                placeholder={t('modals.createChannel.placeholder')}
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-zinc-300 hover:underline">
              {t('modals.createChannel.cancel')}
            </button>
            <button type="submit" disabled={!name.trim()} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {t('modals.createChannel.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
