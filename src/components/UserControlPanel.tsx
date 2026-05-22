import { useState } from 'react';
import { Settings, Database, Shield } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { useInstanceStore } from '../store/instanceStore';
import { useTranslation } from 'react-i18next';
import UserAvatar from './ui/UserAvatar';
import UserSettingsModal from './ui/UserSettingsModal';
import { InstanceSettingsModal } from './InstanceSettingsModal';
import SuperAdminModal from './ui/SuperAdminModal';

export default function UserControlPanel() {
  const { t } = useTranslation();
  const { user, currentUserProfile } = useAuthStore();
  const { isCurrentInstanceValid, getCurrentInstance } = useInstanceStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInstanceSettingsOpen, setIsInstanceSettingsOpen] = useState(false);
  const [isSuperAdminOpen, setIsSuperAdminOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <div 
        className="h-14 bg-zinc-950 flex items-center px-2 gap-2 shrink-0 cursor-pointer hover:bg-zinc-900/80 transition-colors border-t border-zinc-900/50"
        onClick={() => setIsSettingsOpen(true)}
      >
        <UserAvatar 
          user={{
            username: currentUserProfile?.username || user?.user_metadata?.username || user?.user_metadata?.full_name || user?.email || t('common.user'),
            avatarUrl: currentUserProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '',
            status: currentUserProfile?.status || 'online'
          }} 
          size="md" 
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">
            {currentUserProfile?.username || user?.user_metadata?.username || user?.user_metadata?.full_name || user?.email || t('common.user')}
          </div>
          <div className="text-xs text-zinc-400 truncate capitalize">
            {currentUserProfile?.status === 'dnd' ? t('common.dnd') : 
             currentUserProfile?.status === 'idle' ? t('common.idle') : 
             currentUserProfile?.status === 'offline' ? t('common.offline') : t('common.online')}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {currentUserProfile?.is_super_admin && (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsSuperAdminOpen(true); }} 
              className="p-2 hover:bg-rose-500/10 rounded-md text-rose-500/70 hover:text-rose-500 transition-colors"
              title="Super Admin"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          {!!(window as any).electron && (
            <button 
              onClick={(e) => { e.stopPropagation(); setIsInstanceSettingsOpen(true); }} 
              className={clsx(
                "p-2 rounded-md transition-colors",
                isCurrentInstanceValid() 
                  ? "text-emerald-500 hover:bg-emerald-500/10" 
                  : "text-red-500 hover:bg-red-500/10"
              )} 
              title={
                isCurrentInstanceValid()
                  ? t('instances.connectedTo', { name: getCurrentInstance()?.name })
                  : t('instances.notConnected')
              }
            >
              <Database className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(true); }} 
            className="p-2 hover:bg-zinc-700/50 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <InstanceSettingsModal
        isOpen={isInstanceSettingsOpen}
        onClose={() => setIsInstanceSettingsOpen(false)}
      />
      <SuperAdminModal
        isOpen={isSuperAdminOpen}
        onClose={() => setIsSuperAdminOpen(false)}
      />
    </>
  );
}
