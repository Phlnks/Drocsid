import { useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function BrowserDownloadBanner() {
  const { t } = useTranslation();
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('drocsid-dismiss-download-banner') === 'true';
    } catch {
      return false;
    }
  });

  const isElectron =
    typeof window !== 'undefined' &&
    (Boolean((window as any).electron) ||
      navigator.userAgent.toLowerCase().includes('electron'));

  const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL;

  // Don't show the banner if running inside Electron app, if dismissed, or if no download URL is configured in .env
  if (isElectron || isDismissed || !downloadUrl) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('drocsid-dismiss-download-banner', 'true');
    } catch {}
  };

  return (
    <div className="bg-indigo-600 text-white px-3 py-1.5 flex items-center justify-between text-xs border-b border-indigo-500/40 shadow-sm relative z-40 shrink-0 select-none animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 overflow-hidden mx-auto">
        <span className="flex h-2 w-2 relative shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
        </span>
        <span className="truncate font-medium text-white/95">
          {t('downloadBanner.text', "Pour une meilleure expérience et des fonctionnalités complètes, installez l'application !")}
        </span>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white text-indigo-700 hover:bg-white/90 font-semibold text-[11px] shadow-sm transition-all shrink-0 ml-1 group"
        >
          <Download className="w-3 h-3 group-hover:-translate-y-0.5 transition-transform" />
          <span>{t('downloadBanner.button', "Télécharger l'application")}</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </a>
      </div>
      <button
        onClick={handleDismiss}
        title={t('downloadBanner.dismiss', "Fermer")}
        aria-label={t('downloadBanner.dismiss', "Fermer")}
        className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors ml-2 shrink-0 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
