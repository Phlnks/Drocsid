import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import { Plus, Compass, Volume2, BellOff } from 'lucide-react';
import DrocsidLogo from './ui/DrocsidLogo';
import clsx from 'clsx';
import AddServerModal from './ui/AddServerModal';
import { useTranslation } from 'react-i18next';

export default function ServerList() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { selectedServerId, setSelectedServerId, addNotification, mutedServers, toggleMuteServer, connectedVoiceServerId } = useAppStore();
  const [servers, setServers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, serverId: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    
    const fetchServers = async () => {
      const { data: members } = await supabase.from('server_members').select('server_id').eq('user_id', user.id);
      if (members && members.length > 0) {
        const serverIds = members.map(m => m.server_id);
        const { data: srvs } = await supabase.from('servers').select('*').in('id', serverIds);
        if (srvs) setServers(srvs);
      } else {
        setServers([]);
      }
    };

    fetchServers();
    
    // Subscribe to servers changes for icon/name updates
    const serversChannel = supabase.channel('servers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => {
        fetchServers();
      })
      .subscribe();

    // Subscribe to server_members changes
    const membersChannel = supabase.channel('server_members_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `user_id=eq.${user.id}` }, () => {
        fetchServers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(serversChannel);
      supabase.removeChannel(membersChannel);
    };
  }, [user]);

  const handleCreateServer = async (name: string, iconUrl?: string) => {
    if (!user) return false;

    const { currentUserProfile } = useAuthStore.getState();
    if (!currentUserProfile?.is_super_admin && !currentUserProfile?.can_create_servers) {
      addNotification(t('errors.cannotCreateServer', 'Vous n\'avez pas la permission de créer des serveurs.'), "error");
      return false;
    }

    if (!currentUserProfile?.is_super_admin) {
      try {
        const { data: ownedServers, error: countError } = await supabase.from('servers').select('id').eq('owner_id', user.id);
        if (countError) throw countError;
        
        if (ownedServers && ownedServers.length >= (currentUserProfile.max_servers || 2)) {
           addNotification(t('errors.maxServersReached', `Vous avez atteint la limite de serveurs (${currentUserProfile.max_servers || 2}).`), "error");
           return false;
        }
      } catch (e) {
        console.error("Error checking server count:", e);
      }
    }

    try {
      console.log("Starting server creation for:", name);
      const { data: server, error: serverError } = await supabase.from('servers').insert({
        name,
        owner_id: user.id,
        icon_url: iconUrl
      }).select().maybeSingle();
      
      if (serverError) {
        console.error("Step 1: Servers insert failed", serverError);
        throw serverError;
      }
      
      console.log("Server created:", server.id);

      // Add creator as member
      const { error: memberError } = await supabase.from('server_members').insert({
        server_id: server.id,
        user_id: user.id,
        roles: [] // Use empty array initially to avoid UUID errors, ownership is defined in 'servers' table
      });

      if (memberError) {
        console.error("Step 2: Server members insert failed", memberError);
        throw memberError;
      }
      
      const { error: channelError } = await supabase.from('channels').insert({
        server_id: server.id,
        name: 'général',
        type: 'TEXT'
      });

      if (channelError) {
        console.error("Step 3: Channels insert failed", channelError);
        throw channelError;
      }

      const { error: logError } = await supabase.from('server_logs').insert({
        server_id: server.id,
        action: 'server_create',
        details: `Serveur "${name}" créé`,
        user_id: user.id,
        username: user.user_metadata?.username || 'Utilisateur'
      });

      if (logError) {
        console.error("Step 4: Server logs insert failed", logError);
        // We don't throw here as the server is already created and functional
      }
      
      setSelectedServerId(server.id);
      return true;
    } catch (error: any) {
      console.error("Full error creating server:", error);
      addNotification(`Failed to create server: ${error.message || 'Unknown error'}. Check console for details.`, "error");
      return false;
    }
  };

  const handleJoinServer = async (rawCode: string) => {
    if (!user) return;

    try {
      // Extract code from URL if a full link was provided
      let inviteCode = rawCode.trim();
      if (inviteCode.includes('/invite/')) {
        const parts = inviteCode.split('/invite/');
        inviteCode = parts[parts.length - 1].split(/[?#]/)[0]; // Handle trailing queries/hashes
      }

      console.log("Attempting to join with code:", inviteCode);

      // Find invite
      const { data: invite, error: inviteError } = await supabase.from('invites')
        .select('*')
        .eq('code', inviteCode)
        .maybeSingle();
      
      if (inviteError || !invite) {
        addNotification(t('app.serverList.invalidInvite'), "error");
        return;
      }

      // Check max uses
      if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
        addNotification(t('app.serverList.invalidInvite'), "error");
        return;
      }

      const serverId = invite.server_id;

      // Check if already a member
      const { data: existingMember } = await supabase.from('server_members')
        .select('*')
        .eq('server_id', serverId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (existingMember) {
        setSelectedServerId(serverId);
        return;
      }

      // Join server
      await supabase.from('server_members').insert({
        server_id: serverId,
        user_id: user.id,
        roles: ['member']
      });

      await supabase.from('server_logs').insert({
        server_id: serverId,
        action: 'member_join',
        details: `Membre ${user.user_metadata?.username || 'Utilisateur'} a rejoint via invitation`,
        user_id: user.id,
        username: user.user_metadata?.username || 'Utilisateur'
      });

      setSelectedServerId(serverId);
    } catch (error) {
      console.error("Error joining server:", error);
      addNotification(t('app.serverList.errorJoin'), "error");
    }
  };

  return (
    <>
      <div className="w-[72px] bg-zinc-950 flex flex-col items-center py-3 gap-2 flex-shrink-0 z-20">
        <motion.div 
          onClick={() => setSelectedServerId(null)}
          className={clsx(
            "relative group cursor-pointer flex flex-col items-center justify-center w-full gap-1"
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <div className={clsx(
            "absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200",
            selectedServerId === null ? "h-10" : "h-2 opacity-0 group-hover:opacity-100 group-hover:h-5"
          )} />
          <div className={clsx(
            "w-12 h-12 flex items-center justify-center transition-all duration-200 overflow-hidden",
            selectedServerId === null 
              ? "bg-black rounded-[16px]" 
              : "bg-zinc-800 rounded-[24px] group-hover:rounded-[16px] group-hover:bg-black"
          )}>
            <DrocsidLogo className="w-12 h-12" />
          </div>
          <span className="text-[9px] px-1 bg-indigo-500/10 text-indigo-400 rounded-sm font-bold tracking-tight border border-indigo-500/20 leading-none py-0.5 select-none shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">BETA</span>
        </motion.div>
        
        <div className="w-8 h-[2px] bg-zinc-800 rounded-full my-1" />

        {servers.map((server) => (
          <motion.div 
            key={server.id}
            onClick={() => setSelectedServerId(server.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, serverId: server.id });
            }}
            className="relative group cursor-pointer flex items-center justify-center w-full"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className={clsx(
              "absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200",
              selectedServerId === server.id ? "h-10" : "h-2 opacity-0 group-hover:opacity-100 group-hover:h-5"
            )} />
            <div className={clsx(
              "w-12 h-12 flex items-center justify-center text-lg font-semibold transition-all duration-200 overflow-hidden",
              selectedServerId === server.id 
                ? "bg-indigo-500 text-white rounded-[16px]" 
                : "bg-zinc-800 text-zinc-100 rounded-[24px] group-hover:rounded-[16px] group-hover:bg-indigo-500 group-hover:text-white"
            )}>
              {server.icon_url ? (
                <img src={server.icon_url} alt={server.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                server.name.charAt(0).toUpperCase()
              )}
            </div>
            {mutedServers.includes(server.id) && (
              <div className="absolute -top-1 -right-1 bg-zinc-900 rounded-full p-1 border border-zinc-800 z-10" title={t('app.serverList.muted')}>
                <BellOff className="w-3 h-3 text-red-500" />
              </div>
            )}
            {connectedVoiceServerId && servers.find(s => s.id === server.id) && (
              (() => {
                const isVoiceInThisServer = connectedVoiceServerId === server.id;
                if (!isVoiceInThisServer) return null;
                return (
                  <div className="absolute -bottom-1 -right-1 bg-zinc-900 rounded-full p-1 border border-zinc-800 z-10 shadow-lg">
                    <Volume2 className="w-3 h-3 text-emerald-500" />
                  </div>
                );
              })()
            )}
          </motion.div>
        ))}

        <motion.div 
          onClick={() => setIsModalOpen(true)}
          title={t('serverList.addServer')}
          className="w-12 h-12 bg-zinc-800 rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer text-emerald-500 hover:bg-emerald-500 hover:text-white mt-2 group"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus className="w-6 h-6" />
        </motion.div>
      </div>

      {contextMenu && (
        <div 
          className="fixed inset-0 z-[100]" 
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div 
            className="absolute bg-zinc-900 border border-zinc-800 rounded-md shadow-xl py-1 w-48"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMuteServer(contextMenu.serverId);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-left text-sm text-zinc-200 hover:bg-indigo-500 hover:text-white transition-colors"
            >
              {mutedServers.includes(contextMenu.serverId) ? t('app.serverList.unmute') : t('app.serverList.mute')}
            </button>
          </div>
        </div>
      )}

      <AddServerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateServer}
        onJoin={handleJoinServer}
      />
    </>
  );
}

