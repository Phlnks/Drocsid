import React from 'react';
import { motion } from 'motion/react';
import { Save } from 'lucide-react';

interface UserAvatarProps {
  user: {
    username?: string;
    avatarUrl?: string;
    avatar_url?: string;
    status?: string;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
}

export default function UserAvatar({ user, size = 'md', showStatus = true, className = '' }: UserAvatarProps) {
  const sizeClasses = {
    xs: 'w-4 h-4 text-[8px]',
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-24 h-24 text-3xl'
  };

  const statusColors = {
    online: 'bg-emerald-500',
    idle: 'bg-amber-500',
    dnd: 'bg-red-500',
    offline: 'bg-zinc-500'
  };

  const statusSizeClasses = {
    xs: 'w-1.5 h-1.5 border',
    sm: 'w-2 h-2 border-2',
    md: 'w-2.5 h-2.5 border-2',
    lg: 'w-3 h-3 border-2',
    xl: 'w-6 h-6 border-4'
  };

  const status = (user?.status as keyof typeof statusColors) || 'offline';
  const avatarUrl = user?.avatarUrl || user?.avatar_url;

  const [imageError, setImageError] = React.useState(false);

  // Reset image error if avatarUrl changes
  React.useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  return (
    <motion.div 
      className={`relative inline-block ${className}`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div 
        className={`${sizeClasses[size]} rounded-full bg-indigo-500 flex items-center justify-center overflow-hidden shrink-0 font-bold text-white transition-all ring-0 group-hover:ring-2 ring-indigo-500/50 shadow-none group-hover:shadow-[0_0_15px_rgba(99,102,241,0.5)]`}
      >
        {avatarUrl === 'SAVED_MESSAGES_ICON' ? (
          <Save className="w-1/2 h-1/2" />
        ) : (avatarUrl && !imageError) ? (
          <img 
            src={avatarUrl} 
            alt={user?.username || 'User'} 
            className="w-full h-full object-cover" 
            loading="lazy"
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span>{user?.username?.charAt(0).toUpperCase() || 'U'}</span>
        )}
      </div>
      {showStatus && (
        <div className={`absolute bottom-0 right-0 rounded-full border-zinc-900 ${statusSizeClasses[size]} ${statusColors[status]}`} />
      )}
    </motion.div>
  );
}

