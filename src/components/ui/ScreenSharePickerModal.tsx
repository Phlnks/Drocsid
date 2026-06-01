import { useState, useEffect } from 'react';
import { X, Monitor, Layout as WindowIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { type DesktopSourceInfo } from '../../vite-env';
import { useTranslation } from 'react-i18next';

interface ScreenSharePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (source: DesktopSourceInfo) => void;
}

export default function ScreenSharePickerModal({ isOpen, onClose, onSelect }: ScreenSharePickerModalProps) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<DesktopSourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSources();
      setSelectedSourceId(null);
    }
  }, [isOpen]);

  const fetchSources = async () => {
    setLoading(true);
    try {      
      const results = await window.electron.getDesktopSources();
      setSources(results);
    } catch (error) {
      console.error('Error fetching desktop sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (selectedSourceId) {
      const source = sources.find(s => s.id === selectedSourceId);
      if (source) onSelect(source);
    }
  };

  const filteredSources = sources.filter(source => {
    if (activeTab === 'screens') return source.type === 'screen';
    return source.type === 'window';
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-zinc-800 w-full max-w-3xl rounded-xl shadow-2xl border border-zinc-700 flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-700">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {t('voice.shareScreenTitle')}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex p-2 gap-2 bg-zinc-900/50 border-b border-zinc-700">
            <button
              onClick={() => {
                setActiveTab('screens');
                setSelectedSourceId(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-medium transition-all ${
                activeTab === 'screens'
                  ? 'bg-zinc-700 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              <Monitor className="w-4 h-4" />
              {t('voice.screensTab')}
            </button>
            <button
              onClick={() => {
                setActiveTab('windows');
                setSelectedSourceId(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-medium transition-all ${
                activeTab === 'windows'
                  ? 'bg-zinc-700 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              <WindowIcon className="w-4 h-4" />
              {t('voice.windowsTab')}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p>{t('voice.detectingSources')}</p>
              </div>
            ) : filteredSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <p>{t('voice.noSourcesFound')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {filteredSources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    onDoubleClick={() => onSelect(source)}
                    className={`group flex flex-col gap-2 p-2 rounded-lg transition-all border-2 ${
                      selectedSourceId === source.id 
                        ? 'bg-indigo-500/10 border-indigo-500' 
                        : 'hover:bg-zinc-700/50 border-transparent hover:border-zinc-600'
                    }`}
                  >
                    <div className="relative aspect-video rounded-md overflow-hidden bg-zinc-900 border border-zinc-700 group-hover:border-indigo-500/30">
                      <img
                        src={source.thumbnail}
                        alt={source.name}
                        className="w-full h-full object-contain"
                      />
                      <div className={`absolute inset-0 transition-colors ${
                        selectedSourceId === source.id ? 'bg-indigo-500/5' : 'bg-indigo-500/0 group-hover:bg-indigo-500/10'
                      }`} />
                    </div>
                    <span className={`text-sm font-medium truncate w-full text-left px-1 ${
                      selectedSourceId === source.id ? 'text-indigo-300' : 'text-zinc-300'
                    }`}>
                      {source.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-zinc-900/30 border-t border-zinc-700 flex justify-between items-center">
            <button
              onClick={fetchSources}
              className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm font-medium transition-colors"
            >
              {t('voice.refresh')}
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-zinc-300 hover:text-white font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleShare}
                disabled={!selectedSourceId}
                className={`px-8 py-2 rounded-md font-bold transition-all ${
                  selectedSourceId
                    ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {t('voice.share')}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
