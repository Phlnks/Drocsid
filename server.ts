import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import WebSocket from "ws";

// Polyfill global WebSocket for Node.js environment
globalThis.WebSocket = WebSocket as any;
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";
import cors from "cors";

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

const PUSH_ICON_URL = process.env.PUSH_ICON_URL || (APP_URL ? `${APP_URL.replace(/\/+$/, "")}/logo-192.png` : "/logo-192.png");

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    timeout: 60000, // 60 secondes pour éviter les TIMED_OUT sur serveurs lents/self-hosted
  } as any
});

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY is perfectly missing in environment variables. Backend will use the anon key which might fail RLS policies for sending push notifications.");
}

async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string; icon?: string }
) {
  try {
    // Expo Push
    const { data: expoData, error: expoError } = await supabaseAdmin
      .from("expo_push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (!expoError && expoData?.length) {
      const messages = expoData.map((row: any) => ({
        to: row.token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        priority: 'high',
        channelId: 'default',
        data: { url: payload.url }
      }));
      
      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });
        const resJson = await expoRes.json();
        console.log("[Expo push] Response for user", userId, ":", JSON.stringify(resJson, null, 2));
      } catch (expoErr) {
        console.error("[Expo push] fetch Error:", expoErr);
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

function setupRealtimePushNotifications() {
  let pushChannel = supabaseAdmin.channel('backend-push-notifications');

  function subscribeChannel() {
    pushChannel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        async (payload) => {
           const newNotif = payload.new;
           console.log("[push realtime] notification intercepted", newNotif.id);
           if (!newNotif || !newNotif.user_id) return;
           
           const payloadData = (typeof newNotif.data === 'string' ? JSON.parse(newNotif.data) : newNotif.data) || {};

           try {
              let authorName = payloadData.author_name || 'Quelqu\'un';
              if (payloadData.author_id) {
                 const { data: profile } = await supabaseAdmin.from('profiles').select('username, display_name').eq('id', payloadData.author_id).maybeSingle();
                 if (profile) {
                    authorName = profile.display_name || profile.username || authorName;
                 }
              }

              let title = "Nouvelle notification";
              let body = "Vous avez une nouvelle notification.";
              let url = "/";
              
              if (newNotif.type === 'dm') {
                  title = `Message de ${authorName}`;
                  body = payloadData.content || "Vous avez reçu un message direct.";
                  url = `/channels/@me/${payloadData.dm_id || payloadData.channel_id}`;
              } else if (newNotif.type === 'mention') {
                  title = `Mention de ${authorName}`;
                  body = payloadData.content || "Vous avez été mentionné.";
                  url = `/channels/${payloadData.server_id}/${payloadData.channel_id}`;
              } else if (newNotif.type === 'reply') {
                  title = `Réponse de ${authorName}`;
                  body = payloadData.content || "Quelqu'un a répondu à votre message.";
                  url = payloadData.is_dm 
                     ? `/channels/@me/${payloadData.channel_id}`
                     : `/channels/${payloadData.server_id}/${payloadData.channel_id}`;
              } else if (newNotif.type === 'friend_request') {
                  title = `Demande d'ami`;
                  body = `${authorName} vous a envoyé une demande d'ami.`;
                  url = `/channels/@me`;
              } else if (newNotif.type === 'friend_accept') {
                  title = `Demande d'ami acceptée`;
                  body = `${authorName} a accepté votre demande d'ami.`;
                  url = `/channels/@me`;
              } else if (newNotif.type === 'reaction') {
                  title = `Réaction de ${authorName}`;
                  body = `A réagi ${payloadData.content} à votre message.`;
                  url = payloadData.is_dm ? `/channels/@me/${payloadData.channel_id}` : `/channels/${payloadData.server_id}/${payloadData.channel_id}`;
              } else if (newNotif.type === 'REPORT_UPDATE') {
                  title = `Mise à jour de signalement`;
                  body = newNotif.message || `Votre signalement a été mis à jour.`;
                  url = `/channels/@me`;
              }
              
              await sendPushToUser(newNotif.user_id, {
                  title,
                  body,
                  url,
                  icon: PUSH_ICON_URL
              });
              
              await supabaseAdmin.from('notifications').update({ notified: true }).eq('id', newNotif.id);
           } catch (err) {
             console.error("Error processing notifications realtime event:", err);
           }
        }
      )
      .subscribe((status, err) => {
         console.log('[push] backend realtime notifications listener status:', status);
         if (err) {
           console.error('[push] backend realtime notifications listener error:', err);
         }
         if (status === 'SUBSCRIBED') {
            console.log('[push] backend realtime notifications listener successfully subscribed.');
         }
      });
  }

  subscribeChannel();
}

