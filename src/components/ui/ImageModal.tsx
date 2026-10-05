import React, { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ImageInfo {
  url: string;
  name?: string;
  messageId: string;
}

interface ImageModalProps {
  images: ImageInfo[];
  initialIndex: number;
  onClose: () => void;
}

async function convertBlobToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else resolve(blob);
      }, 'image/png');
    };
    img.onerror = () => resolve(blob);
    img.src = URL.createObjectURL(blob);
  });
}

export default function ImageModal({ images, initialIndex, onClose }: ImageModalProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [copied, setCopied] = useState(false);

  const currentImage = images[currentIndex];

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : prev));
  }, [images.length]);

  const handleCopyImage = useCallback(async (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!currentImage) return;

    // 1. Electron environment: native clipboard image copy
    const electron = (window as any).electron;
    if (electron && typeof electron.copyImage === 'function') {
      try {
        const result = await electron.copyImage({ url: currentImage.url });
        if (result && result.ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          return;
        }
      } catch (err) {
        console.error('Electron copyImage IPC error:', err);
      }
    }

    // 2. Browser standard clipboard API
    try {
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const response = await fetch(currentImage.url);
        const blob = await response.blob();
        let pngBlob = blob;
        if (blob.type !== 'image/png') {
          pngBlob = await convertBlobToPng(blob);
        }
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch (err) {
      console.warn('Direct clipboard.write failed, trying text fallback:', err);
    }

    // 3. Fallback: Copy direct URL
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(currentImage.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Copy fallback failed:', err);
    }
  }, [currentImage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        handleCopyImage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext, handleCopyImage]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!currentImage) return;
    const fileName = currentImage.name || currentImage.url.split('/').pop()?.split('?')[0] || 'image.png';
    
    // Check if running in Electron environment
    const electron = (window as any).electron;
    if (electron && typeof electron.downloadFile === 'function') {
      try {
        const result = await electron.downloadFile({ url: currentImage.url, fileName });
        if (result && !result.ok && !result.canceled) {
          console.error('Electron download failed:', result.error);
        }
      } catch (err) {
        console.error('Electron download IPC error:', err);
      }
      return;
    }

    try {
      const downloadUrl = `/api/download?url=${encodeURIComponent(currentImage.url)}&name=${encodeURIComponent(fileName)}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Proxy download failed, trying direct link trigger as fallback:', err);
      try {
        const link = document.createElement('a');
        link.href = `/api/download?url=${encodeURIComponent(currentImage.url)}&name=${encodeURIComponent(fileName)}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (fallbackErr) {
        console.error('All download attempts failed:', fallbackErr);
      }
    }
  };

  if (!currentImage) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent z-10">
        <div className="text-zinc-200 text-sm font-medium truncate max-w-[60%]">
          {currentImage.name || 'Image'}
          <span className="ml-3 text-zinc-400 font-normal">({currentIndex + 1} / {images.length})</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handleCopyImage}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              copied 
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' 
                : 'text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/10'
            }`}
            title={copied ? t('imageModal.copied', 'Image copiée !') : t('imageModal.copyImage', 'Copier l\'image (Ctrl+C)')}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{t('imageModal.copied', 'Image copiée !')}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>{t('imageModal.copyImage', 'Copier l\'image')}</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="p-2 text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/80 border border-white/10 rounded-lg transition-colors cursor-pointer"
            title={t('imageModal.download', 'Télécharger')}
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button 
            className="p-2 text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/80 border border-white/10 rounded-lg transition-colors cursor-pointer ml-1"
            onClick={onClose}
            title={t('imageModal.close', 'Fermer')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative w-full h-full flex items-center justify-center">
        {currentIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-4 p-3 text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-20 backdrop-blur-sm cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <img 
          src={currentImage.url} 
          alt="Preview" 
          className="max-w-full max-h-full object-contain shadow-2xl select-none cursor-pointer"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.stopPropagation();
            handleCopyImage(e);
          }}
          title={t('imageModal.copyImage', 'Clic droit ou bouton pour copier l\'image')}
        />

        {currentIndex < images.length - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-4 p-3 text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-20 backdrop-blur-sm cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[90%] p-2 no-scrollbar">
        {images.length > 1 && images.map((img, idx) => (
          <div
            key={img.messageId + idx}
            onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
            className={`w-12 h-12 rounded cursor-pointer border-2 transition-all shrink-0 ${idx === currentIndex ? 'border-indigo-500 scale-110 shadow-lg shadow-indigo-500/20' : 'border-transparent opacity-50 hover:opacity-100 hover:border-zinc-500'}`}
          >
            <img src={img.url} className="w-full h-full object-cover rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

