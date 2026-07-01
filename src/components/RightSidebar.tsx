import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useAuthStore } from "../store/authStore";
import {
  MessageSquare,
  Bell,
  Check,
  AtSign,
  X,
  Users,
  Flag,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { format } from "date-fns";
import clsx from "clsx";
import UserProfileModal from "./ui/UserProfileModal";
import UserAvatar from "./ui/UserAvatar";
import UserContextMenu from "./ui/UserContextMenu";
import StatusContent from "./StatusContent";
import { useTranslation } from "react-i18next";

export default function RightSidebar({
  forceTab,
}: {
  forceTab?: "users" | "notifications";
}) {
  const { t } = useTranslation();
  const [serverRoles, setServerRoles] = useState<any[]>([]);
  const [serverMembers, setServerMembers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"users" | "notifications">(
    forceTab || "users"
  );

  useEffect(() => {
    if (forceTab) {
      setActiveTab(forceTab);
    }
  }, [forceTab]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadDMs, setUnreadDMs] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{
    userId: string;
    username: string;
    x: number;
    y: number;
  } | null>(null);
  const [localUsers, setLocalUsers] = useState<any[]>([]);

  const { user: currentUser } = useAuthStore();
  const {
    setSelectedServerId,
    setSelectedChannelId,
    setSelectedDmId,
    setIsRightSidebarOpen,
    selectedDmId,
    onlineUserIds,
    selectedServerId,
    setHighlightedMessageId,
    globalProfiles,
  } = useAppStore();

  const users = Object.values(globalProfiles).filter((p) =>
    localUsers.includes(p.id)
  );

  useEffect(() => {
    const fetchUsers = async () => {
      if (selectedServerId) {
        // Fetch server specific data
        const [rolesRes, membersRes] = await Promise.all([
          supabase
            .from("roles")
            .select("*")
            .eq("server_id", selectedServerId)
            .order("order", { ascending: true }),
          supabase
            .from("server_members")
            .select("*")
            .eq("server_id", selectedServerId),
        ]);

        if (rolesRes.data) setServerRoles(rolesRes.data);
        if (membersRes.data) setServerMembers(membersRes.data);

        // Fetch profiles only for these members
        if (membersRes.data && membersRes.data.length > 0) {
          const memberIds = membersRes.data.map((m) => m.user_id);
          setLocalUsers(memberIds);
        }
      } else {
        // In DM view, only fetch profiles for DMs you are part of
        const { data: dms } = await supabase
          .from("dms")
          .select("participants")
          .contains("participants", [currentUser?.id]);
        if (dms) {
          const participants = new Set<string>();
          dms.forEach((dm) =>
            dm.participants.forEach((p: string) => participants.add(p))
          );
          if (participants.size > 0) {
            setLocalUsers(Array.from(participants));
          }
        }
        setServerRoles([]);
        setServerMembers([]);
      }
    };

    fetchUsers();

    const membersChan = "members_changes_" + (selectedServerId || "all");
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${membersChan}`) supabase.removeChannel(c);
    });
    const membersSub = supabase
      .channel(membersChan)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "server_members",
          filter: selectedServerId
            ? `server_id=eq.${selectedServerId}`
            : undefined,
        },
        () => fetchUsers()
      )
      .subscribe();

    const rolesChan = "roles_changes_" + (selectedServerId || "all");
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${rolesChan}`) supabase.removeChannel(c);
    });
    const rolesSub = supabase
      .channel(rolesChan)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roles",
          filter: selectedServerId
            ? `server_id=eq.${selectedServerId}`
            : undefined,
        },
        () => fetchUsers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membersSub);
      supabase.removeChannel(rolesSub);
    };
  }, [selectedServerId]);

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      // Fetch current user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();
      if (profile) setCurrentUserProfile(profile);

      // Fetch DMs
      const { data: dms } = await supabase
        .from("dms")
        .select("*")
        .contains("participants", [currentUser.id]);
      if (dms) setUnreadDMs(dms);

      // Fetch notifications
      const { data: notifs } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });
      if (notifs) {
        const parsedNotifs = notifs.map(n => {
          let data = n.data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch(e) {}
          }
          return { ...n, data };
        });
        setNotifications(parsedNotifs);

        // Fetch missing profiles for notifications
        const missingAuthorIds = parsedNotifs
          .map((n) => n.author_id || n.data?.author_id || n.sender_id || n.data?.sender_id || n.data?.senderId || n.data?.authorId)
          .filter((id) => id && !globalProfiles[id]);

        if (missingAuthorIds.length > 0) {
          const { data: missingProfiles } = await supabase
            .from("profiles")
            .select("*")
            .in("id", Array.from(new Set(missingAuthorIds)));
          if (missingProfiles) {
            useAppStore.getState().setGlobalProfiles(missingProfiles);
          }
        }
      }
    };

    fetchData();

    const notifChan = `notifs_${currentUser.id}`;
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${notifChan}`) supabase.removeChannel(c);
    });
    const notifSub = supabase
      .channel(notifChan)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dms" },
        (payload) => {
          const dm = (payload.new as any) || (payload.old as any);
          if (
            dm &&
            dm.participants &&
            dm.participants.includes(currentUser.id)
          ) {
            fetchData();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${currentUser.id}`,
        },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifSub);
    };
  }, [currentUser]);

  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const markAsRead = async (notifId: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notifId);
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", currentUser.id)
      .eq("read", false);
  };

  const jumpToFriend = () => {
    setSelectedServerId(null);
    setSelectedDmId(null);
  };

  const jumpToMessage = (result: any) => {
    const data = result.data || {};
    const serverId =
      data.server_id || data.serverId || result.server_id || result.serverId;
    const channelId =
      data.channel_id ||
      data.channelId ||
      result.channel_id ||
      result.channelId;
    const messageId = data.message_id || data.messageId || result.message_id || result.messageId;
    const authorId = result.author_id || data.author_id || result.sender_id || data.sender_id || data.senderId || data.authorId;

    const isDmNotification = result.type === "dm" || data.is_dm === true || serverId === "dms" || (!serverId && channelId);

    if (
      result.type === "friend" ||
      result.type === "friend_request" ||
      result.type === "friend_accept"
    ) {
      jumpToFriend();
    } else if (isDmNotification) {
      setSelectedServerId(null);
      if (channelId || authorId) setSelectedDmId(channelId || authorId);
      if (messageId) setHighlightedMessageId(messageId);
    } else {
      if (serverId) setSelectedServerId(serverId);
      if (channelId) setSelectedChannelId(channelId);
      if (messageId) setHighlightedMessageId(messageId);
    }

    if (!result.read) {
      markAsRead(result.id);
    }
  };

  const getUser = (userId: string) => users.find((u) => u.id === userId);

  useEffect(() => {
    if ((window as any).electron) {
      const unreadCount = notifications.filter((n) => !n.read).length;
      (window as any).electron.setBadge(unreadCount);
    }
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const totalUnreadCount = unreadCount;

  const getDisplayStatus = (user: any) => {
    if (!onlineUserIds.includes(user.id)) return "offline";
    return user.status || "online";
  };

  const getGroupedUsers = () => {
    const isOnline = (u: any) => getDisplayStatus(u) !== "offline";
    const onlineUsers = users.filter(isOnline);
    const offlineUsers = users.filter((u) => !isOnline(u));

    if (!selectedServerId) {
      const groups = [];
      if (onlineUsers.length > 0) {
        groups.push({
          id: "online",
          name: t("friends.onlineCount", { count: onlineUsers.length }),
          users: onlineUsers,
          isOffline: false,
        });
      }
      if (offlineUsers.length > 0) {
        groups.push({
          id: "offline",
          name: t("friends.offlineCount", { count: offlineUsers.length }),
          users: offlineUsers,
          isOffline: true,
        });
      }
      return groups;
    }

    // Server view: Group by role
    const groups: {
      id: string;
      name: string;
      users: any[];
      isOffline: boolean;
    }[] = [];

    // Maps userId to its highest role (the one with the lowest order)
    const userHighestRole = new Map<string, any>();
    serverMembers.forEach((member) => {
      if (!member.roles || member.roles.length === 0) return;
      const roles = serverRoles
        .filter((r) => member.roles.includes(r.id))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      if (roles.length > 0) {
        userHighestRole.set(member.user_id, roles[0]);
      }
    });

    // Online users grouped by roles
    serverRoles.forEach((role) => {
      const membersInRole = users
        .filter((u) => {
          const highestRole = userHighestRole.get(u.id);
          return highestRole?.id === role.id && isOnline(u);
        })
        .sort((a, b) => a.username.localeCompare(b.username));

      if (membersInRole.length > 0) {
        groups.push({
          id: role.id,
          name: `${role.name} — ${membersInRole.length}`,
          users: membersInRole,
          isOffline: false,
        });
      }
    });

    // Members with no role and online
    const membersWithNoRoleOnline = users
      .filter((u) => !userHighestRole.has(u.id) && isOnline(u))
      .sort((a, b) => a.username.localeCompare(b.username));

    if (membersWithNoRoleOnline.length > 0) {
      groups.push({
        id: "online-no-role",
        name: `${t("common.online")} — ${membersWithNoRoleOnline.length}`,
        users: membersWithNoRoleOnline,
        isOffline: false,
      });
    }

    // Finally, offline members
    const offlineMembers = users
      .filter((u) => !isOnline(u))
      .sort((a, b) => a.username.localeCompare(b.username));

    if (offlineMembers.length > 0) {
      groups.push({
        id: "offline",
        name: `${t("common.offline")} — ${offlineMembers.length}`,
        users: offlineMembers,
        isOffline: true,
      });
    }

    return groups;
  };

  const groupedUsers = getGroupedUsers();

  const handleContextMenu = (e: React.MouseEvent, user: any) => {
    e.preventDefault();
    setContextMenu({
      userId: user.id,
      username: user.username,
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    <>
      <div className="w-full md:w-72 bg-zinc-800/50 border-l border-zinc-800 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
            {t("common.sidebar")}
          </h2>
          <button
            onClick={() => setIsRightSidebarOpen(false)}
            className="p-2 -mr-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 rounded-md transition-colors md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === "users"
                ? "text-indigo-400 border-b-2 border-indigo-400"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            {t("common.members")}
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "notifications"
                ? "text-indigo-400 border-b-2 border-indigo-400"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
            title={t("settings.notifications")}
          >
            <div className="flex items-center justify-center gap-1">
              <Bell className="w-4 h-4" />
              {totalUnreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {totalUnreadCount}
                </span>
              )}
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col">
          {activeTab === "users" ? (
            <div className="space-y-6">
              {groupedUsers.map((group) => (
                <div key={group.id}>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    {group.name}
                  </h3>
                  <div className="space-y-1">
                    {group.users.map((user) => {
                      const status = getDisplayStatus(user);
                      return (
                        <div
                          key={user.id}
                          onClick={() => setSelectedUser(user)}
                          onContextMenu={(e) => handleContextMenu(e, user)}
                          className={clsx(
                            "flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800/50 transition-colors cursor-pointer group",
                            group.isOffline && "opacity-60"
                          )}
                        >
                          <UserAvatar
                            user={{
                              username: user.username,
                              avatar_url: user.avatar_url,
                              status: group.isOffline ? "offline" : status,
                            }}
                            size="md"
                            className={group.isOffline ? "opacity-60" : ""}
                          />
                          <div className="flex flex-col truncate">
                            <span
                              className={clsx(
                                "text-sm font-medium truncate shrink",
                                group.isOffline
                                  ? "text-zinc-400"
                                  : "text-zinc-300"
                              )}
                            >
                              {user.username}
                            </span>
                            {user.custom_status && (
                              <span className="text-[11px] text-zinc-400 truncate opacity-90 leading-tight">
                                <StatusContent content={user.custom_status} />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groupedUsers.length === 0 && (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  {t("common.noMembers")}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {t("notifications.mentionsAndNotifications")}
                </h3>
                {notifications.some((n) => !n.read) && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-tight"
                  >
                    {t("notifications.markAllRead")}
                  </button>
                )}
              </div>

              {notifications.length > 0 ? (
                <div className="space-y-3">
                  {notifications.map((notif) => {
                    const typeLower = notif.type?.toLowerCase();
                    const isDm =
                      typeLower === "dm" || 
                      typeLower === "message" ||
                      notif.data?.is_dm === true ||
                      (!notif.type && !notif.data?.server_id && !notif.data?.serverId);
                    const isMention =
                      typeLower === "mention" || (!notif.type && !isDm);
                    const isReply = typeLower === "reply";
                    const isReaction = typeLower === "reaction";
                    const isFriendRequest = typeLower === "friend_request";
                    const isFriendAccept = typeLower === "friend_accept";
                    const isReportUpdate = typeLower === "report_update";

                    const isDM = isDm && !isReply && !isReaction && !isMention;

                    const isUnhandled = !isDM && !isMention && !isReply && !isReaction && !isFriendRequest && !isFriendAccept && !isReportUpdate;

                    const authorId = notif.author_id || notif.data?.author_id || notif.sender_id || notif.data?.sender_id || notif.data?.senderId || notif.data?.authorId;
                    const resolvedName = globalProfiles[authorId]?.display_name ||
                      globalProfiles[authorId]?.username ||
                      notif.data?.author_name ||
                      notif.author_name ||
                      notif.data?.sender_name ||
                      notif.sender_name ||
                      notif.data?.authorName ||
                      notif.data?.senderName ||
                      t("common.user");

                    return (
                      <div
                        key={notif.id}
                        className={clsx(
                          "bg-zinc-800/50 p-3 rounded-md border transition-colors cursor-pointer hover:bg-zinc-700/50 group",
                          notif.read
                            ? "border-zinc-700/30 opacity-70"
                            : "border-indigo-500/50 bg-indigo-500/5"
                        )}
                        onClick={() =>
                          !isReportUpdate && !isFriendRequest && !isFriendAccept
                            ? jumpToMessage(notif)
                            : undefined
                        }
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            {isMention && (
                              <AtSign className="w-3 h-3 text-indigo-400" />
                            )}
                            {isReply && (
                              <MessageSquare className="w-3 h-3 text-emerald-400" />
                            )}
                            {isReaction && (
                              <MessageSquare className="w-3 h-3 text-amber-400" />
                            )}
                            {isDM && (
                              <MessageSquare className="w-3 h-3 text-indigo-400" />
                            )}
                            {isUnhandled && (
                              <Bell className="w-3 h-3 text-zinc-400" />
                            )}
                            {(isFriendRequest || isFriendAccept) && (
                              <Bell className="w-3 h-3 text-indigo-400" />
                            )}
                            {isReportUpdate && (
                              <Flag className="w-3 h-3 text-amber-400" />
                            )}
                            <span>
                              {isMention && (
                                <>
                                  {t("notifications.mentionedBy")}
                                  <span className="font-medium text-zinc-300">
                                    {" "}
                                    {resolvedName}
                                  </span>
                                  {notif.data?.server_name && (
                                    <span className="text-[10px] text-zinc-500 block mt-0.5">
                                      dans {notif.data.server_name} #
                                      {notif.data.channel_name || "salon"}
                                    </span>
                                  )}
                                </>
                              )}
                              {isReply && (
                                <>
                                  <span className="font-medium text-emerald-400">
                                    {resolvedName}
                                  </span>{" "}
                                  a répondu
                                  {notif.data?.server_name && (
                                    <span className="text-[10px] text-zinc-500 block mt-0.5">
                                      dans {notif.data.server_name} #
                                      {notif.data.channel_name || "salon"}
                                    </span>
                                  )}
                                </>
                              )}
                              {isReaction && (
                                <>
                                  <span className="font-medium text-amber-400">
                                    {resolvedName}
                                  </span>{" "}
                                  a réagi
                                </>
                              )}
                              {isDM && (
                                <>
                                  {t("notifications.newMessageFrom", {
                                    name: "",
                                  }).trim()}
                                  <span className="font-medium text-zinc-300">
                                    {" "}
                                    {resolvedName}
                                  </span>
                                </>
                              )}
                              {isFriendRequest && (
                                <>
                                  <span className="font-medium text-zinc-300">
                                    {resolvedName}{" "}
                                  </span>
                                  {t("friends.incomingRequest")}
                                </>
                              )}
                              {isFriendAccept && (
                                <>
                                  <span className="font-medium text-zinc-300">
                                    {resolvedName}{" "}
                                  </span>
                                  {t("friends.notificationFriendAccepted")}
                                </>
                              )}
                              {isReportUpdate && (
                                <span className="font-medium text-amber-400">
                                  Mise à jour de signalement
                                </span>
                              )}
                              {isUnhandled && (
                                <>
                                  <span className="font-medium text-zinc-300">
                                    {resolvedName}{" "}
                                  </span>
                                  {notif.type ? `(${notif.type})` : t("notifications.newNotification", { defaultValue: "Nouvelle notification" })}
                                </>
                              )}
                            </span>
                          </div>
                          {!notif.read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notif.id);
                              }}
                              className="text-zinc-500 hover:text-indigo-400 transition-colors"
                              title={t("notifications.markAsRead")}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {(notif.data?.content || notif.content) &&
                          !isFriendAccept && (
                            <p className="text-sm text-zinc-300 line-clamp-3 break-words mb-2">
                              {notif.data?.content || notif.content}
                            </p>
                          )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-zinc-500">
                            {notif.created_at
                              ? format(
                                  new Date(notif.created_at),
                                  "dd/MM/yyyy HH:mm"
                                )
                              : ""}
                          </span>
                          <span className="text-[10px] text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            {t("notifications.viewMessage")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-zinc-500 text-sm">
                  {t("notifications.noNotifications")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <UserProfileModal
        isOpen={selectedUser !== null}
        onClose={() => setSelectedUser(null)}
        user={selectedUser}
      />

      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          serverId={selectedServerId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onViewProfile={() => {
            const u = users.find((u) => u.id === contextMenu.userId);
            if (u) setSelectedUser(u);
          }}
        />
      )}
    </>
  );
}
