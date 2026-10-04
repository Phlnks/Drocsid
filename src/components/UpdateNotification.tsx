import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UpdaterStatusData } from '../vite-env';

export default function UpdateNotification() {
  const { t } = useTranslation();
  const [updaterState, setUpdaterState] = useState<UpdaterStatusData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electron?.onUpdaterStatus) return;

    const cleanup = window.electron.onUpdaterStatus((data) => {
      console.log('[Updater UI] Status update:', data);
      setUpdaterState(data);
      if (data.status === 'available' || data.status === 'downloading' || data.status === 'downloaded') {
        setDismissed(false);
      }
    });

    return () => {
      cleanup();
    };
  }, []);

  if (dismissed || !updaterState) return null;

  // Don't show anything for not-available or checking in the global banner (those are displayed in settings)
  if (updaterState.status === 'not-available' || updaterState.status === 'checking') {
    return null;
  }

  const handleRestart = () => {
    if (window.electron?.restartAndInstall) {
      window.electron.restartAndInstall();
    }
  };

  const getTitle = () => {
    if (updaterState.status === 'downloaded') {
      return t('settings.updater.readyTitle', 'Mise à jour prête !');
    }
    if (updaterState.status === 'downloading') {
      return t('settings.updater.downloadingTitle', 'Téléchargement de la mise à jour');
    }
    if (updaterState.status === 'available') {
      return t('settings.updater.availableTitle', 'Nouvelle version disponible');
    }
    return t('settings.updater.title', 'Mise à jour');
  };

  const getDescription = () => {
    if (updaterState.status === 'downloaded') {
      return t('settings.updater.readyDesc', 'La version v{{version}} est prête à être installée.', {
        version: updaterState.version || '',
      });
    }
    if (updaterState.status === 'downloading') {
      return t('settings.updater.downloadingDesc', 'Téléchargement en arrière-plan ({{percent}}%)...', {
        percent: updaterState.percent || 0,
      });
    }
    if (updaterState.status === 'available') {
      return t('settings.updater.availableDesc', 'Version v{{version}} trouvée.', {
        version: updaterState.version || '',
      });
    }
    return updaterState.error || t('settings.updater.errorDesc', 'Une erreur est survenue lors de la mise à jour.');
  };

  return (
    <div className="fixed bottom-16 md:bottom-6 right-6 z-50 max-w-sm w-full bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl p-4 text-zinc-100 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {updaterState.status === 'downloading' && (
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Download className="w-5 h-5 animate-bounce" />
            </div>
          )}
          {updaterState.status === 'available' && (
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
          )}
          {updaterState.status === 'downloaded' && (
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          )}
          {updaterState.status === 'error' && (
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertCircle className="w-5 h-5" />
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-white">
              {getTitle()}
            </h4>
            <p className="text-xs text-zinc-400">
              {getDescription()}
            </p>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md hover:bg-zinc-800 transition-colors"
          title={t('settings.updater.close', 'Fermer')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {updaterState.status === 'downloading' && (
        <div className="mt-3 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, updaterState.percent || 0))}%` }}
          />
        </div>
      )}

      {updaterState.status === 'downloaded' && (
        <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
          >
            {t('settings.updater.later', 'Plus tard')}
          </button>
          <button
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md shadow-md transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('settings.updater.restartNow', 'Redémarrer maintenant')}
          </button>
        </div>
      )}
    </div>
  );
}
