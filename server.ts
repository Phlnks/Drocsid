import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";
import webpush from 'web-push';

dotenv.config();

// Configuration VAPID pour les Web Push Notifications
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@drocsid.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Envoyer une push notification à un utilisateur
async function sendPushToUser(userId: string, payload: {
  title: string;
  body: string;
  url: string;
  icon?: string;
}) {
  if (!process.env.VAPID_PUBLIC_KEY) return; // Push non configuré

  try {
    const { data, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', userId);

    if (error || !data?.length) return;

    const payloadStr = JSON.stringify(payload);

    for (const row of data) {
      try {
        await webpush.sendNotification(row.subscription, payloadStr);
      } catch (err: any) {
        // Si la souscription est expirée (410 Gone), la supprimer
        if (err.statusCode === 410) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId);
        }
      }
    }
  } catch (err) {
    console.error('sendPushToUser error:', err);
  }
}

async function startServer() {
	const CORS_ORIGINS = [
	  'https://drocsid-fz9g.onrender.com',
	  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : [])
	];

	const app = express();
	const httpServer = createServer(app);
	const io = new Server(httpServer, {
	  cors: {
		origin: CORS_ORIGINS,
		methods: ["GET", "POST"]
	  },
	  pingInterval: 60000,
	  pingTimeout: 120000
	});

	app.use((req, res, next) => {
	  const origin = req.headers.origin || '';
	  if (CORS_ORIGINS.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
	  }
	  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
	  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	  if (req.method === 'OPTIONS') return res.sendStatus(204);
	  next();
	});

  const PORT = Number(process.env.PORT) || 3000;

  // LiveKit Token generation
  app.post('/api/livekit/token', express.json(), (req, res) => {
    const { roomName, participantIdentity, participantName } = req.body;
    
    if (!roomName || !participantIdentity) {
      return res.status(400).json({ error: 'roomName and participantIdentity are required' });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      // Return a demo token or just error (error is safer to prevent surprises)
      return res.status(500).json({ error: 'LiveKit server credentials are not configured on this server.' });
    }

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: participantIdentity,
        name: participantName || participantIdentity,
      });

      at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      const token = at.toJwt();
      
      res.json({ token });
    } catch (err) {
      console.error('Error generating LiveKit token:', err);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

    // ── Web Push : sauvegarder la souscription d'un utilisateur ──────────
    app.post('/api/push/subscribe', express.json(), async (req, res) => {
      const { subscription, userId } = req.body;
      console.log('[Push Subscribe] userId:', userId);

      if (!subscription || !userId) {
        return res.status(400).json({ error: 'subscription and userId are required' });
      }
      try {
        const { data, error } = await supabaseAdmin
          .from('push_subscriptions')
          .upsert({ user_id: userId, subscription }, { onConflict: 'user_id' });

        if (error) {
          console.error('[Push Subscribe] Supabase error:', error);
          return res.status(500).json({ error: error.message });
        }

        console.log('[Push Subscribe] ✅ Sauvegardé avec succès');
        res.json({ ok: true });
      } catch (err) {
        console.error('[Push Subscribe] Error:', err);
        res.status(500).json({ error: 'Failed to save subscription' });
      }
    });

  // ── Web Push : supprimer la souscription (déconnexion) ────────────────
  app.delete('/api/push/unsubscribe', express.json(), async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', userId);
    res.json({ ok: true });
  });

  // Track online users: userId -> Set of socketIds
  const onlineUsers = new Map<string, Set<string>>();

  // Track voice participants
  // channelId -> Map<userId, VoiceUser>
  const voiceRooms = new Map<string, Map<string, any>>();
  // socketId -> { userId, channelId }
  const socketVoiceMap = new Map<string, { userId: string, channelId: string }>();

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    let currentUserId: string | null = null;

    socket.on("identify", (userId) => {
      if (!userId) return;
      currentUserId = userId;
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId)?.add(socket.id);
      
      const onlineList = Array.from(onlineUsers.keys());
      io.emit("online-users", onlineList);
      console.log(`User ${userId} identified. Total online: ${onlineList.length}`);

      // Envoi de l'état actuel des salons vocaux pour éviter les ghost rooms
      voiceRooms.forEach((participantsMap, channelId) => {
        socket.emit("voice-participants-update", {
          channelId,
          participants: Array.from(participantsMap.values())
        });
      });
    });

    const cleanupVoiceRoom = async (channelId: string) => {
      const room = voiceRooms.get(channelId);
      if (!room || room.size === 0) {
        // Room is empty, check if it's a DM call and delete it
        try {
          const { error } = await supabaseAdmin
            .from('calls')
            .delete()
            .eq('id', channelId);
          
          if (!error) {
            console.log(`Call ${channelId} closed because it's empty.`);
          }
        } catch (err) {
          console.error("Error cleaning up call:", err);
        }
        voiceRooms.delete(channelId);
      }
    };

    socket.on("join-voice-channel", (data) => {
      const { channelId, user } = data;
      if (!voiceRooms.has(channelId)) {
        voiceRooms.set(channelId, new Map());
      }
      voiceRooms.get(channelId)?.set(user.id, user);
      socketVoiceMap.set(socket.id, { userId: user.id, channelId });

      io.emit("voice-participants-update", {
        channelId,
        participants: Array.from(voiceRooms.get(channelId)?.values() || [])
      });
    });

    socket.on("leave-voice-channel", async (data) => {
      const { channelId, userId } = data;
      voiceRooms.get(channelId)?.delete(userId);
      socketVoiceMap.delete(socket.id);

      io.emit("voice-participants-update", {
        channelId,
        participants: Array.from(voiceRooms.get(channelId)?.values() || [])
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
          participants: Array.from(room.values())
        });
      }
    });

    socket.on("request-voice-states", () => {
      voiceRooms.forEach((participantsMap, channelId) => {
        socket.emit("voice-participants-update", {
          channelId,
          participants: Array.from(participantsMap.values())
        });
      });
    });

    socket.on("join-channel", async (channelId) => {
      if (!currentUserId) {
        console.warn(`[Socket] User ${socket.id} tried to join channel ${channelId} without being identified`);
        return;
      }

      // Basic security check for DMs
      if (channelId.length === 36) { // Possible UUID (DM or Channel)
         const { data: dm } = await supabaseAdmin.from('dms').select('participants').eq('id', channelId).maybeSingle();
         if (dm && dm.participants) {
           if (!dm.participants.includes(currentUserId)) {
             console.log(`User ${currentUserId} attempted to join unauthorized DM channel ${channelId}`);
             return;
           }
         }
      }

      socket.join(channelId);
      console.log(`User ${socket.id} joined channel ${channelId}`);
    });

    socket.on("leave-channel", (channelId) => {
      socket.leave(channelId);
      console.log(`User ${socket.id} left channel ${channelId}`);
    });

    socket.on("signal", (data) => {
      // data: { to: string, from: string, signal: any, channelId: string }
      io.to(data.channelId).emit("signal", data);
    });

    socket.on("typing", (data) => {
      // data: { channelId: string, userId: string, username: string, isTyping: boolean }
      socket.to(data.channelId).emit("typing", data);
    });

    socket.on("new-message", (message) => {
      // message: { id, channel_id, server_id, author_id, content, created_at, ... }
      io.to(message.channel_id).emit("message", message);
    });

    socket.on('new-dm-message', async (message) => {
      if (!currentUserId) return;

      console.log('[DM] Reçu:', JSON.stringify(message).slice(0, 200));

      // ✅ Un seul fetch — réutilisé pour vérification ET push
      const { data: dm } = await supabaseAdmin
        .from('dms')
        .select('participants')
        .eq('id', message.dm_id)
        .maybeSingle();

      if (!dm?.participants?.includes(currentUserId)) {
        console.warn(`[Socket] Unauthorized DM message attempt from ${currentUserId} to ${message.dm_id}`);
        return;
      }

      // Broadcast aux participants (seulement ceux dans la room)
      io.to(message.dm_id).emit('dm-message', message);

      // ── PUSH NOTIFICATION ─────────────────────────────────────────────────
      try {
        const recipients = dm.participants.filter(
          (id: string) => id !== message.author_id
        );

        console.log('[Push] Recipients:', recipients);

        for (const recipientId of recipients) {
          const { data: subData } = await supabaseAdmin
            .from('push_subscriptions')
            .select('subscription')
            .eq('user_id', recipientId)
            .maybeSingle();

          if (!subData?.subscription) {
            console.log('[Push] Pas de souscription pour:', recipientId);
            continue;
          }

          const authorName = message.author_name || 'Quelqu\'un';
          const body = message.content ? message.content.slice(0, 100) : '📎 Fichier joint';

          try {
            await webpush.sendNotification(
              subData.subscription,
              JSON.stringify({
                title: `💬 ${authorName}`,
                body,
                icon: '/logo-192.png',
                url: `/?dm=${message.dm_id}`,
              })
            );
            console.log('[Push] ✅ Notification envoyée à:', recipientId);
          } catch (pushErr: any) {
            console.error('[Push] ❌ Erreur envoi:', pushErr.statusCode, pushErr.message);
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              await supabaseAdmin
                .from('push_subscriptions')
                .delete()
                .eq('user_id', recipientId);
              console.log('[Push] Souscription expirée supprimée pour:', recipientId);
            }
          }
        }
      } catch (err) {
        console.error('[Push] Erreur:', err);
      }
    });

    socket.on("update-message", (message) => {
      const target = message.channel_id || message.dm_id;
      const event = message.dm_id ? "dm-message-updated" : "message-updated";
      io.to(target).emit(event, message);
    });

    socket.on("delete-message", (data) => {
      // data: { id, channelId/dmId, isDM }
      const target = data.channelId || data.dmId;
      const event = data.isDM ? "dm-message-deleted" : "message-deleted";
      io.to(target).emit(event, data.id);
    });

    socket.on("message-reaction", (data) => {
      // data: { messageId, channelId, dmId, reactions, isDM }
      const target = data.channelId || data.dmId;
      const event = data.isDM ? "dm-message-updated" : "message-updated";
      // We can just reuse the update event or create a specific one
      // Reusing update is simpler if the client handles it
      io.to(target).emit(event, { id: data.messageId, reactions: data.reactions, channel_id: data.channelId, dm_id: data.dmId });
    });

    socket.on("dm-read", (data) => {
      // data: { dmId, userId, timestamp }
      socket.to(data.dmId).emit("dm-read", data);
    });

    socket.on("start-call", (data) => {
      // data: { callId, participants, callerId, dmId }
      data.participants.forEach((userId: string) => {
        if (userId !== data.callerId) {
          const sockets = onlineUsers.get(userId);
          sockets?.forEach(socketId => {
            io.to(socketId).emit("incoming-call", data);
          });
        }
      });
    });

    socket.on("decline-call", (data) => {
      // data: { callId, participants, userId }
      data.participants.forEach((userId: string) => {
        if (userId !== data.userId) {
          const sockets = onlineUsers.get(userId);
          sockets?.forEach(socketId => {
            io.to(socketId).emit("call-declined", data);
          });
        }
      });
    });

    socket.on("accept-call", (data) => {
      // data: { callId, participants, userId }
      data.participants.forEach((userId: string) => {
        if (userId !== data.userId) {
          const sockets = onlineUsers.get(userId);
          sockets?.forEach(socketId => {
            io.to(socketId).emit("call-accepted", data);
          });
        }
      });
    });

    socket.on("move-user", (data) => {
      // data: { userId, channelId }
      const { userId, channelId } = data;
      const sockets = onlineUsers.get(userId);
      sockets?.forEach(socketId => {
        io.to(socketId).emit("force-move", { channelId });
      });
    });

    socket.on("force-mute", (data) => {
      // data: { userId, mute }
      const { userId, mute } = data;
      const sockets = onlineUsers.get(userId);
      sockets?.forEach(socketId => {
        io.to(socketId).emit("force-mute", { mute });
      });
    });

    socket.on("server-kick", (data) => {
      // data: { userId, serverId }
      const { userId, serverId } = data;
      const sockets = onlineUsers.get(userId);
      sockets?.forEach(socketId => {
        io.to(socketId).emit("server-kick", { serverId });
      });
    });

    socket.on("play-soundboard-sound", (data) => {
      // Broadcast the soundboard sound event to all clients.
      // receiver's VoicePanel will filter by channelId.
      console.log(`Soundboard: Server received sound request from ${data.userId} for channel ${data.channelId}. Broadcasting to all.`);
      io.to(data.channelId).emit("soundboard-sound-played", data); // ← room seulement
    });

    socket.on("disconnect", async () => {
      // Voice cleanup
      const voiceInfo = socketVoiceMap.get(socket.id);
      if (voiceInfo) {
        const { channelId, userId } = voiceInfo;
        voiceRooms.get(channelId)?.delete(userId);
        socketVoiceMap.delete(socket.id);
        io.emit("voice-participants-update", {
          channelId,
          participants: Array.from(voiceRooms.get(channelId)?.values() || [])
        });
        await cleanupVoiceRoom(channelId);
      }

      if (currentUserId && onlineUsers.has(currentUserId)) {
        const sockets = onlineUsers.get(currentUserId);
        sockets?.delete(socket.id);
        if (sockets?.size === 0) {
          onlineUsers.delete(currentUserId);
          console.log(`User ${currentUserId} went offline.`);
        }
        const onlineList = Array.from(onlineUsers.keys());
        io.emit("online-users", onlineList);
      }
      console.log("Socket disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
  
  // ── Security Headers ── 
	app.use((req, res, next) => {
	  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	  res.setHeader('X-Frame-Options', 'DENY');
	  res.setHeader('X-Content-Type-Options', 'nosniff');
	  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
	  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
	  res.setHeader('Content-Security-Policy',
	  "default-src 'self'; " +
	  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://fonts.googleapis.com; " +
	  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; " +
	  "font-src 'self' https://fonts.gstatic.com; " +
	  "img-src 'self' data: blob: https:; " +
	  "media-src 'self' blob: data:; " +
	  "connect-src 'self' wss: https:; " +
	  "frame-ancestors 'none';"
	);
	  next();
	});

	// ── Host Header Injection ──
	const ALLOWED_HOSTS = [
	  'drocsid-fz9g.onrender.com',
	  'drocsid.com',
	  'www.drocsid.com',
	  'localhost:3000',
	  /\.onrender\.com$/
	];

	app.use((req, res, next) => {
	  const host = req.headers.host || '';
	  const isAllowed = ALLOWED_HOSTS.some(h =>
		typeof h === 'string' ? host === h : (h as RegExp).test(host)
	  );
	  if (!isAllowed) return res.status(400).json({ error: 'Invalid host' });
	  next();
	});
  
  
  if (!isProduction) {
    console.log("Starting in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });   

	app.use((req, res, next) => {
	  const host = req.headers.host || '';
	  const isAllowed = ALLOWED_HOSTS.some(h =>
		typeof h === 'string' ? host === h : h.test(host)
	  );
	  if (!isAllowed) return res.status(400).json({ error: 'Invalid host' });
	  next();
	});


    app.use(vite.middlewares);
    } else {
    console.log("Starting in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    console.log(`Serving static files from: ${distPath}`);

    // ── Headers PWA ──────────────────────────────────────────────────────
    app.use((req, res, next) => {
      const url = req.path;

      if (url === '/sw.js' || url.endsWith('/sw.js')) {
        // Service Worker : jamais mis en cache, sinon les mises à jour ne passent pas
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

      } else if (url.endsWith('.webmanifest') || url.endsWith('manifest.json')) {
        // Manifest : Content-Type obligatoire pour que Chrome/Safari le reconnaisse
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

      } else if (url.startsWith('/assets/')) {
        // Assets Vite (noms hachés) : cache navigateur 1 an
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      } else {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }

      next();
    });
    // ────────────────────────────────────────────────────────────────────

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
    console.log(`Server running in ${isProduction ? 'production' : 'development'} mode on http://0.0.0.0:${PORT}`);
  });
}

startServer();