async function startServer() {
  setupRealtimePushNotifications();
  const CORS_ORIGINS = [
    APP_URL,
    ...(NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:5173"] : []),
    ...CORS_EXTRA_ORIGINS,
  ].filter(Boolean);

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 60000,
    pingTimeout: 120000,
  });

  app.use(express.json({ limit: "10mb" }));

  app.use(cors({
    origin: function(origin, callback) {
      return callback(null, true);
    },
    credentials: true,
  }));

  app.use((req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: data: https:; connect-src 'self' wss: https:; frame-ancestors 'none';"
    );
    next();
  });

  app.use((req, res, next) => {
    next();
  });

  app.get("/api/download", async (req, res) => {
    const { url, name } = req.query;
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return res.status(400).send("Invalid URL");
    }
    const fileName = typeof name === "string" ? name : url.split("/").pop()?.split("?")[0] || "download";

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).send(`Failed to fetch file: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", contentType);

      const safeFileName = fileName.replace(/"/g, '\\"');
      const encodedFileName = encodeURIComponent(fileName);
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.send(buffer);
    } catch (err: any) {
      console.error("[Download API Proxy] Error downloading file:", err);
      return res.status(500).send(`Download failed: ${err.message}`);
    }
  });

  app.post("/api/livekit/token", express.json({ limit: "50mb" }), async (req, res) => {
    const { roomName, participantIdentity, participantName, userProfile } = req.body;

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
        metadata: userProfile ? JSON.stringify(userProfile) : undefined,
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
        const provider = authUser?.app_metadata?.provider || authUser?.identities?.[0]?.provider || 'email';
        return { 
          ...p, 
          is_banned: authUser ? !!authUser.banned_until : false,
          provider,
          is_local_user: provider === 'email' || (authUser?.email && authUser.email.endsWith('@drocsid.local'))
        };
      });

      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/reset-password", express.json(), async (req, res) => {
    try {
      const user = await requireSuperAdmin(req, res);
      if (!user) return;

      const { userId, newPassword } = req.body;
      if (!userId || !newPassword) {
        return res.status(400).json({ error: "userId and newPassword are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (error) throw error;

      res.json({ ok: true });
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
          logs = logs.map((l: any) => ({ ...l, profiles: profilesMap[l.user_id] || null }));
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
        author_id: user.id,
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

  app.put("/api/server/update-member-username", express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing auth header" });
      const token = authHeader.replace("Bearer ", "");
      const { data: { user: currentUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !currentUser) return res.status(401).json({ error: "Invalid token" });

      const { serverId, targetUserId, newUsername } = req.body;
      if (!serverId || !targetUserId || !newUsername) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const [rolesRes, membersRes, serverRes] = await Promise.all([
        supabaseAdmin.from('roles').select('*').eq('server_id', serverId),
        supabaseAdmin.from('server_members').select('*').eq('server_id', serverId).in('user_id', [currentUser.id, targetUserId]),
        supabaseAdmin.from('servers').select('owner_id').eq('id', serverId).single()
      ]);

      const roles = rolesRes.data || [];
      const members = membersRes.data || [];
      const server = serverRes.data;

      const currentMember = members.find(m => m.user_id === currentUser.id);
      const targetMember = members.find(m => m.user_id === targetUserId);

      if (!currentMember || !targetMember || !server) {
        return res.status(403).json({ error: "Access denied" });
      }

      const isOwner = server.owner_id === currentUser.id;
      const targetIsOwner = server.owner_id === targetUserId;

      if (targetIsOwner) return res.status(403).json({ error: "Cannot modify owner" });

      let currentHighestOrder = isOwner ? 0 : Infinity;
      let hasModPerm = isOwner;
      
      const currentRoles = roles.filter(r => currentMember.roles.includes(r.id));
      currentRoles.forEach(r => {
        if ((r.order || 999) < currentHighestOrder) currentHighestOrder = r.order || 999;
        if (r.permissions?.includes('ADMINISTRATOR') || r.permissions?.includes('KICK_MEMBERS') || r.permissions?.includes('BAN_MEMBERS')) {
          hasModPerm = true;
        }
      });

      if (!hasModPerm) return res.status(403).json({ error: "Insufficient permissions" });

      let targetHighestOrder = Infinity;
      const targetRoles = roles.filter(r => targetMember.roles.includes(r.id));
      targetRoles.forEach(r => {
        if ((r.order || 999) < targetHighestOrder) targetHighestOrder = r.order || 999;
      });

      if (!isOwner && currentHighestOrder >= targetHighestOrder) {
        return res.status(403).json({ error: "Target has higher or equal rank" });
      }

      // Update username
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ username: newUsername })
        .eq('id', targetUserId);

      if (updateError) throw updateError;

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

  app.post("/api/push/expo-subscribe", express.json(), async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) {
      return res.status(400).json({ error: "token and userId are required" });
    }

    try {
      const { error } = await supabaseAdmin
        .from("expo_push_tokens")
        .upsert({ user_id: userId, token }, { onConflict: "user_id, token" });

      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save expo token" });
    }
  });

  app.delete("/api/push/expo-unsubscribe", express.json(), async (req, res) => {
    const { token, userId } = req.body;
    if (!token || !userId) {
       return res.status(400).json({ error: "token and userId are required" });
    }
    await supabaseAdmin.from("expo_push_tokens").delete().eq("user_id", userId).eq("token", token);
    res.json({ ok: true });
  });

  app.get("/api/push/test", async (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "Missing userId query parameter" });
    
    try {
      const { data: expoData, error: expoError } = await supabaseAdmin
        .from("expo_push_tokens")
        .select("token")
        .eq("user_id", userId);

      if (expoError || !expoData?.length) {
        return res.json({ error: "No expo tokens found for this user", expoError });
      }

      const messages = expoData.map((row: any) => ({
        to: row.token,
        sound: 'default',
        title: "Test de push API",
        body: "Corps du test push",
        priority: 'high',
        channelId: 'default',
        data: { url: "/channels/@me" }
      }));

      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const resJson = await expoRes.json();
      return res.json({ 
        ok: true, 
        tokens_found: expoData.length, 
        expo_response: resJson 
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/push/test-all", async (req, res) => {
    try {
      const { data: expoData, error: expoError } = await supabaseAdmin
        .from("expo_push_tokens")
        .select("token, user_id");

      if (expoError || !expoData?.length) {
        return res.json({ error: "No expo tokens found in DB", expoError });
      }

      const messages = expoData.map((row: any) => ({
        to: row.token,
        sound: 'default',
        title: "Test Global Push API",
        body: "Ceci est un test envoyé à tous les terminaux enregistrés.",
        priority: 'high',
        channelId: 'default',
        data: { url: "/channels/@me" }
      }));

      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const resJson = await expoRes.json();
      return res.json({ 
        ok: true, 
        tokens_found: expoData.length, 
        expo_response: resJson,
        tokens: expoData
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  const onlineUsers = new Map<string, Set<string>>();
  const voiceRooms = new Map<string, Map<string, any>>();
  const socketVoiceMap = new Map<string, { userId: string; channelId: string }>();

  const webhookReceiver = new WebhookReceiver(
    process.env.LIVEKIT_API_KEY || "",
    process.env.LIVEKIT_API_SECRET || ""
  );

  app.post("/api/livekit/webhook", express.raw({ type: "application/webhook+json" }), async (req, res) => {
    try {
      const event = await webhookReceiver.receive(req.body.toString('utf8'), req.get('Authorization'));
      console.log(`[LiveKit Webhook] Event reçu: ${event.event}`);
      console.log(`[LiveKit Webhook] Room: ${event.room?.name}, Participant: ${event.participant?.identity}`);
      const roomName = event.room?.name || event.room?.sid;
      
      if (!roomName) return res.status(200).send();

      let updated = false;

      if (event.event === "participant_joined") {
        const identity = event.participant?.identity;
        if (!identity) return res.status(200).send();
        
        let metadataObj = {};
        try {
          if (event.participant?.metadata) {
            metadataObj = JSON.parse(event.participant.metadata);
          }
        } catch(e) {}
        
        if (!voiceRooms.has(roomName)) voiceRooms.set(roomName, new Map());
        
        const existingData = voiceRooms.get(roomName)?.get(identity) || {};
        voiceRooms.get(roomName)?.set(identity, { id: identity, ...metadataObj, ...existingData });
        updated = true;
      } else if (event.event === "participant_left") {
        const identity = event.participant?.identity;
        if (identity) {
          voiceRooms.get(roomName)?.delete(identity);
          updated = true;
        }
      } else if (event.event === "room_finished") {
        voiceRooms.delete(roomName);
        updated = true;
      }

      if (updated) {
        console.log(`[LiveKit Webhook -> Socket] Émission de la mise à jour des participants pour le salon: ${roomName} (${voiceRooms.get(roomName)?.size || 0} participants)`);
        io.emit("voice-participants-update", {
          channelId: roomName,
          participants: Array.from(voiceRooms.get(roomName)?.values() || []),
        });
        
        if (event.event === "room_finished" || (voiceRooms.has(roomName) && voiceRooms.get(roomName)?.size === 0)) {
           voiceRooms.delete(roomName);
        }
      }

      res.status(200).send();
    } catch (err: any) {
      console.error("LiveKit Webhook error:", err.message);
      res.status(400).send();
    }
  });

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
        voiceRooms.delete(channelId);
      }
    };

    socket.on("join-voice-channel", (data) => {
      const { channelId, user } = data;

      const existingVoice = socketVoiceMap.get(socket.id);
      if (existingVoice && existingVoice.channelId !== channelId) {
        // Clean up socket mapping only. LiveKit Webhook will handle actual room logic.
      }

      socketVoiceMap.set(socket.id, { userId: user.id, channelId });

      let room = voiceRooms.get(channelId);
      if (!room) {
        room = new Map();
        voiceRooms.set(channelId, room);
      }
      const existing = room.get(user.id) || {};
      room.set(user.id, { ...existing, ...user });
      
      io.emit("voice-participants-update", {
        channelId,
        participants: Array.from(room.values()),
      });
    });

    socket.on("leave-voice-channel", async (data) => {
      const { channelId, userId } = data;
      
      const existingVoice = socketVoiceMap.get(socket.id);
      if (existingVoice && existingVoice.channelId === channelId) {
        socketVoiceMap.delete(socket.id);
      }
      voiceRooms.get(channelId)?.delete(userId);
      const room = voiceRooms.get(channelId);
      if (room) {
        io.emit("voice-participants-update", {
          channelId,
          participants: Array.from(room.values()),
        });
        if (room.size === 0) await cleanupVoiceRoom(channelId);
      }
    });

    socket.on("voice-state-update", (data) => {
      const { channelId, userId, updates } = data;
      let room = voiceRooms.get(channelId);
      if (!room) {
        room = new Map();
        voiceRooms.set(channelId, room);
      }
      const user = room.get(userId) || { id: userId };
      room.set(userId, { ...user, ...updates });
      io.emit("voice-participants-update", {
        channelId,
        participants: Array.from(room.values()),
      });
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

    socket.on("move-user", (data) => {
      const sockets = onlineUsers.get(data.userId);
      sockets?.forEach((socketId) => io.to(socketId).emit("force-move", { channelId: data.channelId }));
    });

    socket.on("force-mute", (data) => {
      const sockets = onlineUsers.get(data.userId);
      sockets?.forEach((socketId) => io.to(socketId).emit("force-mute", { mute: data.mute }));
    });

    socket.on("server-kick", (data) => {
      const sockets = onlineUsers.get(data.userId);
      sockets?.forEach((socketId) => io.to(socketId).emit("server-kick", { serverId: data.serverId }));
    });

    socket.on("play-soundboard-sound", (data) => {
      io.to(data.channelId).emit("soundboard-sound-played", data);
    });

    socket.on("disconnect", async () => {
      const voiceInfo = socketVoiceMap.get(socket.id);
      if (voiceInfo) {
      socketVoiceMap.delete(socket.id);
      // LiveKit Webhook gère la présence réelle — on ne touche pas voiceRooms ici.
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
