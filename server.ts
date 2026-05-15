import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";
import webpush from "web-push";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = process.env.APP_URL || "";
const APP_HOST = APP_URL ? new URL(APP_URL).host : "";
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production" || process.env.RENDER === "true";

const CORS_EXTRA_ORIGINS = (process.env.CORS_EXTRA_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_HOSTS_EXTRA = (process.env.ALLOWED_HOSTS_EXTRA || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || "mailto:admin@drocsid.com";
const DM_PUSH_BASE_PATH = process.env.DM_PUSH_BASE_PATH || "/?dm=";
const PUSH_ICON_URL = process.env.PUSH_ICON_URL || "/logo-192.png";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

let pushEnabled = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    pushEnabled = true;
    console.log("[push] VAPID configured successfully.");
  } catch (err) {
    pushEnabled = false;
    console.warn("[push] Invalid VAPID configuration. Push notifications disabled.");
    console.warn(err);
  }
} else {
  console.warn("[push] Missing VAPID keys. Push notifications disabled.");
}

async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string; icon?: string }
) {
  if (!pushEnabled) return;

  try {
    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", userId);

    if (error || !data?.length) return;

    const payloadStr = JSON.stringify(payload);

    for (const row of data) {
      try {
        await webpush.sendNotification(row.subscription, payloadStr);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId);
        }
      }
    }
  } catch (err) {
    console.error("sendPushToUser error:", err);
  }
}

async function requireSuperAdmin(req: express.Request, res: express.Response) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Missing auth header" });
    return null;
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return user;
}

