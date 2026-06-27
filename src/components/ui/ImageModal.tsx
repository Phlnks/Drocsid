import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Maximize2 } from 'lucide-react';

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

export default function ImageModal({ images, initialIndex, onClose }: ImageModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, currentIndex]);

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : prev));
  };

  const currentImage = images[currentIndex];

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
        <div className="text-zinc-200 text-sm font-medium truncate max-w-[70%]">
          {currentImage.name || 'Image'}
          <span className="ml-3 text-zinc-400 font-normal">({currentIndex + 1} / {images.length})</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleDownload}
            className="p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Télécharger"
          >
            <Download className="w-5 h-5" />
          </button>
          <button 
            className="p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            onClick={onClose}
            title="Fermer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="relative w-full h-full flex items-center justify-center">
        {currentIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-4 p-3 text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-20 backdrop-blur-sm"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <img 
          src={currentImage.url} 
          alt="Preview" 
          className="max-w-full max-h-full object-contain shadow-2xl select-none"
          onClick={(e) => e.stopPropagation()}
        />

        {currentIndex < images.length - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-4 p-3 text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-20 backdrop-blur-sm"
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

