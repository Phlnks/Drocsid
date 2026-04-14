-- Supabase Schema Migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'idle', 'dnd', 'offline')),
  display_name TEXT,
  force_voice_move JSONB DEFAULT '{"channelId": null, "timestamp": 0}'::jsonb,
  last_read JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Servers
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  icon_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#99aab5',
  permissions TEXT[] DEFAULT '{}',
  "order" INTEGER DEFAULT 0
);

-- 4. Server Members
CREATE TABLE IF NOT EXISTS server_members (
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  roles TEXT[] DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

-- 5. Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0
);

-- 6. Channels
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'TEXT' CHECK (type IN ('TEXT', 'VOICE')),
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- 7. Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  reply_to UUID REFERENCES messages(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_edited BOOLEAN DEFAULT FALSE,
  reactions JSONB DEFAULT '{}'::jsonb
);

-- 8. DMs
CREATE TABLE IF NOT EXISTS dms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participants UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- 9. DM Messages
CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dm_id UUID REFERENCES dms(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  reply_to UUID REFERENCES dm_messages(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_edited BOOLEAN DEFAULT FALSE,
  reactions JSONB DEFAULT '{}'::jsonb
);

-- 10. Relationships
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participants UUID[] NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Calls
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dm_id UUID REFERENCES dms(id) ON DELETE CASCADE UNIQUE,
  caller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participants UUID[] NOT NULL,
  status TEXT DEFAULT 'ringing' CHECK (status IN ('ringing', 'active')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Invites
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  uses INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Server Logs
CREATE TABLE IF NOT EXISTS server_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Server Bans
CREATE TABLE IF NOT EXISTS server_bans (
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

-- 16. Voice Participants
CREATE TABLE IF NOT EXISTS voice_participants (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL, -- Can be channel_id or dm_id
  is_muted BOOLEAN DEFAULT FALSE,
  is_streaming BOOLEAN DEFAULT FALSE,
  viewing_streams UUID[] DEFAULT '{}'::UUID[],
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to existing tables (if they were created before these columns were added)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS dm_id UUID REFERENCES dms(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE calls ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE calls ADD CONSTRAINT calls_dm_id_key UNIQUE (dm_id);
ALTER TABLE voice_participants ADD COLUMN IF NOT EXISTS is_streaming BOOLEAN DEFAULT FALSE;
ALTER TABLE voice_participants ADD COLUMN IF NOT EXISTS viewing_streams UUID[] DEFAULT '{}'::UUID[];

-- Ensure voice_participants has user_id as primary key for single-channel enforcement
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.key_column_usage 
        WHERE table_name = 'voice_participants' 
        AND constraint_name = 'voice_participants_pkey'
        AND column_name = 'channel_id'
    ) THEN
        -- Delete duplicates keeping the most recent row
        DELETE FROM voice_participants
        WHERE ctid NOT IN (
            SELECT max(ctid)
            FROM voice_participants
            GROUP BY user_id
        );
        
        ALTER TABLE voice_participants DROP CONSTRAINT voice_participants_pkey;
        ALTER TABLE voice_participants ADD PRIMARY KEY (user_id);
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_server_id ON messages(server_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_dm_id ON dm_messages(dm_id);
CREATE INDEX IF NOT EXISTS idx_server_members_server_id ON server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_dms_participants ON dms USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_dms_updated_at ON dms(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_relationships_participants ON relationships USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_dm_id ON calls(dm_id);

-- RLS Policies (Simplified to avoid infinite recursion)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can move members" ON profiles;
CREATE POLICY "Admins can move members" ON profiles FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM server_members m1
    JOIN server_members m2 ON m1.server_id = m2.server_id
    JOIN roles r ON r.id = ANY(m1.roles)
    WHERE m1.user_id = auth.uid()
    AND m2.user_id = profiles.id
    AND (r.permissions @> ARRAY['MOVE_MEMBERS'] OR r.permissions @> ARRAY['ADMINISTRATOR'])
  )
);

ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Servers are viewable by authenticated users" ON servers;
CREATE POLICY "Servers are viewable by authenticated users" ON servers FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can create servers" ON servers;
CREATE POLICY "Authenticated users can create servers" ON servers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Owners can update servers" ON servers;
CREATE POLICY "Owners can update servers" ON servers FOR UPDATE USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "Owners can delete servers" ON servers;
CREATE POLICY "Owners can delete servers" ON servers FOR DELETE USING (owner_id = auth.uid());

ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Memberships are viewable by authenticated users" ON server_members;
CREATE POLICY "Memberships are viewable by authenticated users" ON server_members FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can join servers" ON server_members;
CREATE POLICY "Authenticated users can join servers" ON server_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Members can update their own membership" ON server_members;
CREATE POLICY "Members can update their own membership" ON server_members FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Members can leave servers" ON server_members;
CREATE POLICY "Members can leave servers" ON server_members FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories are viewable by authenticated users" ON categories;
CREATE POLICY "Categories are viewable by authenticated users" ON categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can create categories" ON categories;
CREATE POLICY "Authenticated users can create categories" ON categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can update categories" ON categories;
CREATE POLICY "Authenticated users can update categories" ON categories FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can delete categories" ON categories;
CREATE POLICY "Authenticated users can delete categories" ON categories FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Channels are viewable by authenticated users" ON channels;
CREATE POLICY "Channels are viewable by authenticated users" ON channels FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can create channels" ON channels;
CREATE POLICY "Authenticated users can create channels" ON channels FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can update channels" ON channels;
CREATE POLICY "Authenticated users can update channels" ON channels FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can delete channels" ON channels;
CREATE POLICY "Authenticated users can delete channels" ON channels FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Messages are viewable by authenticated users" ON messages;
CREATE POLICY "Messages are viewable by authenticated users" ON messages FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Members can send messages" ON messages;
CREATE POLICY "Members can send messages" ON messages FOR INSERT WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors can edit messages" ON messages;
CREATE POLICY "Authors can edit messages" ON messages FOR UPDATE USING (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors can delete messages" ON messages;
CREATE POLICY "Authors can delete messages" ON messages FOR DELETE USING (author_id = auth.uid());

ALTER TABLE dms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DMs are viewable by participants" ON dms;
CREATE POLICY "DMs are viewable by participants" ON dms FOR SELECT USING (auth.uid() = ANY(participants));
DROP POLICY IF EXISTS "Authenticated users can create DMs" ON dms;
CREATE POLICY "Authenticated users can create DMs" ON dms FOR INSERT WITH CHECK (auth.uid() = ANY(participants));
DROP POLICY IF EXISTS "Participants can update DMs" ON dms;
CREATE POLICY "Participants can update DMs" ON dms FOR UPDATE USING (auth.uid() = ANY(participants));

ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DM messages are viewable by participants" ON dm_messages;
CREATE POLICY "DM messages are viewable by participants" ON dm_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM dms WHERE id = dm_id AND auth.uid() = ANY(participants))
);
DROP POLICY IF EXISTS "Participants can send DM messages" ON dm_messages;
CREATE POLICY "Participants can send DM messages" ON dm_messages FOR INSERT WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors can edit DM messages" ON dm_messages;
CREATE POLICY "Authors can edit DM messages" ON dm_messages FOR UPDATE USING (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors can delete DM messages" ON dm_messages;
CREATE POLICY "Authors can delete DM messages" ON dm_messages FOR DELETE USING (author_id = auth.uid());

ALTER TABLE server_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Logs are viewable by authenticated users" ON server_logs;
CREATE POLICY "Logs are viewable by authenticated users" ON server_logs FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can create logs" ON server_logs;
CREATE POLICY "Authenticated users can create logs" ON server_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE voice_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Voice participants are viewable by everyone" ON voice_participants;
CREATE POLICY "Voice participants are viewable by everyone" ON voice_participants FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage their own voice state" ON voice_participants;
CREATE POLICY "Users can manage their own voice state" ON voice_participants FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can move voice participants" ON voice_participants;
CREATE POLICY "Admins can move voice participants" ON voice_participants FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM channels c
    JOIN server_members m ON m.server_id = c.server_id
    JOIN roles r ON r.id = ANY(m.roles)
    WHERE c.id = voice_participants.channel_id
    AND m.user_id = auth.uid()
    AND (r.permissions @> ARRAY['MOVE_MEMBERS'] OR r.permissions @> ARRAY['ADMINISTRATOR'])
  )
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Invites are viewable by authenticated users" ON invites;
CREATE POLICY "Invites are viewable by authenticated users" ON invites FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can create invites" ON invites;
CREATE POLICY "Authenticated users can create invites" ON invites FOR INSERT WITH CHECK (auth.uid() = creator_id);
DROP POLICY IF EXISTS "Authenticated users can delete invites" ON invites;
CREATE POLICY "Authenticated users can delete invites" ON invites FOR DELETE USING (auth.uid() = creator_id);

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Relationships are viewable by participants" ON relationships;
CREATE POLICY "Relationships are viewable by participants" ON relationships FOR SELECT USING (auth.uid() = ANY(participants));
DROP POLICY IF EXISTS "Authenticated users can create relationships" ON relationships;
CREATE POLICY "Authenticated users can create relationships" ON relationships FOR INSERT WITH CHECK (auth.uid() = requester_id);
DROP POLICY IF EXISTS "Participants can update relationships" ON relationships;
CREATE POLICY "Participants can update relationships" ON relationships FOR UPDATE USING (auth.uid() = ANY(participants));
DROP POLICY IF EXISTS "Participants can delete relationships" ON relationships;
CREATE POLICY "Participants can delete relationships" ON relationships FOR DELETE USING (auth.uid() = ANY(participants));

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Roles are viewable by authenticated users" ON roles;
CREATE POLICY "Roles are viewable by authenticated users" ON roles FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can create roles" ON roles;
CREATE POLICY "Authenticated users can create roles" ON roles FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can update roles" ON roles;
CREATE POLICY "Authenticated users can update roles" ON roles FOR UPDATE USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can delete roles" ON roles;
CREATE POLICY "Authenticated users can delete roles" ON roles FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE server_bans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bans are viewable by authenticated users" ON server_bans;
CREATE POLICY "Bans are viewable by authenticated users" ON server_bans FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can create bans" ON server_bans;
CREATE POLICY "Authenticated users can create bans" ON server_bans FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can delete bans" ON server_bans;
CREATE POLICY "Authenticated users can delete bans" ON server_bans FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notifications are viewable by owner" ON notifications;
CREATE POLICY "Notifications are viewable by owner" ON notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;
CREATE POLICY "Authenticated users can create notifications" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Owner can update notifications" ON notifications;
CREATE POLICY "Owner can update notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Owner can delete notifications" ON notifications;
CREATE POLICY "Owner can delete notifications" ON notifications FOR DELETE USING (user_id = auth.uid());

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Calls are viewable by participants" ON calls;
CREATE POLICY "Calls are viewable by participants" ON calls FOR SELECT USING (auth.uid() = ANY(participants));
DROP POLICY IF EXISTS "Authenticated users can create calls" ON calls;
CREATE POLICY "Authenticated users can create calls" ON calls FOR INSERT WITH CHECK (auth.uid() = ANY(participants));
DROP POLICY IF EXISTS "Participants can update calls" ON calls;
CREATE POLICY "Participants can update calls" ON calls FOR UPDATE USING (auth.uid() = ANY(participants));
DROP POLICY IF EXISTS "Participants can delete calls" ON calls;
CREATE POLICY "Participants can delete calls" ON calls FOR DELETE USING (auth.uid() = ANY(participants));

-- Trigger for new user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Enable Realtime for all tables
BEGIN;
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
    EXCEPTION WHEN OTHERS THEN
      -- Ignore errors if table is already in publication
    END;
  END LOOP;
END $$;
COMMIT;

