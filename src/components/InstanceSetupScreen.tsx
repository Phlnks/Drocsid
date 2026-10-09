import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Database, Plus, ChevronRight, Upload, ClipboardPaste, Check, AlertTriangle, FileCode } from 'lucide-react';
import { useInstanceStore, parseInstanceConfig } from '../store/instanceStore';

export const InstanceSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const { instances } = useInstanceStore();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    socketUrl: window.location.origin,
    livekitUrl: '',
    livekitTokenEndpoint: ''
  });

  const parsedImport = importText.trim() ? parseInstanceConfig(importText) : null;

  const handlePasteIntoForm = async () => {
    try {
      const text = await navigator.clipboard.readText();
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
    }
  };

  const handlePasteIntoImportArea = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setImportText(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleExecuteImport = () => {
    if (!parsedImport) return;
    const id = Math.random().toString(36).substring(2, 9);
    const newInstance = {
      name: parsedImport.name,
      supabaseUrl: parsedImport.supabaseUrl,
      supabaseAnonKey: parsedImport.supabaseAnonKey,
      socketUrl: parsedImport.socketUrl,
      livekitUrl: parsedImport.livekitUrl || '',
      livekitTokenEndpoint: parsedImport.livekitTokenEndpoint || '',
      id,
      isFavorite: true,
      lastUsed: Date.now()
    };
    
    const existingInstances = [...instances, newInstance];
    localStorage.setItem('drocsid-instances', JSON.stringify(existingInstances));
    localStorage.setItem('drocsid-current-instance-id', id);
    window.location.reload();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
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
        className="w-full max-w-lg space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 rounded-2xl bg-[#5865F2] text-white mb-2 shadow-lg shadow-[#5865F2]/20">
            <Database className="w-10 h-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('setup.title')}</h1>
          <p className="text-[#b5bac1] text-sm">{t('setup.subtitle')}</p>
        </div>

        {!showForm && !showImport ? (
          <div className="space-y-3">
            <button
              onClick={() => setShowForm(true)}
              className="w-full p-5 bg-[#313338] hover:bg-[#35373c] border border-[#1e1f22] hover:border-[#5865F2] rounded-xl flex items-center justify-between group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="p-3 bg-[#5865F2]/10 rounded-lg text-[#5865F2]">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-white font-bold">{t('setup.createFirst')}</div>
                  <div className="text-[#949ba4] text-xs">Configurer manuellement Supabase URL & Clé</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#4e5058] group-hover:text-white transition-colors" />
            </button>

            <button
              onClick={() => {
                setShowImport(true);
                setImportText('');
              }}
              className="w-full p-5 bg-[#313338] hover:bg-[#35373c] border border-[#1e1f22] hover:border-[#5865F2] rounded-xl flex items-center justify-between group transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="p-3 bg-[#23a559]/10 rounded-lg text-[#23a559]">
                  <ClipboardPaste className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-white font-bold">{t('instances.importTitle', 'Importer une configuration')}</div>
                  <div className="text-[#949ba4] text-xs">Coller directement le JSON ou le texte structuré</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#4e5058] group-hover:text-white transition-colors" />
            </button>
          </div>
        ) : showImport ? (
          <div className="bg-[#313338] p-6 rounded-xl border border-[#1e1f22] space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-white font-bold">
                <FileCode className="w-5 h-5 text-[#5865F2]" />
                <span>{t('instances.importTitle', 'Importer une instance')}</span>
              </div>
              <button
                type="button"
                onClick={handlePasteIntoImportArea}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#5865F2] hover:text-white bg-[#5865F2]/10 hover:bg-[#5865F2] px-3 py-1.5 rounded transition-all cursor-pointer border border-[#5865F2]/30"
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
              rows={6}
              className="w-full bg-[#1e1f22] text-[#f2f3f5] p-3 rounded-lg border border-transparent focus:border-[#5865F2] outline-none font-mono text-xs placeholder:text-[#5c5e66] resize-none"
            />

            {importText.trim() && (
              <div>
                {parsedImport ? (
                  <div className="bg-[#23a559]/10 border border-[#23a559]/30 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2 text-[#23a559] font-semibold">
                      <Check className="w-4 h-4" />
                      <span>{t('instances.importSuccess', 'Configuration valide')}</span>
                    </div>
                    <div className="text-white font-medium">{parsedImport.name}</div>
                    <div className="text-[#949ba4] truncate font-mono">Supabase: {parsedImport.supabaseUrl}</div>
                  </div>
                ) : (
                  <div className="bg-[#f23f42]/10 border border-[#f23f42]/30 rounded-lg p-3 text-xs flex items-center gap-2 text-[#f23f42]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{t('instances.invalidFormat', 'Format invalide.')}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="flex-1 text-white hover:underline p-3 text-sm cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!parsedImport}
                onClick={handleExecuteImport}
                className="flex-[2] bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                <span>{t('instances.importButton', 'Importer et Démarrer')}</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-[#313338] p-6 rounded-xl border border-[#1e1f22] space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-1">
              <span className="text-xs text-[#949ba4]">{t('setup.createFirst')}</span>
              <button
                type="button"
                onClick={handlePasteIntoForm}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#5865F2] hover:text-white bg-[#5865F2]/10 hover:bg-[#5865F2] px-3 py-1.5 rounded transition-all cursor-pointer border border-[#5865F2]/30"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>{t('instances.pasteFromClipboard', 'Coller du presse-papier')}</span>
              </button>
            </div>

            {pasteFeedback && (
              <div className={`p-2.5 rounded text-xs flex items-center gap-2 ${
                pasteFeedback.includes('succès') || pasteFeedback.includes('success')
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
                className="flex-1 text-white hover:underline p-3 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="flex-[2] bg-[#5865F2] hover:bg-[#4752c4] text-white p-3 rounded-lg font-bold transition-colors cursor-pointer"
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
