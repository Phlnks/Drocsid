import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Database, Plus, ChevronRight } from 'lucide-react';
import { useInstanceStore } from '../store/instanceStore';

export const InstanceSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const { addInstance, selectInstance, instances } = useInstanceStore();
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    socketUrl: window.location.origin,
    livekitUrl: '',
    livekitTokenEndpoint: ''
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Add new instance as a favorite and then select it
    // Note: addInstance adds to the list, but we need the ID to select it.
    // However, addInstance in our store reloads the page when selectInstance is called.
    // Let's modify addInstance slightly or just use a temporary approach.
    
    const id = Math.random().toString(36).substring(2, 9);
    const newInstance = {
      ...formData,
      id,
      isFavorite: true,
      lastUsed: Date.now()
    };
    
    const existingInstances = [...instances, newInstance];
    localStorage.setItem('drocsid-instances', JSON.stringify(existingInstances));
    localStorage.setItem('drocsid-current-instance-id', id);
    
    // Reload to apply new config
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1e1f22] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-8"
      >
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 rounded-2xl bg-[#5865F2] text-white mb-4">
            <Database className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-white">{t('setup.title')}</h1>
          <p className="text-[#b5bac1]">{t('setup.subtitle')}</p>
          <p className="text-[#949ba4] text-sm max-w-sm mx-auto">{t('setup.description')}</p>
        </div>

        {!showForm ? (
          <div className="space-y-4">
            <button
              onClick={() => setShowForm(true)}
              className="w-full p-6 bg-[#313338] hover:bg-[#35373c] border border-[#1e1f22] hover:border-[#5865F2] rounded-xl flex items-center justify-between group transition-all"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="p-3 bg-[#5865F2]/10 rounded-lg text-[#5865F2]">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-white font-bold">{t('setup.createFirst')}</div>
                  <div className="text-[#949ba4] text-xs">Configure Supabase URL & Key</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#4e5058] group-hover:text-white transition-colors" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-[#313338] p-6 rounded-xl border border-[#1e1f22] space-y-4 shadow-xl">
            <div className="space-y-2">
              <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.name')}</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('instances.placeholderName')}
                className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.supabaseUrl')}</label>
              <input
                type="url"
                required
                value={formData.supabaseUrl}
                onChange={e => setFormData({ ...formData, supabaseUrl: e.target.value })}
                placeholder="https://xxx.supabase.co"
                className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.supabaseKey')}</label>
              <input
                type="text"
                required
                value={formData.supabaseAnonKey}
                onChange={e => setFormData({ ...formData, supabaseAnonKey: e.target.value })}
                className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.socketUrl')}</label>
              <input
                type="url"
                required
                value={formData.socketUrl}
                onChange={e => setFormData({ ...formData, socketUrl: e.target.value })}
                className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[#b5bac1] text-xs font-bold uppercase flex justify-between">
                  <span>{t('instances.livekitUrl', 'LiveKit URL')}</span>
                  <span className="text-[#949ba4] font-normal normal-case">{t('instances.optional', '(Optionnel)')}</span>
                </label>
                <input
                  type="text"
                  value={formData.livekitUrl}
                  onChange={e => setFormData({ ...formData, livekitUrl: e.target.value })}
                  placeholder={t('instances.livekitUrlPlaceholder', 'wss://votre-livekit.com')}
                  className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all placeholder:text-[#5c5e66]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[#b5bac1] text-xs font-bold uppercase flex justify-between">
                  <span>{t('instances.livekitTokenEndpoint', 'LiveKit Token API')}</span>
                  <span className="text-[#949ba4] font-normal normal-case">{t('instances.optional', '(Optionnel)')}</span>
                </label>
                <input
                  type="text"
                  value={formData.livekitTokenEndpoint}
                  onChange={e => setFormData({ ...formData, livekitTokenEndpoint: e.target.value })}
                  placeholder={t('instances.livekitTokenPlaceholder', 'https://votre-serveur.com/api/livekit/token')}
                  className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all placeholder:text-[#5c5e66]"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 text-white hover:underline p-3"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="flex-[2] bg-[#5865F2] hover:bg-[#4752c4] text-white p-3 rounded-lg font-bold transition-colors"
              >
                {t('instances.save')}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};
