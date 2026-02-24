
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let db: Database<sqlite3.Database, sqlite3.Statement>;

async function runMigrations() {
  const columns = await db.all("PRAGMA table_info(messages)");
  
  if (!columns.some(c => c.name === 'edited')) {
    console.log("Running migration: Adding 'edited' column to messages table.");
    await db.exec('ALTER TABLE messages ADD COLUMN edited TEXT');
  }

  if (!columns.some(c => c.name === 'file')) {
    console.log("Running migration: Adding 'file' column to messages table.");
    await db.exec('ALTER TABLE messages ADD COLUMN file TEXT');
  }

  if (!columns.some(c => c.name === 'link_preview')) {
    console.log("Running migration: Adding 'link_preview' column to messages table.");
    await db.exec('ALTER TABLE messages ADD COLUMN link_preview TEXT');
  }
}

export async function initDb() {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      username TEXT,
      role_id TEXT,
      PRIMARY KEY (username, role_id),
      FOREIGN KEY (username) REFERENCES users(username)
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

  await runMigrations();

  const rolesCount = await db.get('SELECT COUNT(*) as count FROM roles');
  if (rolesCount.count === 0) {
    const defaultRoles = [
      { id: "admin", name: "Administrator", color: "#f1c40f", permissions: JSON.stringify(["ADMINISTRATOR"]) },
      { id: "mod", name: "Moderator", color: "#2ecc71", permissions: JSON.stringify(["MANAGE_CHANNELS", "SEND_MESSAGES", "CONNECT_VOICE", "DELETE_MESSAGES", "EDIT_MESSAGES"]) },
      { id: "member", name: "Member", color: "#95a5a6", permissions: JSON.stringify(["SEND_MESSAGES", "CONNECT_VOICE", "EDIT_MESSAGES"]) },
    ];
    for (const role of defaultRoles) {
      await db.run('INSERT INTO roles (id, name, color, permissions) VALUES (?, ?, ?, ?)', [role.id, role.name, role.color, role.permissions]);
    }
  }

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
      reactions: row.reactions ? JSON.parse(row.reactions) : {},
      edited: row.edited,
      file: row.file ? JSON.parse(row.file) : null,
      linkPreview: row.link_preview ? JSON.parse(row.link_preview) : null
    });
  }
  return messages;
}

export async function addMessage(message: any, channelId: string) {
  await db.run(
    'INSERT INTO messages (id, channel_id, user_id, username, text, gif_url, timestamp, reactions, file, link_preview) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [message.id, channelId, message.userId, message.user, message.text, message.gifUrl, message.timestamp, JSON.stringify(message.reactions || {}), JSON.stringify(message.file || null), JSON.stringify(message.linkPreview || null)]
  );
}

export async function updateMessage(messageId: string, newText: string) {
  const editedTimestamp = new Date().toISOString();
  await db.run('UPDATE messages SET text = ?, edited = ? WHERE id = ?', [newText, editedTimestamp, messageId]);
  return editedTimestamp;
}

export async function deleteMessage(id: string) {
  await db.run('DELETE FROM messages WHERE id = ?', [id]);
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
    if (!userRoles[row.username]) userRoles[row.username] = [];
    userRoles[row.username].push(row.role_id);
  }
  return userRoles;
}

export async function setUserRole(username: string, roleIds: string[]) {
  await db.run('DELETE FROM user_roles WHERE username = ?', [username]);
  for (const roleId of roleIds) {
    await db.run('INSERT INTO user_roles (username, role_id) VALUES (?, ?)', [username, roleId]);
  }
}

export async function getUsers() {
  const rows = await db.all('SELECT * FROM users');
  const usernames: Record<string, string> = {};
  for (const row of rows) {
    usernames[row.username] = row.username;
  }
  return usernames;
}

export async function upsertUser(username: string) {
  await db.run(
    'INSERT INTO users (username, last_login) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET last_login = excluded.last_login',
    [username, new Date().toISOString()]
  );
}

export async function logLogin(username: string, ipAddress: string) {
  await db.run(
    'INSERT INTO login_logs (username, login_time, ip_address) VALUES (?, ?, ?)',
    [username, new Date().toISOString(), ipAddress]
  );
}
