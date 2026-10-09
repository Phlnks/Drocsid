import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Star, Trash2, Edit2, Check, AlertTriangle, Database, Globe, Key, Copy, ClipboardPaste, Upload, FileCode } from 'lucide-react';
import { useInstanceStore, Instance, exportInstanceToJSON, parseInstanceConfig } from '../store/instanceStore';
import { copyToClipboard, readFromClipboard } from '../lib/utils';

interface InstanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstanceSettingsModal: React.FC<InstanceSettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { instances, currentInstanceId, addInstance, removeInstance, updateInstance, selectInstance, toggleFavorite } = useInstanceStore();
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  
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
    setIsImporting(false);
    setEditingId(null);
    setPasteFeedback(null);
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
    setIsImporting(false);
    setPasteFeedback(null);
  };

  const handlePasteIntoForm = async () => {
    try {
      const text = await readFromClipboard();
      const parsed = parseInstanceConfig(text);
      if (parsed) {
        setFormData({
          name: parsed.name,
          supabaseUrl: parsed.supabaseUrl,
          supabaseAnonKey: parsed.supabaseAnonKey,
          socketUrl: parsed.socketUrl,
          livekitUrl: parsed.livekitUrl || '',
          livekitTokenEndpoint: parsed.livekitTokenEndpoint || ''
        });
        setPasteFeedback(t('instances.importSuccess', 'Configuration importée avec succès !'));
        setTimeout(() => setPasteFeedback(null), 3000);
      } else {
        setPasteFeedback(t('instances.invalidFormat', 'Format invalide. L\'URL Supabase et la clé Anon sont requises.'));
        setTimeout(() => setPasteFeedback(null), 3000);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      setPasteFeedback(t('instances.invalidFormat', 'Impossible de lire le presse-papier'));
      setTimeout(() => setPasteFeedback(null), 3000);
    }
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

  const parsedImport = importText.trim() ? parseInstanceConfig(importText) : null;

  const handleExecuteImport = () => {
    if (!parsedImport) return;
    addInstance({
      name: parsedImport.name,
      supabaseUrl: parsedImport.supabaseUrl,
      supabaseAnonKey: parsedImport.supabaseAnonKey,
      socketUrl: parsedImport.socketUrl,
      livekitUrl: parsedImport.livekitUrl || '',
      livekitTokenEndpoint: parsedImport.livekitTokenEndpoint || '',
      isFavorite: false
    });
    setIsImporting(false);
    setImportText('');
  };

  const handleEditBeforeImport = () => {
    if (!parsedImport) return;
    setFormData({
      name: parsedImport.name,
      supabaseUrl: parsedImport.supabaseUrl,
      supabaseAnonKey: parsedImport.supabaseAnonKey,
      socketUrl: parsedImport.socketUrl,
      livekitUrl: parsedImport.livekitUrl || '',
      livekitTokenEndpoint: parsedImport.livekitTokenEndpoint || ''
    });
    setEditingId(null);
    setIsImporting(false);
    setIsAdding(true);
  };

  const handlePasteIntoImportArea = async () => {
    try {
      const text = await readFromClipboard();
      setImportText(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
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
        className="bg-[#313338] w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-4 flex items-center justify-between border-b border-[#1e1f22]">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-[#5865F2]" />
            {t('instances.title')}
          </h2>
          <button onClick={onClose} className="text-[#b5bac1] hover:text-white transition-colors cursor-pointer">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="bg-[#f23f42]/10 border border-[#f23f42]/20 p-4 rounded-md flex gap-3 text-sm text-[#f23f42]">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>{t('instances.warning')}</p>
          </div>

          {!isAdding && !isImporting ? (
            <>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <p className="text-[#b5bac1] text-sm">{t('instances.description')}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setIsImporting(true);
                      setImportText('');
                    }}
                    className="bg-[#2b2d31] hover:bg-[#35373c] text-[#dbdee1] hover:text-white border border-[#3f4147] px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
                    title={t('instances.importTitle', 'Importer une instance')}
                  >
                    <Upload className="w-4 h-4 text-[#5865F2]" />
                    {t('instances.import', 'Importer')}
                  </button>
                  <button
                    onClick={handleOpenAdd}
                    className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {t('instances.addInstance')}
                  </button>
                </div>
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
          ) : isImporting ? (
            <div className="space-y-4 bg-[#2b2d31] p-5 rounded-lg border border-[#1e1f22]">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <FileCode className="w-5 h-5 text-[#5865F2]" />
                  <span>{t('instances.importTitle', 'Importer une instance')}</span>
                </div>
                <button
                  type="button"
                  onClick={handlePasteIntoImportArea}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#5865F2] hover:text-white bg-[#5865F2]/10 hover:bg-[#5865F2] px-3 py-1.5 rounded transition-all cursor-pointer border border-[#5865F2]/30"
                >
                  <ClipboardPaste className="w-4 h-4" />
                  <span>{t('instances.pasteFromClipboard', 'Coller du presse-papier')}</span>
                </button>
              </div>

              <p className="text-xs text-[#b5bac1]">
                {t('instances.importDescription', 'Collez ici les données JSON ou le texte structuré de l\'instance :')}
              </p>

              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={`{\n  "name": "Mon Serveur",\n  "supabaseUrl": "https://xyz.supabase.co",\n  "supabaseAnonKey": "eyJhbGci...",\n  "socketUrl": "https://xyz.backend.com"\n}`}
                rows={7}
                className="w-full bg-[#1e1f22] text-[#f2f3f5] p-3 rounded-lg border border-transparent focus:border-[#5865F2] outline-none font-mono text-xs placeholder:text-[#5c5e66] resize-none"
              />

              {importText.trim() && (
                <div>
                  {parsedImport ? (
                    <div className="bg-[#23a559]/10 border border-[#23a559]/30 rounded-lg p-3 text-xs space-y-1">
                      <div className="flex items-center gap-2 text-[#23a559] font-semibold">
                        <Check className="w-4 h-4" />
                        <span>{t('instances.importSuccess', 'Configuration valide détectée')}</span>
                      </div>
                      <div className="text-white font-medium">{parsedImport.name}</div>
                      <div className="text-[#949ba4] truncate font-mono">Supabase: {parsedImport.supabaseUrl}</div>
                      <div className="text-[#949ba4] truncate font-mono">Backend: {parsedImport.socketUrl}</div>
                    </div>
                  ) : (
                    <div className="bg-[#f23f42]/10 border border-[#f23f42]/30 rounded-lg p-3 text-xs flex items-center gap-2 text-[#f23f42]">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{t('instances.invalidFormat', 'Format invalide. L\'URL Supabase et la clé Anon sont requises.')}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImporting(false);
                    setImportText('');
                  }}
                  className="text-white hover:underline px-4 py-2 text-sm cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                {parsedImport && (
                  <button
                    type="button"
                    onClick={handleEditBeforeImport}
                    className="bg-[#2b2d31] hover:bg-[#35373c] text-white border border-[#4e5058] px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
                  >
                    {t('common.edit', 'Modifier')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!parsedImport}
                  onClick={handleExecuteImport}
                  className="bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {t('instances.importButton', 'Importer la configuration')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex justify-between items-center pb-1">
                <span className="text-xs text-[#949ba4]">
                  {editingId ? t('instances.editInstance') : t('instances.addInstance')}
                </span>
                <button
                  type="button"
                  onClick={handlePasteIntoForm}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#5865F2] hover:text-white bg-[#5865F2]/10 hover:bg-[#5865F2] px-3 py-1.5 rounded transition-all cursor-pointer border border-[#5865F2]/30"
                  title={t('instances.pasteFromClipboard', 'Coller du presse-papier')}
                >
                  <ClipboardPaste className="w-4 h-4" />
                  <span>{t('instances.pasteFromClipboard', 'Coller du presse-papier')}</span>
                </button>
              </div>

              {pasteFeedback && (
                <div className={`p-2.5 rounded text-xs flex items-center gap-2 ${
                  pasteFeedback.includes('succès') || pasteFeedback.includes('success') || pasteFeedback.includes('éxito')
                    ? 'bg-[#23a559]/20 text-[#23a559] border border-[#23a559]/40'
                    : 'bg-[#f23f42]/20 text-[#f23f42] border border-[#f23f42]/40'
                }`}>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{pasteFeedback}</span>
                </div>
              )}

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
                  className="text-white hover:underline px-4 py-2 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="bg-[#5865F2] hover:bg-[#4752c4] text-white px-6 py-2 rounded-md font-medium transition-colors cursor-pointer"
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
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const jsonStr = exportInstanceToJSON(instance);
      const success = await copyToClipboard(jsonStr);
      if (success !== false) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy instance config:', err);
    }
  };

  return (
    <div 
      onDoubleClick={!isCurrent ? onSwitch : undefined}
      className={`p-4 rounded-md border flex items-center justify-between transition-all group cursor-pointer ${
      isCurrent ? 'bg-[#35373c] border-[#5865F2]' : 'bg-[#2b2d31] border-[#1e1f22] hover:bg-[#35373c]'
    }`}>
      <div className="flex items-center gap-3">
        <button 
          onClick={onFavorite}
          className={`${instance.isFavorite ? 'text-[#f1c40f]' : 'text-[#4e5058] hover:text-[#b5bac1]'} transition-colors cursor-pointer`}
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

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={handleCopy}
          className={`p-2 transition-colors cursor-pointer ${copied ? 'text-[#23a559]' : 'text-[#949ba4] hover:text-white'}`}
          title={copied ? t('instances.copied', 'Configuration copiée !') : t('instances.copyConfig', 'Copier la configuration')}
        >
          {copied ? <Check className="w-5 h-5 text-[#23a559]" /> : <Copy className="w-5 h-5" />}
        </button>

        {!isCurrent && (
          <button
            onClick={onSwitch}
            className="p-2 text-[#949ba4] hover:text-[#23a559] transition-colors cursor-pointer"
            title={t('instances.switch')}
          >
            <Check className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onEdit}
          className="p-2 text-[#949ba4] hover:text-white transition-colors cursor-pointer"
          title={t('common.edit')}
        >
          <Edit2 className="w-5 h-5" />
        </button>
        {instance.id !== 'default' && (
          <button
            onClick={onDelete}
            className="p-2 text-[#949ba4] hover:text-[#f23f42] transition-colors cursor-pointer"
            title={t('common.delete')}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
