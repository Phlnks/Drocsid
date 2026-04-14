import React from 'react';

interface UserAvatarProps {
  user: {
    username?: string;
    avatarUrl?: string;
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

  return (
    <div className={`relative inline-block ${className}`}>
      <div className={`${sizeClasses[size]} rounded-full bg-indigo-500 flex items-center justify-center overflow-hidden shrink-0 font-bold text-white`}>
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={user?.username || 'User'} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          user?.username?.charAt(0).toUpperCase() || 'U'
        )}
      </div>
      {showStatus && (
        <div className={`absolute bottom-0 right-0 rounded-full border-zinc-900 ${statusSizeClasses[size]} ${statusColors[status]}`} />
      )}
    </div>
  );
}
