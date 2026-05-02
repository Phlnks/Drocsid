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
          className="relative w-full max-w-[440px] bg-[#313338] border border-zinc-800/20 rounded-lg shadow-2xl overflow-hidden"
        >
          <div className="p-4 pt-6">
            <div className="flex flex-col gap-4">
              <div className="px-1 text-center sm:text-left">
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-zinc-300 text-[15px] leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-4 bg-[#2b2d31]">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-white hover:underline transition-all"
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
                "px-7 py-2.5 rounded-[3px] text-sm font-medium text-white transition-all transform active:scale-95",
                resolvedVariant === 'danger' && "bg-[#da373c] hover:bg-[#a1282c]",
                resolvedVariant === 'warning' && "bg-[#f0b232] hover:bg-[#c49129]",
                resolvedVariant === 'info' && "bg-[#5865f2] hover:bg-[#4752c4]"
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
