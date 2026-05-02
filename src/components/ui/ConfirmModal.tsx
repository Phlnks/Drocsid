import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger,
  variant = 'danger'
}: ConfirmModalProps) {
  const { t } = useTranslation();

  // Support both 'danger' boolean and 'variant' string
  const resolvedVariant = danger ? 'danger' : variant;

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={clsx(
                "p-3 rounded-full mt-1",
                resolvedVariant === 'danger' && "bg-red-500/10 text-red-500",
                resolvedVariant === 'warning' && "bg-amber-500/10 text-amber-500",
                resolvedVariant === 'info' && "bg-indigo-500/10 text-indigo-500"
              )}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-zinc-400 leading-relaxed">
                  {description}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-zinc-500 hover:text-white transition-colors"
                id="close-confirm-modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-950/50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
              id="cancel-confirm"
            >
              {cancelLabel || t('common.cancel')}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={clsx(
                "px-6 py-2 rounded-md text-sm font-bold text-white transition-all transform active:scale-95",
                resolvedVariant === 'danger' && "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/20",
                resolvedVariant === 'warning' && "bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-900/20",
                resolvedVariant === 'info' && "bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20"
              )}
              id="confirm-action"
            >
              {confirmLabel || t('common.confirm')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
