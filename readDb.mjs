import { initDb, getChannels, getMessages, getRoles, getUserRoles, getUsers } from './db.js';

async function readDatabase() {
  try {
    console.log('Initializing database...');
    await initDb();
    console.log('Database initialized.');

    console.log('\n--- Reading All Data ---\n');

    const channels = await getChannels();
    console.log('\n[Channels]');
    console.table(channels);

    const messages = await getMessages();
    console.log('\n[Messages]');
    // Messages are nested by channel, so we'll log them differently.
    for (const channelId in messages) {
      console.log(`\nMessages in channel: ${channelId}`);
      console.table(messages[channelId]);
    }

    const roles = await getRoles();
    console.log('\n[Roles]');
    console.table(roles);

    const userRoles = await getUserRoles();
    console.log('\n[User Roles]');
    console.log(JSON.stringify(userRoles, null, 2));

    const users = await getUsers();
    console.log('\n[Users]');
    console.log(JSON.stringify(users, null, 2));

    console.log('\n--- Finished Reading Data ---\n');

  } catch (error) {
    console.error('\nError reading database:', error);
  } finally {
    // The db connection in this project is persistent,
    // so there's no explicit close needed for a read script.
  }
}

readDatabase();
