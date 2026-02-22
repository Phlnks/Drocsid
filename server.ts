
import express, { Router } from 'express';
import type { Server as SocketIoServer } from 'socket.io';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  initDb, getChannels, addChannel, updateChannel, deleteChannel, 
  getMessages, addMessage, updateMessageReactions, deleteMessage, updateMessage,
  getRoles, updateRoles, getUserRoles, setUserRole,
  getUsers, upsertUser, logLogin
} from './db';
import { getLinkPreview } from './src/previews';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
export const api = Router();

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

api.use('/uploads', express.static(path.join(__dirname, 'uploads')));

api.post('/upload', upload.single('file'), (req, res) => {
  if (req.file) {
    res.json({ filePath: `/uploads/${req.file.filename}` });
  } else {
    res.status(400).send('No file uploaded.');
  }
});

api.get('/preview', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).send('URL is required');
  }
  const preview = await getLinkPreview(url);
  if (preview) {
    res.json(preview);
  } else {
    res.status(404).send('Could not generate a preview for this URL.');
  }
});

app.use('/api', api);

export async function configureSocket(io: SocketIoServer) {
  await initDb();
  
  let channels = await getChannels();
  let messages = await getMessages();
  let roles = await getRoles();
  let userRoles = await getUserRoles();
  let usernames = await getUsers();

  const voiceUsers: Record<string, Set<string>> = {};
  const userPresence: Record<string, string> = {};
  const screenSharers: Record<string, string> = {};
  const voiceStates: Record<string, { speaking: boolean, muted: boolean, deafened: boolean }> = {};

  channels.forEach(c => {
    if (c.type === 'voice') {
      voiceUsers[c.id] = new Set();
    }
  });

  const getVoiceUsersMap = () => {
    const map: Record<string, string[]> = {};
    Object.keys(voiceUsers).forEach(id => {
      map[id] = Array.from(voiceUsers[id]);
    });
    return map;
  };

  io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    if (!userRoles[socket.id] || userRoles[socket.id].length === 0) {
      const adminRole = roles.find(r => r.name === 'Administrator');
      const memberRole = roles.find(r => r.name === 'Member');
      
      if (adminRole && memberRole) {
        const hasAdmin = Object.values(userRoles).some(roleIds => roleIds.includes(adminRole.id));
        if (!hasAdmin) {
          userRoles[socket.id] = [adminRole.id];
          await setUserRole(socket.id, adminRole.id);
        } else {
          userRoles[socket.id] = [memberRole.id];
          await setUserRole(socket.id, memberRole.id);
        }
        io.emit("user-roles-update", userRoles);
      }
    }

    userPresence[socket.id] = 'online';
    voiceStates[socket.id] = { speaking: false, muted: false, deafened: false };
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
    });

    socket.on("leave-channel", (channelId) => {
      socket.leave(channelId);
    });

    socket.on("send-message", async ({ channelId, text, user, gifUrl, file }) => {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = text.match(urlRegex);
      let linkPreview = null;

      if (urls && urls.length > 0) {
        linkPreview = await getLinkPreview(urls[0]);
      }

      const message = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        user,
        userId: socket.id,
        timestamp: new Date().toISOString(),
        reactions: {},
        gifUrl,
        linkPreview,
        file,
      };
      if (!messages[channelId]) messages[channelId] = [];
      messages[channelId].push(message);
      await addMessage(message, channelId);
      io.to(channelId).emit("new-message", { channelId, message });
    });

    socket.on("add-reaction", async ({ channelId, messageId, emoji, userId }) => {
      const channelMessages = messages[channelId];
      if (channelMessages) {
        const message = channelMessages.find((m) => m.id === messageId);
        if (message) {
          if (!message.reactions) message.reactions = {};
          if (!message.reactions[emoji]) message.reactions[emoji] = [];
          if (!message.reactions[emoji].includes(userId)) {
            message.reactions[emoji].push(userId);
            await updateMessageReactions(messageId, message.reactions);
            io.to(channelId).emit("reaction-updated", { channelId, messageId, reactions: message.reactions });
          }
        }
      }
    });

    socket.on("remove-reaction", async ({ channelId, messageId, emoji, userId }) => {
      const channelMessages = messages[channelId];
      if (channelMessages) {
        const message = channelMessages.find((m) => m.id === messageId);
        if (message && message.reactions && message.reactions[emoji]) {
          message.reactions[emoji] = message.reactions[emoji].filter((id) => id !== userId);
          if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
          }
          await updateMessageReactions(messageId, message.reactions);
          io.to(channelId).emit("reaction-updated", { channelId, messageId, reactions: message.reactions });
        }
      }
    });

    socket.on('edit-message', async ({ channelId, messageId, newText }) => {
      const userRoleIds = userRoles[socket.id] || [];
      const userPermissions = roles
        .filter(r => userRoleIds.includes(r.id))
        .flatMap(r => r.permissions);

      const canEdit = userPermissions.includes('ADMINISTRATOR') || userPermissions.includes('EDIT_MESSAGES');

      if (canEdit) {
        const editedTimestamp = await updateMessage(messageId, newText);
        const channelMessages = messages[channelId];
        if (channelMessages) {
          const message = channelMessages.find((m) => m.id === messageId);
          if (message) {
            message.text = newText;
            message.edited = editedTimestamp;
            io.emit('message-updated', { channelId, messageId, newText, editedTimestamp });
          }
        }
      }
    });

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

    socket.on("update-roles", async (newRoles) => {
      roles = newRoles;
      await updateRoles(newRoles);
      io.emit("roles-updated", roles);
    });

    socket.on("create-channel", async (channel) => {
      const newChannel = { ...channel, id: Math.random().toString(36).substr(2, 9) };
      channels.push(newChannel);
      if (newChannel.type === 'voice') {
        voiceUsers[newChannel.id] = new Set();
      } else {
        messages[newChannel.id] = [];
      }
      await addChannel(newChannel);
      io.emit("channels-updated", channels);
    });

    socket.on("update-channel", async (updatedChannel) => {
      const index = channels.findIndex(c => c.id === updatedChannel.id);
      if (index !== -1) {
        channels[index] = { ...channels[index], ...updatedChannel };
        await updateChannel(channels[index]);
        io.emit("channels-updated", channels);
      }
    });

    socket.on("delete-channel", async (channelId) => {
      const index = channels.findIndex(c => c.id === channelId);
      if (index !== -1) {
        channels.splice(index, 1);
        delete messages[channelId];
        delete voiceUsers[channelId];
        await deleteChannel(channelId);
        io.emit("channels-updated", channels);
      }
    });

    socket.on('delete-message', async ({ channelId, messageId }) => {
      const userRoleIds = userRoles[socket.id] || [];
      const userPermissions = roles
        .filter(r => userRoleIds.includes(r.id))
        .flatMap(r => r.permissions);

      const canDelete = userPermissions.includes('ADMINISTRATOR') || userPermissions.includes('DELETE_MESSAGES');

      if (canDelete) {
        messages[channelId] = messages[channelId].filter(m => m.id !== messageId);
        await deleteMessage(messageId);
        io.emit('messages-updated', messages);
      }
    });

    socket.on("update-presence", (status) => {
      userPresence[socket.id] = status;
      io.emit("presence-update", userPresence);
    });

    socket.on("set-username", async (name) => {
      usernames[socket.id] = name;
      await upsertUser(socket.id, name);
      await logLogin(socket.id, name, socket.handshake.address || 'unknown');
      io.emit("usernames-update", usernames);
    });

    socket.on("assign-role", async ({ userId, roleIds }) => {
      userRoles[userId] = roleIds;
      await setUserRole(userId, roleIds);
      io.emit("user-roles-update", userRoles);
    });

    socket.on("update-voice-state", (state) => {
      voiceStates[socket.id] = { ...voiceStates[socket.id], ...state };
      io.emit("voice-state-update", { userId: socket.id, state: voiceStates[socket.id] });
    });

    socket.on("disconnect", () => {
      delete userPresence[socket.id];
      delete voiceStates[socket.id];
      if (screenSharers[socket.id]) {
        const channelId = screenSharers[socket.id];
        delete screenSharers[socket.id];
        io.to(`voice-${channelId}`).emit("screen-share-stopped", { userId: socket.id, channelId });
      }
      io.emit("presence-update", userPresence);
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

  console.log("Socket.IO configured");
}

export default app;
