import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingInterval: 60000, // 60 seconds
    pingTimeout: 120000  // 120 seconds
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

    socket.on("join-channel", (channelId) => {
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

    socket.on("new-dm-message", (message) => {
      // message: { id, dm_id, author_id, content, created_at, ... }
      io.to(message.dm_id).emit("dm-message", message);
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
      io.emit("soundboard-sound-played", data);
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
  
  if (!isProduction) {
    console.log("Starting in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    console.log(`Serving static files from: ${distPath}`);
    
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      // Pour les routes API, on ne renvoie pas l'index.html
      if (req.path.startsWith("/api")) {
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
