import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Star, Trash2, Edit2, Check, AlertTriangle, Database, Globe, Key } from 'lucide-react';
import { useInstanceStore, Instance } from '../store/instanceStore';

interface InstanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstanceSettingsModal: React.FC<InstanceSettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { instances, currentInstanceId, addInstance, removeInstance, updateInstance, selectInstance, toggleFavorite } = useInstanceStore();
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmSwitchId, setConfirmSwitchId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    socketUrl: '',
    livekitUrl: '',
    livekitTokenEndpoint: ''
  });

  const handleOpenAdd = () => {
    setFormData({ name: '', supabaseUrl: '', supabaseAnonKey: '', socketUrl: '', livekitUrl: '', livekitTokenEndpoint: '' });
    setIsAdding(true);
    setEditingId(null);
  };

  const handleOpenEdit = (instance: Instance) => {
    setFormData({
      name: instance.name,
      supabaseUrl: instance.supabaseUrl,
      supabaseAnonKey: instance.supabaseAnonKey,
      socketUrl: instance.socketUrl,
      livekitUrl: instance.livekitUrl || '',
      livekitTokenEndpoint: instance.livekitTokenEndpoint || ''
    });
    setEditingId(instance.id);
    setIsAdding(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateInstance(editingId, formData);
    } else {
      addInstance({ ...formData, isFavorite: false });
    }
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSwitch = (id: string) => {
    const instance = instances.find(i => i.id === id);
    if (!instance) return;
    
    if (window.confirm(t('instances.switchConfirm', { name: instance.name }))) {
      selectInstance(id);
    }
  };

  const favorites = instances.filter(i => i.isFavorite);
  const others = instances.filter(i => !i.isFavorite);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#313338] w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-4 flex items-center justify-between border-b border-[#1e1f22]">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-[#5865F2]" />
            {t('instances.title')}
          </h2>
          <button onClick={onClose} className="text-[#b5bac1] hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="bg-[#f23f42]/10 border border-[#f23f42]/20 p-4 rounded-md flex gap-3 text-sm text-[#f23f42]">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{t('instances.warning')}</p>
          </div>

          {!isAdding ? (
            <>
              <div className="flex justify-between items-center">
                <p className="text-[#b5bac1] text-sm">{t('instances.description')}</p>
                <button
                  onClick={handleOpenAdd}
                  className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('instances.addInstance')}
                </button>
              </div>

              <div className="space-y-4">
                {favorites.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-[#949ba4] text-xs font-bold uppercase px-2">{t('instances.favorites')}</h3>
                    {favorites.map(instance => (
                      <InstanceCard 
                        key={instance.id} 
                        instance={instance} 
                        isCurrent={currentInstanceId === instance.id}
                        onSwitch={() => handleSwitch(instance.id)}
                        onEdit={() => handleOpenEdit(instance)}
                        onDelete={() => removeInstance(instance.id)}
                        onFavorite={() => toggleFavorite(instance.id)}
                        t={t}
                      />
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-[#949ba4] text-xs font-bold uppercase px-2">{t('instances.others')}</h3>
                  {others.map(instance => (
                    <InstanceCard 
                      key={instance.id} 
                      instance={instance} 
                      isCurrent={currentInstanceId === instance.id}
                      onSwitch={() => handleSwitch(instance.id)}
                      onEdit={() => handleOpenEdit(instance)}
                      onDelete={() => removeInstance(instance.id)}
                      onFavorite={() => toggleFavorite(instance.id)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.name')}</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('instances.placeholderName')}
                  className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.supabaseUrl')}</label>
                  <input
                    type="url"
                    required
                    value={formData.supabaseUrl}
                    onChange={e => setFormData({ ...formData, supabaseUrl: e.target.value })}
                    className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.socketUrl')}</label>
                  <input
                    type="url"
                    required
                    value={formData.socketUrl}
                    onChange={e => setFormData({ ...formData, socketUrl: e.target.value })}
                    className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[#b5bac1] text-xs font-bold uppercase">{t('instances.supabaseKey')}</label>
                <input
                  type="text"
                  required
                  value={formData.supabaseAnonKey}
                  onChange={e => setFormData({ ...formData, supabaseAnonKey: e.target.value })}
                  className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
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
                    className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all placeholder:text-[#5c5e66]"
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
                    className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all placeholder:text-[#5c5e66]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-white hover:underline px-4 py-2"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-6 py-2 rounded-md font-medium transition-colors"
                >
                  {t('instances.save')}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};

interface InstanceCardProps {
  instance: Instance;
  isCurrent: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  t: any;
}

const getSafeHostname = (urlStr: string) => {
  try {
    if (!urlStr) return '';
    if (!/^https?:\/\//i.test(urlStr) && !/^wss?:\/\//i.test(urlStr)) {
      return urlStr.split('/')[0].split(':')[0];
    }
    return new URL(urlStr).hostname;
  } catch (e) {
    return urlStr || '';
  }
};

const InstanceCard: React.FC<InstanceCardProps> = ({ instance, isCurrent, onSwitch, onEdit, onDelete, onFavorite, t }) => {
  return (
    <div 
      onDoubleClick={!isCurrent ? onSwitch : undefined}
      className={`p-4 rounded-md border flex items-center justify-between transition-all group cursor-pointer ${
      isCurrent ? 'bg-[#35373c] border-[#5865F2]' : 'bg-[#2b2d31] border-[#1e1f22] hover:bg-[#35373c]'
    }`}>
      <div className="flex items-center gap-3">
        <button 
          onClick={onFavorite}
          className={`${instance.isFavorite ? 'text-[#f1c40f]' : 'text-[#4e5058] hover:text-[#b5bac1]'} transition-colors`}
        >
          <Star className={`w-5 h-5 ${instance.isFavorite ? 'fill-current' : ''}`} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-white font-medium">{instance.name}</h4>
            {isCurrent && <span className="bg-[#23a559] text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">{t('instances.current')}</span>}
            {instance.id === 'default' && <span className="bg-[#4e5058] text-[#b5bac1] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">{t('instances.default')}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1 text-[10px] text-[#949ba4]">
              <Globe className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{getSafeHostname(instance.socketUrl)}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[#949ba4]">
              <Database className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{getSafeHostname(instance.supabaseUrl)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isCurrent && (
          <button
            onClick={onSwitch}
            className="p-2 text-[#949ba4] hover:text-[#23a559] transition-colors"
            title={t('instances.switch')}
          >
            <Check className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onEdit}
          className="p-2 text-[#949ba4] hover:text-white transition-colors"
          title={t('common.edit')}
        >
          <Edit2 className="w-5 h-5" />
        </button>
        {instance.id !== 'default' && (
          <button
            onClick={onDelete}
            className="p-2 text-[#949ba4] hover:text-[#f23f42] transition-colors"
            title={t('common.delete')}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
