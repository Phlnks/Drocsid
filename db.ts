
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let db: Database<sqlite3.Database, sqlite3.Statement>;

export async function initDb() {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      username TEXT,
      login_time DATETIME,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      permissions TEXT
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT,
      role_id TEXT,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT,
      user_id TEXT,
      username TEXT,
      text TEXT,
      gif_url TEXT,
      timestamp DATETIME,
      reactions TEXT
    );
  `);

  // Initialize default roles if empty
  const rolesCount = await db.get('SELECT COUNT(*) as count FROM roles');
  if (rolesCount.count === 0) {
    const defaultRoles = [
      { id: "admin", name: "Administrator", color: "#f1c40f", permissions: JSON.stringify(["ADMINISTRATOR"]) },
      { id: "mod", name: "Moderator", color: "#2ecc71", permissions: JSON.stringify(["MANAGE_CHANNELS", "SEND_MESSAGES", "CONNECT_VOICE"]) },
      { id: "member", name: "Member", color: "#95a5a6", permissions: JSON.stringify(["SEND_MESSAGES", "CONNECT_VOICE"]) },
    ];
    for (const role of defaultRoles) {
      await db.run('INSERT INTO roles (id, name, color, permissions) VALUES (?, ?, ?, ?)', [role.id, role.name, role.color, role.permissions]);
    }
  }

  // Initialize default channels if empty
  const channelsCount = await db.get('SELECT COUNT(*) as count FROM channels');
  if (channelsCount.count === 0) {
    const defaultChannels = [
      { id: "general", name: "general", type: "text" },
      { id: "voc", name: "Voc", type: "voice" },
    ];
    for (const channel of defaultChannels) {
      await db.run('INSERT INTO channels (id, name, type) VALUES (?, ?, ?)', [channel.id, channel.name, channel.type]);
    }
  }
}

export async function getChannels() {
  return await db.all('SELECT * FROM channels');
}

export async function addChannel(channel: any) {
  await db.run('INSERT INTO channels (id, name, type) VALUES (?, ?, ?)', [channel.id, channel.name, channel.type]);
}

export async function updateChannel(channel: any) {
  await db.run('UPDATE channels SET name = ?, type = ? WHERE id = ?', [channel.name, channel.type, channel.id]);
}

export async function deleteChannel(id: string) {
  await db.run('DELETE FROM channels WHERE id = ?', [id]);
  await db.run('DELETE FROM messages WHERE channel_id = ?', [id]);
}

export async function getMessages() {
  const rows = await db.all('SELECT * FROM messages ORDER BY timestamp ASC');
  const messages: Record<string, any[]> = {};
  for (const row of rows) {
    if (!messages[row.channel_id]) messages[row.channel_id] = [];
    messages[row.channel_id].push({
      id: row.id,
      text: row.text,
      user: row.username,
      userId: row.user_id,
      timestamp: row.timestamp,
      gifUrl: row.gif_url,
      reactions: row.reactions ? JSON.parse(row.reactions) : {}
    });
  }
  return messages;
}

export async function addMessage(message: any, channelId: string) {
  await db.run(
    'INSERT INTO messages (id, channel_id, user_id, username, text, gif_url, timestamp, reactions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [message.id, channelId, message.userId, message.user, message.text, message.gifUrl, message.timestamp, JSON.stringify(message.reactions || {})]
  );
}

export async function updateMessageReactions(messageId: string, reactions: any) {
  await db.run('UPDATE messages SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), messageId]);
}

export async function getRoles() {
  const rows = await db.all('SELECT * FROM roles');
  return rows.map(r => ({ ...r, permissions: JSON.parse(r.permissions) }));
}

export async function updateRoles(roles: any[]) {
  await db.run('DELETE FROM roles');
  for (const role of roles) {
    await db.run('INSERT INTO roles (id, name, color, permissions) VALUES (?, ?, ?, ?)', [role.id, role.name, role.color, JSON.stringify(role.permissions)]);
  }
}

export async function getUserRoles() {
  const rows = await db.all('SELECT * FROM user_roles');
  const userRoles: Record<string, string[]> = {};
  for (const row of rows) {
    if (!userRoles[row.user_id]) userRoles[row.user_id] = [];
    userRoles[row.user_id].push(row.role_id);
  }
  return userRoles;
}

export async function setUserRole(userId: string, roleId: string) {
  await db.run('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
}

export async function getUsers() {
  const rows = await db.all('SELECT * FROM users');
  const usernames: Record<string, string> = {};
  for (const row of rows) {
    usernames[row.id] = row.username;
  }
  return usernames;
}

export async function upsertUser(userId: string, username: string) {
  await db.run(
    'INSERT INTO users (id, username, last_login) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, last_login = excluded.last_login',
    [userId, username, new Date().toISOString()]
  );
}

export async function logLogin(userId: string, username: string, ipAddress: string) {
  await db.run(
    'INSERT INTO login_logs (user_id, username, login_time, ip_address) VALUES (?, ?, ?, ?)',
    [userId, username, new Date().toISOString(), ipAddress]
  );
}
