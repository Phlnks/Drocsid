import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // In-memory state
  const channels = [
    { id: "general", name: "general", type: "text" },
    { id: "lounge", name: "Lounge", type: "voice" },
    { id: "gaming", name: "Gaming", type: "voice" },
    { id: "dev", name: "Development", type: "text" },
  ];

  const messages: Record<string, any[]> = {
    general: [],
    dev: [],
  };

  const voiceUsers: Record<string, Set<string>> = {
    lounge: new Set(),
    gaming: new Set(),
  };

  const roles = [
    { id: "admin", name: "Administrator", color: "#f1c40f", permissions: ["ADMINISTRATOR"] },
    { id: "mod", name: "Moderator", color: "#2ecc71", permissions: ["MANAGE_CHANNELS", "SEND_MESSAGES", "CONNECT_VOICE"] },
    { id: "member", name: "Member", color: "#95a5a6", permissions: ["SEND_MESSAGES", "CONNECT_VOICE"] },
  ];

  const userPresence: Record<string, string> = {}; // userId -> status
  const screenSharers: Record<string, string> = {}; // userId -> channelId
  const voiceStates: Record<string, { speaking: boolean, muted: boolean, deafened: boolean }> = {};
  const userRoles: Record<string, string[]> = {}; // userId -> roleIds
  const usernames: Record<string, string> = {}; // userId -> username

  const getVoiceUsersMap = () => {
    const map: Record<string, string[]> = {};
    Object.keys(voiceUsers).forEach(id => {
      map[id] = Array.from(voiceUsers[id]);
    });
    return map;
  };

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    userPresence[socket.id] = 'online';
    voiceStates[socket.id] = { speaking: false, muted: false, deafened: false };
    userRoles[socket.id] = ['member'];
    io.emit("presence-update", userPresence);

    socket.emit("init", { 
      channels, 
      messages, 
      roles, 
      userPresence, 
      screenSharers, 
      voiceStates, 
      userRoles, 
      usernames,
      voiceUsers: getVoiceUsersMap()
    });

    socket.on("join-channel", (channelId) => {
      socket.join(channelId);
      console.log(`User ${socket.id} joined ${channelId}`);
    });

    socket.on("leave-channel", (channelId) => {
      socket.leave(channelId);
      console.log(`User ${socket.id} left ${channelId}`);
    });

    socket.on("send-message", ({ channelId, text, user, gifUrl }) => {
      const message = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        user,
        userId: socket.id,
        timestamp: new Date().toISOString(),
        reactions: {},
        gifUrl,
      };
      if (!messages[channelId]) messages[channelId] = [];
      messages[channelId].push(message);
      io.to(channelId).emit("new-message", { channelId, message });
    });

    socket.on("add-reaction", ({ channelId, messageId, emoji, userId }) => {
      const channelMessages = messages[channelId];
      if (channelMessages) {
        const message = channelMessages.find((m) => m.id === messageId);
        if (message) {
          if (!message.reactions) message.reactions = {};
          if (!message.reactions[emoji]) message.reactions[emoji] = [];
          if (!message.reactions[emoji].includes(userId)) {
            message.reactions[emoji].push(userId);
            io.to(channelId).emit("reaction-updated", { channelId, messageId, reactions: message.reactions });
          }
        }
      }
    });

    socket.on("remove-reaction", ({ channelId, messageId, emoji, userId }) => {
      const channelMessages = messages[channelId];
      if (channelMessages) {
        const message = channelMessages.find((m) => m.id === messageId);
        if (message && message.reactions && message.reactions[emoji]) {
          message.reactions[emoji] = message.reactions[emoji].filter((id) => id !== userId);
          if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
          }
          io.to(channelId).emit("reaction-updated", { channelId, messageId, reactions: message.reactions });
        }
      }
    });

    // Voice handling
    socket.on("join-voice", (channelId) => {
      if (voiceUsers[channelId]) {
        voiceUsers[channelId].add(socket.id);
        socket.join(`voice-${channelId}`);
        io.emit("voice-users-update", getVoiceUsersMap());
        socket.to(`voice-${channelId}`).emit("user-joined-voice", { userId: socket.id });
      }
    });

    socket.on("leave-voice", (channelId) => {
      if (voiceUsers[channelId]) {
        voiceUsers[channelId].delete(socket.id);
        socket.leave(`voice-${channelId}`);
        io.emit("voice-users-update", getVoiceUsersMap());
        socket.to(`voice-${channelId}`).emit("user-left-voice", { userId: socket.id });
      }
    });

    socket.on("webrtc-offer", ({ targetUserId, offer }) => {
      io.to(targetUserId).emit("webrtc-offer", { sourceUserId: socket.id, offer });
    });

    socket.on("webrtc-answer", ({ targetUserId, answer }) => {
      io.to(targetUserId).emit("webrtc-answer", { sourceUserId: socket.id, answer });
    });

    socket.on("webrtc-ice-candidate", ({ targetUserId, candidate }) => {
      io.to(targetUserId).emit("webrtc-ice-candidate", { sourceUserId: socket.id, candidate });
    });

    socket.on("screen-share-start", (channelId) => {
      screenSharers[socket.id] = channelId;
      io.to(`voice-${channelId}`).emit("screen-share-started", { userId: socket.id, channelId });
    });

    socket.on("screen-share-stop", (channelId) => {
      delete screenSharers[socket.id];
      io.to(`voice-${channelId}`).emit("screen-share-stopped", { userId: socket.id, channelId });
    });

    socket.on("screen-data", ({ channelId, data }) => {
      socket.to(`voice-${channelId}`).emit("screen-stream", { userId: socket.id, data });
    });

    socket.on("typing", ({ channelId, user, isTyping }) => {
      socket.to(channelId).emit("user-typing", { channelId, user, isTyping });
    });

    socket.on("update-roles", (newRoles) => {
      roles.length = 0;
      roles.push(...newRoles);
      io.emit("roles-updated", roles);
    });

    socket.on("create-channel", (channel) => {
      const newChannel = { ...channel, id: Math.random().toString(36).substr(2, 9) };
      channels.push(newChannel);
      if (newChannel.type === 'voice') {
        voiceUsers[newChannel.id] = new Set();
      } else {
        messages[newChannel.id] = [];
      }
      io.emit("channels-updated", channels);
    });

    socket.on("update-channel", (updatedChannel) => {
      const index = channels.findIndex(c => c.id === updatedChannel.id);
      if (index !== -1) {
        channels[index] = { ...channels[index], ...updatedChannel };
        io.emit("channels-updated", channels);
      }
    });

    socket.on("delete-channel", (channelId) => {
      const index = channels.findIndex(c => c.id === channelId);
      if (index !== -1) {
        channels.splice(index, 1);
        delete messages[channelId];
        delete voiceUsers[channelId];
        io.emit("channels-updated", channels);
      }
    });

    socket.on("update-presence", (status) => {
      userPresence[socket.id] = status;
      io.emit("presence-update", userPresence);
    });

    socket.on("set-username", (name) => {
      usernames[socket.id] = name;
      io.emit("usernames-update", usernames);
    });

    socket.on("assign-role", ({ userId, roleIds }) => {
      userRoles[userId] = roleIds;
      io.emit("user-roles-update", userRoles);
    });

    socket.on("update-voice-state", (state) => {
      voiceStates[socket.id] = { ...voiceStates[socket.id], ...state };
      io.emit("voice-state-update", { userId: socket.id, state: voiceStates[socket.id] });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      delete userPresence[socket.id];
      delete voiceStates[socket.id];
      delete userRoles[socket.id];
      delete usernames[socket.id];
      if (screenSharers[socket.id]) {
        const channelId = screenSharers[socket.id];
        delete screenSharers[socket.id];
        io.to(`voice-${channelId}`).emit("screen-share-stopped", { userId: socket.id, channelId });
      }
      io.emit("presence-update", userPresence);
      // Clean up voice users
      let changed = false;
      Object.keys(voiceUsers).forEach((channelId) => {
        if (voiceUsers[channelId].has(socket.id)) {
          voiceUsers[channelId].delete(socket.id);
          socket.to(`voice-${channelId}`).emit("user-left-voice", { userId: socket.id });
          changed = true;
        }
      });
      if (changed) {
        io.emit("voice-users-update", getVoiceUsersMap());
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
