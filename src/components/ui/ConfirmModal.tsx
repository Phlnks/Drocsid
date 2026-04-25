import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  description, 
  confirmText, 
  cancelText,
  danger = false
}: Props) {
  const { t } = useTranslation();
  const cText = confirmText || t('modals.confirm.confirm', 'Confirmer');
  const xText = cancelText || t('modals.confirm.cancel', 'Annuler');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-800 rounded-xl w-full max-w-md p-6 shadow-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-zinc-300 text-sm mb-6">{description}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-zinc-300 hover:underline">
            {xText}
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onClose();
            }} 
            className={`px-4 py-2 rounded font-medium text-white ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}
          >
            {cText}
          </button>
        </div>
      </div>
    </div>
  );
}
