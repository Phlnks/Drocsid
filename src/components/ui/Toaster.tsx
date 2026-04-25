import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore, Notification } from '../../store/appStore';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toaster() {
  const { notifications, removeNotification } = useAppStore();

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-[320px] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <Toast 
            key={notification.id} 
            notification={notification} 
            onClose={() => removeNotification(notification.id)} 
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Toast({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400" />,
    info: <Info className="w-5 h-5 text-sky-400" />
  };

  const bgColors = {
    success: 'bg-emerald-500/10 border-emerald-500/20',
    error: 'bg-rose-500/10 border-rose-500/20',
    info: 'bg-sky-500/10 border-sky-500/20'
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl ${bgColors[notification.type]}`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {icons[notification.type]}
      </div>
      <div className="flex-1 text-sm text-zinc-100 font-medium leading-relaxed">
        {notification.message}
      </div>
      <button 
        onClick={onClose}
        className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