async function startServer() {
  const CORS_ORIGINS = [
    APP_URL,
    ...(NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:5173"] : []),
    ...CORS_EXTRA_ORIGINS,
  ].filter(Boolean);

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: CORS_ORIGINS,
      methods: ["GET", "POST"],
    },
    pingInterval: 60000,
    pingTimeout: 120000,
  });

  app.use(express.json({ limit: "10mb" }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && CORS_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use((req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' wss: https:; frame-ancestors 'none';"
    );
    next();
  });

  const ALLOWED_HOSTS = [
    APP_HOST,
    ...(NODE_ENV !== "production"
      ? ["localhost:3000", "localhost:5173", "127.0.0.1:3000", "127.0.0.1:5173"]
      : []),
    ...ALLOWED_HOSTS_EXTRA,
  ].filter(Boolean);

  app.use((req, res, next) => {
    const host = req.headers.host || "";
    if (!ALLOWED_HOSTS.includes(host)) {
      return res.status(400).json({ error: "Invalid host" });
    }
    next();
  });

  app.post("/api/livekit/token", express.json(), async (req, res) => {
    const { roomName, participantIdentity, participantName } = req.body;

    if (!roomName || !participantIdentity) {
      return res.status(400).json({ error: "roomName and participantIdentity are required" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: "LiveKit server credentials are not configured on this server." });
    }

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: participantIdentity,
        name: participantName || participantIdentity,
      });

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });

      const token = await at.toJwt();
      res.json({ token });
    } catch (err) {
      console.error("Error generating LiveKit token", err);
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const resList = await supabaseAdmin.auth.admin.listUsers();
      if (resList.error) throw resList.error;
      const users: any[] = resList.data.users;

      const { data: profiles, error: profilesError } = await supabaseAdmin.from("profiles").select("*");
      if (profilesError) throw profilesError;

      const combined = (profiles || []).map((p: any) => {
        const authUser = users.find((u) => u.id === p.id);
        return { ...p, is_banned: authUser ? !!authUser.banned_until : false };
      });

      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/ban", express.json(), async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { userIds, ban } = req.body;
      if (!Array.isArray(userIds)) {
        return res.status(400).json({ error: "userIds must be an array" });
      }

      for (const targetId of userIds) {
        await supabaseAdmin.auth.admin.updateUserById(targetId, {
          ban_duration: ban ? "876000h" : "none",
        });
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/dashboard", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const { count: msgCount } = await supabaseAdmin
        .from("messages")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayIso);

      const { count: accountsCount } = await supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayIso);

      const { count: serversCount } = await supabaseAdmin
        .from("servers")
        .select("*", { count: "exact", head: true });

      res.json({
        messagesToday: msgCount || 0,
        accountsToday: accountsCount || 0,
        totalServers: serversCount || 0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/dashboard/chart", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const days = 14;
      const chartData = [];

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);

        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);

        const { count: msgs } = await supabaseAdmin
          .from("messages")
          .select("*", { count: "exact", head: true })
          .gte("created_at", d.toISOString())
          .lt("created_at", nextDay.toISOString());

        const { count: users } = await supabaseAdmin
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_at", d.toISOString())
          .lt("created_at", nextDay.toISOString());

        chartData.push({
          date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          messages: msgs || 0,
          users: users || 0,
        });
      }

      res.json(chartData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/storage", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      let totalSize = 0;
      let totalFiles = 0;
      const buckets = ["avatars", "chat-attachments", "server-icons"];
      const stats: Record<string, { size: number; count: number }> = {};

      for (const bucket of buckets) {
        const { data, error } = await supabaseAdmin.storage.from(bucket).list("", {
          limit: 1000,
          offset: 0,
          sortBy: { column: "name", order: "asc" },
        });

        if (error) {
          stats[bucket] = { size: 0, count: 0 };
          continue;
        }

        let bucketSize = 0;
        let bucketFiles = 0;

        for (const file of data || []) {
          if ((file as any).id) {
            bucketSize += (file as any).metadata?.size || 0;
            bucketFiles += 1;
          }
        }

        stats[bucket] = { size: bucketSize, count: bucketFiles };
        totalSize += bucketSize;
        totalFiles += bucketFiles;
      }

      res.json({ totalSize, totalFiles, buckets: stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reports", express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing auth header" });

      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error: authError,
      } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) return res.status(401).json({ error: "Invalid token" });

      const { messageId, serverId, reason, content, authorName } = req.body;
      if (!messageId || !reason) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const { data: existingReport } = await supabaseAdmin
        .from("server_logs")
        .select("id")
        .eq("action", "USER_REPORT")
        .eq("user_id", user.id)
        .ilike("details", `%${messageId}%`)
        .maybeSingle();

      if (existingReport) {
        return res.status(400).json({ error: "Vous avez déjà signalé ce message." });
      }

      const { error } = await supabaseAdmin.from("server_logs").insert({
        action: "USER_REPORT",
        server_id: serverId || null,
        user_id: user.id,
        details: JSON.stringify({ messageId, reason, content, authorName, status: "pending" }),
      });

      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/reports", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { data, error } = await supabaseAdmin
        .from("server_logs")
        .select("*")
        .eq("action", "USER_REPORT")
        .order("created_at", { ascending: false });

      if (error) throw error;

      let logs = data || [];
      if (logs.length > 0) {
        const userIds = Array.from(new Set(logs.map((l: any) => l.user_id).filter(Boolean)));
        if (userIds.length > 0) {
          const { data: pData } = await supabaseAdmin.from("profiles").select("id, username").in("id", userIds);
          const profilesMap = Object.fromEntries((pData || []).map((p: any) => [p.id, p]));
          logs = logs.map((l: any) => ({ ...l, profile: profilesMap[l.user_id] || null }));
        }
      }

      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/reports/:id", express.json(), async (req, res) => {
    try {
      const admin = await requireSuperAdmin(req, res);
      if (!admin) return;

      const { status } = req.body;

      const { data: report, error: fetchErr } = await supabaseAdmin
        .from("server_logs")
        .select("details, user_id")
        .eq("id", req.params.id)
        .single();

      if (fetchErr) throw fetchErr;

      let details: any = null;
      try {
        details = JSON.parse(report.details || "null");
      } catch {
        details = null;
      }

      if (details) details.status = status;

      const { error } = await supabaseAdmin
        .from("server_logs")
        .update({ details: JSON.stringify(details) })
        .eq("id", req.params.id);

      if (error) throw error;

      if (report.user_id) {
        const statusText = status === "resolved" ? "été traité" : "été classé sans suite";
        await supabaseAdmin.from("notifications").insert({
          user_id: report.user_id,
          type: "REPORT_UPDATE",
          data: { reportId: req.params.id, status },
          message: `Votre signalement a ${statusText}.`,
        });

        await sendPushToUser(report.user_id, {
          title: "Mise à jour de signalement",
          body: `Votre signalement a ${statusText}.`,
          url: "/channels/@me",
          icon: PUSH_ICON_URL,
        });
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/announce", express.json(), async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Message is required" });

      const { data: channels } = await supabaseAdmin
        .from("channels")
        .select("id, server_id")
        .eq("type", "TEXT")
        .order("created_at", { ascending: true });

      if (!channels) return res.json({ ok: false });

      const firstChannelPerServer = new Map<string, string>();
      for (const ch of channels) {
        if (!firstChannelPerServer.has((ch as any).server_id)) {
          firstChannelPerServer.set((ch as any).server_id, (ch as any).id);
        }
      }

      const systemMessage = `SYSTEM ANNOUNCEMENT: ${message}`;
      const messagesToInsert = Array.from(firstChannelPerServer.values()).map((chId) => ({
        channel_id: chId,
        user_id: user.id,
        content: systemMessage,
      }));

      const { error: insertError } = await supabaseAdmin.from("messages").insert(messagesToInsert);
      if (insertError) throw insertError;

      res.json({ ok: true, serversReached: messagesToInsert.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/user/:targetId", express.json(), async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { username, resetAvatar } = req.body;
      const updates: any = {};
      if (username) updates.username = username;
      if (resetAvatar) updates.avatar_url = null;

      const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", req.params.targetId);
      if (error) throw error;

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/server/:targetId", express.json(), async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { name, ownerId } = req.body;
      const updates: any = {};
      if (name) updates.name = name;
      if (ownerId) updates.owner_id = ownerId;

      const { error } = await supabaseAdmin.from("servers").update(updates).eq("id", req.params.targetId);
      if (error) throw error;

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/audit", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { data: latestUsers } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: latestServers } = await supabaseAdmin
        .from("servers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      const logs = [
        ...(latestUsers || []).map((u: any) => ({
          type: "user_joined",
          title: `Nouvel utilisateur ${u.username}`,
          date: u.created_at,
          details: u.id,
        })),
        ...(latestServers || []).map((s: any) => ({
          type: "server_created",
          title: `Nouveau serveur ${s.name}`,
          date: s.created_at,
          details: s.id,
        })),
      ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 40);

      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/messages/search", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const q = req.query.q;
      if (!q || typeof q !== "string") return res.json([]);

      const { data, error } = await supabaseAdmin
        .from("messages")
        .select("*")
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      let messages = data || [];
      if (messages.length > 0) {
        const authorIds = Array.from(new Set(messages.map((m: any) => m.author_id).filter(Boolean)));
        const channelIds = Array.from(new Set(messages.map((m: any) => m.channel_id).filter(Boolean)));

        const [profilesRes, channelsRes] = await Promise.all([
          supabaseAdmin.from("profiles").select("id, username").in("id", authorIds),
          supabaseAdmin.from("channels").select("id, name, server_id").in("id", channelIds),
        ]);

        const profilesMap = Object.fromEntries((profilesRes.data || []).map((p: any) => [p.id, p]));
        const channelsMap = Object.fromEntries((channelsRes.data || []).map((c: any) => [c.id, c]));

        const serverIds = Array.from(new Set((channelsRes.data || []).map((c: any) => c.server_id).filter(Boolean)));
        const { data: serversData } = await supabaseAdmin.from("servers").select("id, name").in("id", serverIds);
        const serversMap = Object.fromEntries((serversData || []).map((s: any) => [s.id, s]));

        messages = messages.map((m: any) => {
          const chan = channelsMap[m.channel_id];
          const serv = chan ? serversMap[chan.server_id] : null;
          return {
            ...m,
            profile: profilesMap[m.author_id] || null,
            channel: chan ? { ...chan, server: serv || null } : null,
          };
        });
      }

      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/messages/:id", async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { error } = await supabaseAdmin.from("messages").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/subscribe", express.json(), async (req, res) => {
    const { subscription, userId } = req.body;
    if (!subscription || !userId) {
      return res.status(400).json({ error: "subscription and userId are required" });
    }

    try {
      const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .upsert({ user_id: userId, subscription }, { onConflict: "user_id" });

      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true, pushEnabled });
    } catch {
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  app.delete("/api/push/unsubscribe", express.json(), async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId);
    res.json({ ok: true });
  });

  const onlineUsers = new Map<string, Set<string>>();
  const voiceRooms = new Map<string, Map<string, any>>();
  const socketVoiceMap = new Map<string, { userId: string; channelId: string }>();

  io.on("connection", (socket) => {
    console.log("User connected", socket.id);
    let currentUserId: string | null = null;

    socket.on("identify", (userId) => {
      if (!userId) return;
      currentUserId = userId;
      if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
      onlineUsers.get(userId)?.add(socket.id);

      const onlineList = Array.from(onlineUsers.keys());
      io.emit("online-users", onlineList);

      voiceRooms.forEach((participantsMap, channelId) => {
        socket.emit("voice-participants-update", {
          channelId,
          participants: Array.from(participantsMap.values()),
        });
      });
    });

    const cleanupVoiceRoom = async (channelId: string) => {
      const room = voiceRooms.get(channelId);
      if (!room || room.size === 0) {
        try {
          await supabaseAdmin.from("calls").delete().eq("id", channelId);
        } catch (err) {
          console.error("Error cleaning up call", err);
        }
        voiceRooms.delete(channelId);
      }
    };

    socket.on("join-voice-channel", (data) => {
      const { channelId, user } = data;

      const existingVoice = socketVoiceMap.get(socket.id);
      if (existingVoice && existingVoice.channelId !== channelId) {
        const oldChannelId = existingVoice.channelId;
        voiceRooms.get(oldChannelId)?.delete(existingVoice.userId);
        io.emit("voice-participants-update", {
          channelId: oldChannelId,
          participants: Array.from(voiceRooms.get(oldChannelId)?.values() || []),
        });
        cleanupVoiceRoom(oldChannelId);
      }

      if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Map());
      voiceRooms.get(channelId)?.set(user.id, user);
      socketVoiceMap.set(socket.id, { userId: user.id, channelId });

      io.emit("voice-participants-update", {
        channelId,
        participants: Array.from(voiceRooms.get(channelId)?.values() || []),
      });
    });

    socket.on("leave-voice-channel", async (data) => {
      const { channelId, userId } = data;
      voiceRooms.get(channelId)?.delete(userId);

      const existingVoice = socketVoiceMap.get(socket.id);
      if (existingVoice && existingVoice.channelId === channelId) {
        socketVoiceMap.delete(socket.id);
      }

      io.emit("voice-participants-update", {
        channelId,
        participants: Array.from(voiceRooms.get(channelId)?.values() || []),
      });
      await cleanupVoiceRoom(channelId);
    });

    socket.on("voice-state-update", (data) => {
      const { channelId, userId, updates } = data;
      const room = voiceRooms.get(channelId);
      if (room && room.has(userId)) {
        const user = room.get(userId);
        room.set(userId, { ...user, ...updates });
        io.emit("voice-participants-update", {
          channelId,
          participants: Array.from(room.values()),
        });
      }
    });

    socket.on("request-voice-states", () => {
      voiceRooms.forEach((participantsMap, channelId) => {
        socket.emit("voice-participants-update", {
          channelId,
          participants: Array.from(participantsMap.values()),
        });
      });
    });

    socket.on("join-channel", async (channelId) => {
      if (!currentUserId) return;

      if (typeof channelId === "string" && channelId.length === 36) {
        const { data: dm } = await supabaseAdmin.from("dms").select("participants").eq("id", channelId).maybeSingle();
        if (dm?.participants && !dm.participants.includes(currentUserId)) {
          return;
        }
      }

      socket.join(channelId);
    });

    socket.on("leave-channel", (channelId) => {
      socket.leave(channelId);
    });

    socket.on("signal", (data) => {
      io.to(data.channelId).emit("signal", data);
    });

    socket.on("typing", (data) => {
      socket.to(data.channelId).emit("typing", data);
    });

    socket.on("new-message", (message) => {
      io.to(message.channel_id).emit("message", message);
    });

    socket.on("new-dm-message", async (message) => {
      if (!currentUserId) return;

      const { data: dm } = await supabaseAdmin.from("dms").select("participants").eq("id", message.dm_id).maybeSingle();
      if (!dm?.participants?.includes(currentUserId)) return;

      io.to(message.dm_id).emit("dm-message", message);

      try {
        const recipients = dm.participants.filter((id: string) => id !== message.author_id);
        for (const recipientId of recipients) {
          const { data: subData } = await supabaseAdmin
            .from("push_subscriptions")
            .select("subscription")
            .eq("user_id", recipientId)
            .maybeSingle();

          if (!subData?.subscription || !pushEnabled) continue;

          const authorName = message.author_name || "Quelqu'un";
          const body = message.content ? message.content.slice(0, 100) : "Fichier joint";

          try {
            await webpush.sendNotification(
              subData.subscription,
              JSON.stringify({
                title: authorName,
                body,
                icon: PUSH_ICON_URL,
                url: `${DM_PUSH_BASE_PATH}${message.dm_id}`,
              })
            );
          } catch (pushErr: any) {
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", recipientId);
            }
          }
        }
      } catch (err) {
        console.error("Push error", err);
      }
    });

    socket.on("update-message", (message) => {
      const target = message.channel_id || message.dm_id;
      const event = message.dm_id ? "dm-message-updated" : "message-updated";
      io.to(target).emit(event, message);
    });

    socket.on("delete-message", (data) => {
      const target = data.channelId || data.dmId;
      const event = data.isDM ? "dm-message-deleted" : "message-deleted";
      io.to(target).emit(event, data.id);
    });

    socket.on("message-reaction", (data) => {
      const target = data.channelId || data.dmId;
      const event = data.isDM ? "dm-message-updated" : "message-updated";
      io.to(target).emit(event, {
        id: data.messageId,
        reactions: data.reactions,
        channel_id: data.channelId,
        dm_id: data.dmId,
      });
    });

    socket.on("dm-read", (data) => {
      socket.to(data.dmId).emit("dm-read", data);
    });

    socket.on("start-call", (data) => {
      data.participants.forEach((userId: string) => {
        if (userId !== data.callerId) {
          const sockets = onlineUsers.get(userId);
          sockets?.forEach((socketId) => io.to(socketId).emit("incoming-call", data));
        }
      });
    });

    socket.on("decline-call", (data) => {
      data.participants.forEach((userId: string) => {
        if (userId !== data.userId) {
          const sockets = onlineUsers.get(userId);
          sockets?.forEach((socketId) => io.to(socketId).emit("call-declined", data));
        }
      });
    });

    socket.on("accept-call", (data) => {
      data.participants.forEach((userId: string) => {
        if (userId !== data.userId) {
          const sockets = onlineUsers.get(userId);
          sockets?.forEach((socketId) => io.to(socketId).emit("call-accepted", data));
        }
      });
    });

    socket.on("move-user", (data) => {
      const sockets = onlineUsers.get(data.userId);
      sockets?.forEach((socketId) => io.to(socketId).emit("force-move", data.channelId));
    });

    socket.on("force-mute", (data) => {
      const sockets = onlineUsers.get(data.userId);
      sockets?.forEach((socketId) => io.to(socketId).emit("force-mute", data.mute));
    });

    socket.on("server-kick", (data) => {
      const sockets = onlineUsers.get(data.userId);
      sockets?.forEach((socketId) => io.to(socketId).emit("server-kick", data.serverId));
    });

    socket.on("play-soundboard-sound", (data) => {
      io.to(data.channelId).emit("soundboard-sound-played", data);
    });

    socket.on("disconnect", async () => {
      const voiceInfo = socketVoiceMap.get(socket.id);
      if (voiceInfo) {
        const { channelId, userId } = voiceInfo;
        socketVoiceMap.delete(socket.id);

        let userHasAnotherSocket = false;
        socketVoiceMap.forEach((info) => {
          if (info.userId === userId && info.channelId === channelId) {
            userHasAnotherSocket = true;
          }
        });

        if (!userHasAnotherSocket) {
          voiceRooms.get(channelId)?.delete(userId);
          io.emit("voice-participants-update", {
            channelId,
            participants: Array.from(voiceRooms.get(channelId)?.values() || []),
          });
          await cleanupVoiceRoom(channelId);
        }
      }

      if (currentUserId && onlineUsers.has(currentUserId)) {
        const sockets = onlineUsers.get(currentUserId);
        sockets?.delete(socket.id);
        if (sockets?.size === 0) {
          onlineUsers.delete(currentUserId);
        }
        io.emit("online-users", Array.from(onlineUsers.keys()));
      }

      console.log("Socket disconnected", socket.id);
    });
  });

  if (!IS_PRODUCTION) {
    console.log("Starting in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");

    app.use((req, res, next) => {
      const url = req.path;
      if (url === "/sw.js" || url.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
      } else if (url.endsWith(".webmanifest") || url.endsWith("manifest.json")) {
        res.setHeader("Content-Type", "application/manifest+json");
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      } else if (url.startsWith("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      }
      next();
    });

    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/socket.io") ||
        req.path.startsWith("/livekit")
      ) {
        return res.status(404).json({ error: "API route not found" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running in ${IS_PRODUCTION ? "production" : "development"} mode on http://0.0.0.0:${PORT}`);
  });
}

startServer();
