
import express, { Router } from 'express';
import type { Server as SocketIoServer, Socket } from 'socket.io';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ogs from 'open-graph-scraper';
import { 
  initDb, getChannels, addChannel, updateChannel, deleteChannel, 
  getMessages, addMessage, updateMessageReactions, deleteMessage, updateMessage,
  getRoles, updateRoles, getUserRoles, setUserRole,
  getUsers, upsertUser, logLogin
} from './db';
import { Role } from './src/types';

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
    res.json({ filePath: `/api/uploads/${req.file.filename}` });
  } else {
    res.status(400).send('No file uploaded.');
  }
});

app.use('/api', api);

function getYouTubeVideoId(url: string): string | null {
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    return match ? match[1] : null;
}

function getTikTokVideoId(url: string): string | null {
    const tiktokRegex = /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/.*\/video\/(\d+)/;
    const match = url.match(tiktokRegex);
    return match ? match[1] : null;
}

function getXStatusId(url: string): string | null {
    const xRegex = /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/.*\/status\/(\d+)/;
    const match = url.match(xRegex);
    return match ? match[1] : null;
}

export async function configureSocket(io: SocketIoServer) {
  await initDb();
  
  let channels = await getChannels();
  let messages = await getMessages();
  let roles: Role[] = await getRoles();
  let userRoles = await getUserRoles();

  // Ensure critical roles exist
  if (!roles.find(r => r.name === 'Administrator')) {
    roles.unshift({ // Add to the beginning
      id: 'admin-role',
      name: 'Administrator',
      color: '#c93434',
      permissions: ['ADMINISTRATOR']
    });
    await updateRoles(roles);
  }

  if (!roles.find(r => r.name === 'Moderator')) {
    roles.push({
      id: 'mod-role',
      name: 'Moderator',
      color: '#206694',
      permissions: ['KICK_MEMBERS', 'DELETE_MESSAGES']
    });
    await updateRoles(roles);
  }

  const voiceUsers: Record<string, Set<string>> = {};
  const userPresence: Record<string, string> = {};
  const screenSharers: Record<string, string> = {};
  const voiceStates: Record<string, { speaking: boolean, muted: boolean, deafened: boolean }> = {};
  const onlineUsers: Record<string, string> = {}; // socket.id -> username

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
  
  const hasPermission = (socket: Socket, permission: string) => {
    const username = onlineUsers[socket.id];
    if (!username) return false;

    const userRoleIds = userRoles[username] || [];
    const userPermissions = new Set(
      roles
        .filter((r) => userRoleIds.includes(r.id))
        .flatMap((r) => r.permissions)
    );
    
    return userPermissions.has('ADMINISTRATOR') || userPermissions.has(permission);
  };

  const countAdmins = () => {
    const adminRole = roles.find(r => r.name === 'Administrator');
    if (!adminRole) return 0;
    return Object.values(userRoles).filter(r => r.includes(adminRole.id)).length;
  };

  io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    userPresence[socket.id] = 'online';
    io.emit("presence-update", userPresence);

    socket.emit("init", { 
      channels,
      messages, 
      roles, 
      userPresence, 
      screenSharers, 
      voiceStates, 
      userRoles, 
      usernames: onlineUsers, // Send only online users
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
        let urlToScrape = urls[0];
        const youtubeId = getYouTubeVideoId(urlToScrape);
        const tiktokId = getTikTokVideoId(urlToScrape);
        const xId = getXStatusId(urlToScrape);

        if (youtubeId) {
            urlToScrape = `https://www.youtube.com/watch?v=${youtubeId}`;
        } else if (tiktokId) {
            urlToScrape = `https://www.tiktok.com/oembed?url=https://www.tiktok.com/video/${tiktokId}`;
        } else if (xId) {
            urlToScrape = `https://publish.x.com/oembed?url=https://x.com/user/status/${xId}`;
        }

        try {
            const options = { url: urlToScrape };
            const { result } = await ogs(options);

            if (result && result.success && result.ogTitle && result.ogImage) {
                linkPreview = {
                    url: result.ogUrl || urlToScrape,
                    title: result.ogTitle,
                    description: result.ogDescription,
                    image: Array.isArray(result.ogImage) ? result.ogImage[0].url : result.ogImage.url,
                };
            }
        } catch (error) {
            console.log("Error getting link preview for ", urlToScrape, error.message);
        }
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

      const mentionRegex = /@(\w+)/g;
      let match;
      const mentionedUsernames = new Set<string>();
      while ((match = mentionRegex.exec(text)) !== null) {
        mentionedUsernames.add(match[1]);
      }

      if (mentionedUsernames.size > 0) {
        const onlineUserEntries = Object.entries(onlineUsers);
        mentionedUsernames.forEach(mentionedUsername => {
          const mentionedUserEntry = onlineUserEntries.find(([id, name]) => name === mentionedUsername);
          if (mentionedUserEntry) {
            const targetSocketId = mentionedUserEntry[0];
            io.to(targetSocketId).emit("mention", { channelId, mentionedBy: user });
          }
        });
      }

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
      if (!hasPermission(socket, 'EDIT_MESSAGES')) return;
      const channelMessages = messages[channelId];
      if (!channelMessages) return;

      const message = channelMessages.find((m) => m.id === messageId);
      if (!message) return;

      const editedTimestamp = await updateMessage(messageId, newText);
      message.text = newText;
      message.edited = editedTimestamp;
      io.emit('message-updated', { channelId, messageId, newText, editedTimestamp });
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
      if (voiceUsers[channelId] && voiceUsers[channelId].has(socket.id)) {
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

    socket.on("screen-share-start", ({ channelId }) => {
        if (channelId) {
            screenSharers[channelId] = socket.id;
            io.emit("screen-share-started", { userId: socket.id, channelId });
        }
    });

    socket.on("screen-share-stop", ({ channelId }) => {
        if (channelId && screenSharers[channelId] === socket.id) {
            delete screenSharers[channelId];
            io.emit("screen-share-stopped", { userId: socket.id, channelId });
        }
    });

    socket.on("screen-data", ({ channelId, data }) => {
      socket.to(`voice-${channelId}`).emit("screen-stream", { userId: socket.id, data });
    });

    socket.on("typing", ({ channelId, user, isTyping }) => {
      socket.to(channelId).emit("user-typing", { channelId, user, isTyping });
    });

    socket.on("update-roles", async (newRoles) => {
        if (!hasPermission(socket, 'ADMINISTRATOR')) return;

        const adminRole = roles.find(r => r.name === 'Administrator');
        const adminRoleExistsInNew = newRoles.some(r => r.id === adminRole.id);

        if (!adminRoleExistsInNew && countAdmins() <= 1) {
            socket.emit('channel-error', { message: "Cannot delete the last Administrator role." });
            return;
        }

        roles = newRoles;
        await updateRoles(newRoles);
        io.emit("roles-updated", roles);
    });

    socket.on("create-channel", async (channel) => {
      if (!hasPermission(socket, 'MANAGE_CHANNELS')) return;

      if (channels.some(c => c.name === channel.name)) {
        socket.emit('channel-error', { message: 'A channel with this name already exists.' });
        return;
      }

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
      if (!hasPermission(socket, 'MANAGE_CHANNELS')) return;

      if (channels.some(c => c.name === updatedChannel.name && c.id !== updatedChannel.id)) {
        socket.emit('channel-error', { message: 'A channel with this name already exists.' });
        return;
      }

      const index = channels.findIndex(c => c.id === updatedChannel.id);
      if (index !== -1) {
        channels[index] = { ...channels[index], ...updatedChannel };
        await updateChannel(channels[index]);
        io.emit("channels-updated", channels);
      }
    });

    socket.on("delete-channel", async (channelId) => {
      if (!hasPermission(socket, 'MANAGE_CHANNELS')) return;
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
      if (!hasPermission(socket, 'DELETE_MESSAGES')) return;
      const channelMessages = messages[channelId];
      if (!channelMessages) return;

      const messageIndex = channelMessages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      messages[channelId].splice(messageIndex, 1);
      await deleteMessage(messageId);
      io.emit('messages-updated', messages);
    });

    socket.on("update-presence", (status) => {
      userPresence[socket.id] = status;
      io.emit("presence-update", userPresence);
    });

    socket.on("set-username", async (name) => {
        onlineUsers[socket.id] = name;
        await upsertUser(name);
        await logLogin(name, socket.handshake.address || 'unknown');
    
        const dbUserRoles = await getUserRoles();
    
        if (!dbUserRoles[name]) {
            const adminRole = roles.find(r => r.name === 'Administrator');
            const memberRole = roles.find(r => r.name === 'Member');
    
            if (adminRole && memberRole) {
                const adminExists = Object.values(dbUserRoles).some(roleList => roleList.includes(adminRole.id));
                const newRoleIds = !adminExists ? [adminRole.id] : [memberRole.id];
                await setUserRole(name, newRoleIds);
                userRoles[name] = newRoleIds;
            }
        } else {
            userRoles[name] = dbUserRoles[name];
        }
    
        io.emit("usernames-update", onlineUsers);
        io.emit("user-roles-update", userRoles);
    });

    socket.on("assign-role", async ({ username, roleIds }) => {
        if (!hasPermission(socket, 'MANAGE_ROLES')) return;

        const adminRole = roles.find(r => r.name === 'Administrator');
        const currentRoles = userRoles[username] || [];
        
        if (adminRole && currentRoles.includes(adminRole.id) && !roleIds.includes(adminRole.id)) {
            if (countAdmins() <= 1) {
                socket.emit('channel-error', { message: "Cannot remove the last administrator." });
                return; // Revert or simply don't update
            }
        }

        userRoles[username] = roleIds;
        await setUserRole(username, roleIds);
        io.emit("user-roles-update", userRoles);
    });
    
    socket.on('kick-user', ({ userId, channelId }) => {
      if (!hasPermission(socket, 'KICK_MEMBERS')) return;
  
      const targetSocket = io.sockets.sockets.get(userId);
      if (targetSocket && voiceUsers[channelId] && voiceUsers[channelId].has(userId)) {
        voiceUsers[channelId].delete(userId);
        targetSocket.leave(`voice-${channelId}`);
        io.to(userId).emit('force-disconnect-voice');
        io.emit("voice-users-update", getVoiceUsersMap());
        io.to(channelId).emit("user-left-voice", { userId });
      }
    });

    socket.on("update-voice-state", (state) => {
      voiceStates[socket.id] = { ...voiceStates[socket.id], ...state };
      io.emit("voice-state-update", { userId: socket.id, state: voiceStates[socket.id] });
    });

    socket.on("disconnect", () => {
      const username = onlineUsers[socket.id];
      delete userPresence[socket.id];
      delete voiceStates[socket.id];
      delete onlineUsers[socket.id];

      const sharedChannelId = Object.keys(screenSharers).find(channelId => screenSharers[channelId] === socket.id);
      if (sharedChannelId) {
          delete screenSharers[sharedChannelId];
          io.emit("screen-share-stopped", { userId: socket.id, channelId: sharedChannelId });
      }

      io.emit("presence-update", userPresence);
      io.emit("usernames-update", onlineUsers);

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
