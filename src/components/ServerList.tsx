import { useEffect, useState } from "react";
import { motion, Reorder } from "motion/react";
import { supabase } from "../supabase";
import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import { Plus, Compass, Users, Volume2, BellOff } from "lucide-react";
import DrocsidLogo from "./ui/DrocsidLogo";
import clsx from "clsx";
import AddServerModal from "./ui/AddServerModal";
import { useTranslation } from "react-i18next";

export default function ServerList() {
  const { t } = useTranslation();
  const { user, currentUserProfile } = useAuthStore();
  const {
    selectedServerId,
    setSelectedServerId,
    addNotification,
    mutedServers,
    toggleMuteServer,
    connectedVoiceServerId,
    selectedChannelId,
    serverOrder,
    setServerOrder,
    voiceParticipants,
  } = useAppStore();
  const [servers, setServers] = useState<any[]>([]);
  const [sortedServers, setSortedServers] = useState<any[]>([]);
  const [unreadServers, setUnreadServers] = useState<Set<string>>(new Set());
  const [serverMentions, setServerMentions] = useState<Record<string, number>>(
    {}
  );
  const [audioChannels, setAudioChannels] = useState<{id: string, server_id: string}[]>([]);
  const [unreadDMsCount, setUnreadDMsCount] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    serverId: string;
  } | null>(null);

  useEffect(() => {
    if (servers.length === 0) {
      setSortedServers([]);
      return;
    }
    const nextServers = [...servers].sort((a, b) => {
      const idxA = serverOrder.indexOf(a.id);
      const idxB = serverOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
    setSortedServers(nextServers);
  }, [servers, serverOrder]);

  useEffect(() => {
    if (!user) return;

    const fetchServers = async () => {
      const { data: members } = await supabase
        .from("server_members")
        .select("server_id")
        .eq("user_id", user.id);
      if (members && members.length > 0) {
        const serverIds = members.map((m) => m.server_id);
        const { data: srvs } = await supabase
          .from("servers")
          .select("*")
          .in("id", serverIds);
        if (srvs) setServers(srvs);
      } else {
        setServers([]);
      }
    };

    fetchServers();

    // Subscribe to servers changes for icon/name updates
    const serversChannelName = `servers_changes_${user.id}`;
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${serversChannelName}`)
        supabase.removeChannel(c);
    });
    const serversChannel = supabase
      .channel(serversChannelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "servers" },
        () => {
          fetchServers();
        }
      )
      .subscribe();

    // Subscribe to server_members changes
    const membersChannelName = `server_members_changes_${user.id}`;
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${membersChannelName}`)
        supabase.removeChannel(c);
    });
    const membersChannel = supabase
      .channel(membersChannelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "server_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchServers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(serversChannel);
      supabase.removeChannel(membersChannel);
    };
  }, [user]);

  useEffect(() => {
    if (!user || servers.length === 0) return;

    const fetchUnreads = async () => {
      const serverIds = servers.map((s) => s.id);

      const { data: allChannels } = await supabase
        .from("channels")
        .select("id, server_id, type, last_message_at")
        .in("server_id", serverIds)
        .in("type", ["TEXT", "VOICE"]);

      const aChannels = allChannels?.filter(c => c.type === "VOICE") || [];
      setAudioChannels(aChannels);

      const unreads = new Set<string>();
      if (allChannels) {
        allChannels.forEach((ch) => {
          if (ch.type === "TEXT" && ch.last_message_at) {
            const readAt = currentUserProfile?.last_read?.[ch.id] || 0;
            const msgAt = new Date(ch.last_message_at).getTime();
            if (msgAt > readAt && selectedChannelId !== ch.id) {
              unreads.add(ch.server_id);
            }
          }
        });
      }
      setUnreadServers(unreads);

      const { data: notifs } = await supabase
        .from("notifications")
        .select("type, data")
        .eq("user_id", user.id)
        .eq("read", false);
      const mentionsMap: Record<string, number> = {};
      let dmsCount = 0;
      if (notifs) {
        notifs.forEach((n) => {
          let data = n.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch (e) {}
          }
          
          const isDm = n.type === "dm" || data?.is_dm === true;
          if (isDm) {
            dmsCount++;
          } else if (
            (n.type === "mention" || n.type === "reply" || !n.type) &&
            data?.server_id
          ) {
            mentionsMap[data.server_id] =
              (mentionsMap[data.server_id] || 0) + 1;
          }
        });
      }
      setServerMentions(mentionsMap);
      setUnreadDMsCount(dmsCount);
    };

    fetchUnreads();

    const subName = `server_list_unreads_${user.id}`;
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${subName}`) supabase.removeChannel(c);
    });
    const sub = supabase
      .channel(subName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channels" },
        () => {
          fetchUnreads();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUnreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [user, servers, currentUserProfile?.last_read, selectedChannelId]);

  const handleCreateServer = async (name: string, iconUrl?: string) => {
    if (!user) return false;

    const { currentUserProfile } = useAuthStore.getState();
    if (
      !currentUserProfile?.is_super_admin &&
      !currentUserProfile?.can_create_servers
    ) {
      addNotification(
        t(
          "errors.cannotCreateServer",
          "Vous n'avez pas la permission de créer des serveurs."
        ),
        "error"
      );
      return false;
    }

    if (!currentUserProfile?.is_super_admin) {
      try {
        const { data: ownedServers, error: countError } = await supabase
          .from("servers")
          .select("id")
          .eq("owner_id", user.id);
        if (countError) throw countError;

        if (
          ownedServers &&
          ownedServers.length >= (currentUserProfile.max_servers || 2)
        ) {
          addNotification(
            t(
              "errors.maxServersReached",
              `Vous avez atteint la limite de serveurs (${
                currentUserProfile.max_servers || 2
              }).`
            ),
            "error"
          );
          return false;
        }
      } catch (e) {
        console.error("Error checking server count:", e);
      }
    }

    try {
      console.log("Starting server creation for:", name);
      const { data: server, error: serverError } = await supabase
        .from("servers")
        .insert({
          name,
          owner_id: user.id,
          icon_url: iconUrl,
        })
        .select()
        .maybeSingle();

      if (serverError) {
        console.error("Step 1: Servers insert failed", serverError);
        throw serverError;
      }

      console.log("Server created:", server.id);

      // Add creator as member
      const { error: memberError } = await supabase
        .from("server_members")
        .insert({
          server_id: server.id,
          user_id: user.id,
          roles: [], // Use empty array initially to avoid UUID errors, ownership is defined in 'servers' table
        });

      if (memberError) {
        console.error("Step 2: Server members insert failed", memberError);
        throw memberError;
      }

      const { error: channelError } = await supabase.from("channels").insert({
        server_id: server.id,
        name: "général",
        type: "TEXT",
      });

      if (channelError) {
        console.error("Step 3: Channels insert failed", channelError);
        throw channelError;
      }

      const { error: logError } = await supabase.from("server_logs").insert({
        server_id: server.id,
        action: "server_create",
        details: `Serveur "${name}" créé`,
        user_id: user.id,
        username: user.user_metadata?.username || "Utilisateur",
      });

      if (logError) {
        console.error("Step 4: Server logs insert failed", logError);
        // We don't throw here as the server is already created and functional
      }

      setSelectedServerId(server.id);
      return true;
    } catch (error: any) {
      console.error("Full error creating server:", error);
      addNotification(
        `Failed to create server: ${
          error.message || "Unknown error"
        }. Check console for details.`,
        "error"
      );
      return false;
    }
  };

  const handleJoinServer = async (rawCode: string) => {
    if (!user) return;

    try {
      // Extract code from URL if a full link was provided
      let inviteCode = rawCode.trim();
      if (inviteCode.includes("/invite/")) {
        const parts = inviteCode.split("/invite/");
        inviteCode = parts[parts.length - 1].split(/[?#]/)[0]; // Handle trailing queries/hashes
      }

      console.log("Attempting to join with code:", inviteCode);

      // Find invite
      const { data: invite, error: inviteError } = await supabase
        .from("invites")
        .select("*")
        .eq("code", inviteCode)
        .maybeSingle();

      if (inviteError || !invite) {
        addNotification(t("app.serverList.invalidInvite"), "error");
        return;
      }

      // Check max uses
      if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
        addNotification(t("app.serverList.invalidInvite"), "error");
        return;
      }

      const serverId = invite.server_id;

      // Check if banned
      const { data: ban } = await supabase
        .from("server_bans")
        .select("*")
        .eq("server_id", serverId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (ban) {
        addNotification(t("app.bannedFromServer"), "error");
        return;
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from("server_members")
        .select("*")
        .eq("server_id", serverId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingMember) {
        setSelectedServerId(serverId);
        return;
      }

      // Join server
      await supabase.from("server_members").insert({
        server_id: serverId,
        user_id: user.id,
        roles: ["member"],
      });

      await supabase.from("server_logs").insert({
        server_id: serverId,
        action: "member_join",
        details: `Membre ${
          user.user_metadata?.username || "Utilisateur"
        } a rejoint via invitation`,
        user_id: user.id,
        username: user.user_metadata?.username || "Utilisateur",
      });

      setSelectedServerId(serverId);
    } catch (error) {
      console.error("Error joining server:", error);
      addNotification(t("app.serverList.errorJoin"), "error");
    }
  };

  return (
    <>
      <div className="w-[88px] md:w-[72px] bg-zinc-950 flex flex-col items-center py-4 md:py-3 gap-3 md:gap-2 flex-shrink-0 z-20 overflow-y-auto no-scrollbar">
        <motion.div
          onClick={() => setSelectedServerId(null)}
          className={clsx(
            "relative group cursor-pointer flex flex-col items-center justify-center w-full gap-1"
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <div
            className={clsx(
              "absolute left-0 bg-white transition-all duration-200",
              selectedServerId === null
                ? "h-12 md:h-10 w-1.5 md:w-1 rounded-r-full"
                : "h-2 w-1.5 md:w-1 opacity-0 group-hover:opacity-100 group-hover:h-5 rounded-r-md"
            )}
          />
          <div className="relative">
            <div
              className={clsx(
                "w-16 h-16 md:w-12 md:h-12 flex items-center justify-center transition-all duration-200 overflow-hidden",
                selectedServerId === null
                  ? "bg-black rounded-[20px] md:rounded-[16px]"
                  : "bg-zinc-800 rounded-[32px] md:rounded-[24px] group-hover:rounded-[20px] md:group-hover:rounded-[16px] group-hover:bg-black"
              )}
            >
              <DrocsidLogo className="w-16 h-16 md:w-12 md:h-12" />
            </div>
            {unreadDMsCount > 0 && (
              <div className="absolute -top-1.5 -left-1.5 bg-red-500 text-white text-[11px] md:text-[10px] font-bold min-w-[22px] md:min-w-[18px] h-[22px] md:h-[18px] flex items-center justify-center px-1 rounded-full border-2 border-zinc-950 z-20 shadow-[0_0_12px_rgba(239,68,68,0.6)] ring-1 ring-white/10 animate-in zoom-in duration-300">
                {unreadDMsCount > 99 ? "99+" : unreadDMsCount}
              </div>
            )}
          </div>
          <span className="text-[10px] md:text-[9px] px-1 md:px-1 bg-indigo-500/10 text-indigo-400 rounded-sm font-bold tracking-tight border border-indigo-500/20 leading-none py-0.5 select-none shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            BETA
          </span>
        </motion.div>

        <div className="w-10 md:w-8 h-[2px] bg-zinc-800 rounded-full my-1 md:my-1" />
        <Reorder.Group
          axis="y"
          values={sortedServers}
          onReorder={(newOrder) => {
            setSortedServers(newOrder);
            setServerOrder(newOrder.map((s: any) => s.id));
          }}
          className="flex flex-col gap-3 md:gap-2 items-center w-full"
        >
          {sortedServers.map((server) => {
            const serverAudioChannels = audioChannels.filter(c => c.server_id === server.id);
            let voiceCount = 0;
            serverAudioChannels.forEach(c => {
                if (voiceParticipants[c.id]) {
                    voiceCount += voiceParticipants[c.id].length;
                }
            });

            return (
            <Reorder.Item
              key={server.id}
              value={server}
              onClick={() => setSelectedServerId(server.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  serverId: server.id,
                });
              }}
              className="relative group cursor-pointer flex items-center justify-center w-full focus:outline-none"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div
                className={clsx(
                  "absolute left-0 transition-all duration-200",
                  selectedServerId === server.id
                    ? "h-12 md:h-10 w-1.5 md:w-1 rounded-r-full bg-white"
                    : serverMentions[server.id] > 0
                    ? "h-10 md:h-8 w-2 md:w-1.5 opacity-100 rounded-r-full bg-red-400 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                    : unreadServers.has(server.id)
                    ? "h-2 md:h-2 w-1.5 md:w-1 opacity-100 rounded-r-full bg-white group-hover:h-5 md:group-hover:h-5 group-hover:rounded-r-md"
                    : "h-2 w-1.5 md:w-1 opacity-0 group-hover:opacity-100 group-hover:h-5 rounded-r-md bg-white"
                )}
              />
              
              <div className="relative">
                <div
                  className={clsx(
                    "relative w-16 h-16 md:w-12 md:h-12 flex items-center justify-center text-xl md:text-lg font-semibold transition-all duration-200 overflow-hidden",
                    selectedServerId === server.id
                      ? "bg-indigo-500 text-white rounded-[20px] md:rounded-[16px]"
                      : "bg-zinc-800 text-zinc-100 rounded-[32px] md:rounded-[24px] group-hover:rounded-[20px] md:group-hover:rounded-[16px] group-hover:bg-indigo-500 group-hover:text-white"
                  )}
                >
                  {server.icon_url ? (
                    <img
                      src={server.icon_url}
                      alt={server.name}
                      className="w-full h-full object-cover pointer-events-none"
                      loading="lazy"
                    />
                  ) : (
                    server.name.charAt(0).toUpperCase()
                  )}

                  {/* Voice participants overlay on hover */}
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
                    <Users className={clsx("w-5 h-5 md:w-4 md:h-4 mb-0.5 transition-colors", voiceCount > 0 ? "text-emerald-400" : "text-zinc-400")} />
                    <span className={clsx("text-[12px] md:text-[10px] font-bold leading-none", voiceCount > 0 ? "text-emerald-400" : "text-zinc-400")}>{voiceCount}</span>
                  </div>
                </div>
                
                {mutedServers.includes(server.id) && (
                  <div
                    className="absolute -top-1 -right-1 bg-zinc-900 rounded-full p-1 md:p-1 border border-zinc-800 z-10"
                    title={t("app.serverList.muted")}
                  >
                    <BellOff className="w-4 h-4 md:w-3 md:h-3 text-red-500" />
                  </div>
                )}

                {/* Mention Badge */}
                {serverMentions[server.id] > 0 && (
                  <div className="absolute -top-1.5 -left-1.5 bg-red-500 text-white text-[11px] md:text-[10px] font-bold min-w-[22px] md:min-w-[18px] h-[22px] md:h-[18px] flex items-center justify-center px-1 rounded-full border-2 border-zinc-950 z-20 shadow-[0_0_15px_rgba(239,68,68,0.8)] ring-1 ring-white/20 animate-in zoom-in duration-300">
                    {serverMentions[server.id] > 99
                      ? "99+"
                      : serverMentions[server.id]}
                  </div>
                )}

                {connectedVoiceServerId &&
                  servers.find((s) => s.id === server.id) &&
                  (() => {
                    const isVoiceInThisServer =
                      connectedVoiceServerId === server.id;
                    if (!isVoiceInThisServer) return null;
                    return (
                      <div
                        className={clsx(
                          "absolute bg-zinc-900 rounded-full p-1 border border-zinc-950 z-10 shadow-lg",
                          serverMentions[server.id]
                            ? "-bottom-1 -left-1"
                            : "-bottom-1 -right-1"
                        )}
                      >
                        <Volume2 className="w-4 h-4 md:w-3 md:h-3 text-emerald-500" />
                      </div>
                    );
                  })()}
              </div>
            </Reorder.Item>
          )})}
        </Reorder.Group>

        <motion.div
          onClick={() => setIsModalOpen(true)}
          title={t("serverList.addServer")}
          className="w-16 h-16 md:w-12 md:h-12 bg-zinc-800 rounded-[32px] md:rounded-[24px] hover:rounded-[20px] md:hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer text-emerald-500 hover:bg-emerald-500 hover:text-white mt-1 md:mt-2 group"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus className="w-8 h-8 md:w-6 md:h-6" />
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
              {mutedServers.includes(contextMenu.serverId)
                ? t("app.serverList.unmute")
                : t("app.serverList.mute")}
            </button>
          </div>
        </div>
      )}

      <AddServerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateServer}
        onJoin={handleJoinServer}
        canCreateServers={
          !!(
            currentUserProfile?.is_super_admin ||
            currentUserProfile?.can_create_servers
          )
        }
      />
    </>
  );
}
