import { useState, useEffect, useRef } from 'react';
import { X, Camera, Plus, Shield } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAppStore } from '../../store/appStore';
import { processImageForSupabase } from '../../lib/imageUtils';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, iconUrl?: string) => Promise<boolean>;
  onJoin: (inviteCode: string) => Promise<void>;
  canCreateServers?: boolean;
}

export default function AddServerModal({ isOpen, onClose, onCreate, onJoin, canCreateServers = true }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [serverName, setServerName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useAppStore();

  useEffect(() => {
    if (isOpen) {
      setMode('menu');
      setServerName('');
      setIconUrl('');
      setInviteCode('');
      setLoading(false);
    }
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim() || loading) return;
    
    setLoading(true);
    const success = await onCreate(serverName.trim(), iconUrl);
    setLoading(false);
    
    if (success) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-800 rounded-xl w-full max-w-md p-6 shadow-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-zinc-100">
            {mode === 'menu' && t('modals.addServer.titleMenu')}
            {mode === 'create' && t('modals.addServer.titleCreate')}
            {mode === 'join' && t('modals.addServer.titleJoin')}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 disabled:opacity-50" disabled={loading}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'menu' && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm text-center mb-6">
              {t('modals.addServer.menuDescription')}
            </p>
            <button
              onClick={() => canCreateServers ? setMode('create') : null}
              className={clsx(
                "w-full font-bold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2",
                canCreateServers 
                  ? "bg-indigo-500 hover:bg-indigo-600 text-white" 
                  : "bg-zinc-700/50 text-zinc-500 cursor-not-allowed border border-zinc-700"
              )}
            >
              {!canCreateServers && <Shield className="w-4 h-4" />}
              {t('modals.addServer.createServerBtn')}
            </button>
            <div className="text-center text-zinc-400 text-sm py-2">{t('modals.addServer.or')}</div>
            <button
              onClick={() => setMode('join')}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-3 px-4 rounded-md transition-colors"
            >
              {t('modals.addServer.joinServerBtn')}
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate}>
            <p className="text-zinc-400 text-sm mb-6 text-center">
              {t('modals.addServer.createDescription')}
            </p>

            <div className="flex justify-center mb-6">
              <div className="relative group">
                <div className="w-20 h-20 rounded-2xl bg-zinc-700 flex items-center justify-center overflow-hidden border-2 border-dashed border-zinc-600 hover:border-indigo-500 transition-colors">
                  {iconUrl ? (
                    <img src={iconUrl} alt="Server icon" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLoading(true);
                      try {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${Math.random()}.${fileExt}`;
                        const filePath = `server-icons/temp/${fileName}`;
                        const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
                        
                        if (uploadError) {
                          console.warn("Storage upload failed, falling back to base64 compression", uploadError);
                          const base64 = await processImageForSupabase(file, 200);
                          setIconUrl(base64);
                        } else {
                          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
                          setIconUrl(publicUrl);
                        }
                      } catch (err: any) {
                        console.error(err);
                        if (err.message === "GIF_TOO_LARGE") {
                          addNotification(t('errors.gifTooLarge'), "error");
                        } else {
                          addNotification(t('errors.imageUploadFailed'), "error");
                        }
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                {!iconUrl && <div className="absolute -top-1 -right-1 bg-indigo-500 rounded-full p-1 shadow-lg"><Plus className="w-3 h-3 text-white" /></div>}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-zinc-300 uppercase mb-2">
                {t('modals.addServer.serverName')}
              </label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-950 rounded p-2 text-zinc-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                placeholder={t('modals.addServer.serverNamePlaceholder')}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="flex justify-between items-center mt-6">
              <button 
                type="button" 
                onClick={() => setMode('menu')} 
                className="text-zinc-400 hover:text-zinc-300 text-sm disabled:opacity-50"
                disabled={loading}
              >
                {t('modals.addServer.back')}
              </button>
              <button 
                type="submit" 
                disabled={!serverName.trim() || loading} 
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('modals.addServer.create')}
              </button>
            </div>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={async (e) => { e.preventDefault(); if (inviteCode.trim() && !loading) { setLoading(true); await onJoin(inviteCode.trim()); setLoading(false); onClose(); } }}>
            <p className="text-zinc-400 text-sm mb-4">
              {t('modals.addServer.joinDescription')}
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-zinc-300 uppercase mb-2">
                {t('modals.addServer.inviteLink')}
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-950 rounded p-2 text-zinc-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                placeholder={t('modals.addServer.invitePlaceholder')}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="flex justify-between items-center mt-6">
              <button 
                type="button" 
                onClick={() => setMode('menu')} 
                className="text-zinc-400 hover:text-zinc-300 text-sm disabled:opacity-50"
                disabled={loading}
              >
                {t('modals.addServer.back')}
              </button>
              <button 
                type="submit" 
                disabled={!inviteCode.trim() || loading} 
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('modals.addServer.join')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
