-- ==========================================
-- SCRIPT D'INITIALISATION COMPLET - DROCSID
-- ==========================================
-- ATTENTION: L'exécution de ce script supprimera et recréera
-- toutes les tables pour garantir une structure parfaite. 
-- Ne l'exécutez pas si vous avez des données de production importantes 
-- sans avoir fait de sauvegarde !
-- ==========================================

-- 1. Enable les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Drop propre de l'ancienne structure (CASCADE supprime aussi les policies liées)
DROP TABLE IF EXISTS public.expo_push_tokens CASCADE;
DROP TABLE IF EXISTS public.voice_participants CASCADE;
DROP TABLE IF EXISTS public.server_logs CASCADE;
DROP TABLE IF EXISTS public.server_bans CASCADE;
DROP TABLE IF EXISTS public.server_members CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.relationships CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.dm_messages CASCADE;
DROP TABLE IF EXISTS public.invites CASCADE;
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.dms CASCADE;
DROP TABLE IF EXISTS public.channels CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.servers CASCADE;

-- ==========================================
-- 3. DEFINITION DES TABLES
-- ==========================================

CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  avatar_url text,
  status text DEFAULT 'offline'::text CHECK (status = ANY (ARRAY['online'::text, 'idle'::text, 'dnd'::text, 'offline'::text])),
  custom_status text,
  last_read jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  display_name text,
  force_voice_move boolean DEFAULT false,
  bio text,
  is_super_admin boolean DEFAULT false,
  can_create_servers boolean DEFAULT false, -- Réservé aux admins by default
  max_servers integer DEFAULT 1,
  email text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.servers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  icon_url text,
  created_at timestamp with time zone DEFAULT now(),
  custom_emojis jsonb DEFAULT '[]'::jsonb,
  soundboard_sounds jsonb DEFAULT '[]'::jsonb,
  default_role_id uuid,
  CONSTRAINT servers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  "order" integer DEFAULT 0,
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.channels (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  type text DEFAULT 'TEXT'::text CHECK (type = ANY (ARRAY['TEXT'::text, 'VOICE'::text])),
  created_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone,
  "order" integer DEFAULT 0,
  CONSTRAINT channels_pkey PRIMARY KEY (id)
);

CREATE TABLE public.dms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  participants uuid[] NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone,
  CONSTRAINT dms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.calls (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  caller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  participants uuid[] NOT NULL,
  status text DEFAULT 'ringing'::text CHECK (status = ANY (ARRAY['ringing'::text, 'active'::text])),
  created_at timestamp with time zone DEFAULT now(),
  dm_id uuid UNIQUE REFERENCES public.dms(id) ON DELETE CASCADE,
  CONSTRAINT calls_pkey PRIMARY KEY (id)
);

CREATE TABLE public.dm_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  dm_id uuid REFERENCES public.dms(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  reply_to uuid REFERENCES public.dm_messages(id) ON DELETE SET NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_edited boolean DEFAULT false,
  reactions jsonb DEFAULT '{}'::jsonb,
  is_pinned boolean DEFAULT false,
  CONSTRAINT dm_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.invites (
  code text NOT NULL,
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uses integer DEFAULT 0,
  max_uses integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invites_pkey PRIMARY KEY (code)
);

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_edited boolean DEFAULT false,
  reactions jsonb DEFAULT '{}'::jsonb,
  is_pinned boolean DEFAULT false,
  CONSTRAINT messages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  notified boolean DEFAULT false,
  message text,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.relationships (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  participants uuid[] NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text])),
  requester_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT relationships_pkey PRIMARY KEY (id)
);

CREATE TABLE public.roles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#99aab5'::text,
  permissions text[] DEFAULT '{}'::text[],
  "order" integer DEFAULT 0,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.server_bans (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT server_bans_pkey PRIMARY KEY (server_id, user_id)
);

CREATE TABLE public.server_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  action text NOT NULL,
  details text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT server_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.server_members (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roles text[] DEFAULT '{}'::text[],
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT server_members_pkey PRIMARY KEY (server_id, user_id)
);

CREATE TABLE public.voice_participants (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamp with time zone DEFAULT now(),
  is_muted boolean DEFAULT false,
  is_streaming boolean DEFAULT false,
  viewing_streams uuid[] DEFAULT '{}'::uuid[],
  CONSTRAINT voice_participants_pkey PRIMARY KEY (user_id)
);

CREATE TABLE public.expo_push_tokens (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT expo_push_tokens_pkey PRIMARY KEY (user_id, token)
);

-- Ajouter la contrainte default_role_id sur public.servers maintenant que roles est créée
ALTER TABLE public.servers 
  ADD CONSTRAINT servers_default_role_id_fkey 
  FOREIGN KEY (default_role_id) REFERENCES public.roles(id) ON DELETE SET NULL;


-- ==========================================
-- 4. POLITIQUES DE SECURITE (RLS) ET GRANTS
-- ==========================================

-- Assurer que les rôles Supabase ont les permissions de base sur les tables
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Active RLS sur toutes les tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expo_push_tokens ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Tout le monde peut voir les profils (pour la recherche/username)
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. Servers & Members: Accès si membre
CREATE POLICY "servers_access" ON public.servers FOR ALL TO authenticated USING (true); -- On peut laisser SELECT true pour rejoindre via invite
CREATE POLICY "server_members_access" ON public.server_members FOR ALL TO authenticated USING (true);

-- 3. DMs & DM Messages: STRICTEMENT RÉSERVÉ AUX PARTICIPANTS
CREATE POLICY "dms_participant_access" ON public.dms
  FOR ALL TO authenticated
  USING (auth.uid() = ANY(participants));

CREATE POLICY "dm_messages_participant_access" ON public.dm_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dms
      WHERE dms.id = dm_messages.dm_id
      AND auth.uid() = ANY(participants)
    )
  );

-- 4. Notifications: SELECTION AND UPDATES LE PROPRIÉTAIRE, INSERT POUR TOUS
CREATE POLICY "notifications_owner_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
  
CREATE POLICY "notifications_owner_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
  
CREATE POLICY "notifications_owner_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
  
CREATE POLICY "notifications_insert_all" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 5. Messages (Channels): On laisse pour l'instant car ça nécessite des checks complexes sur server_members
CREATE POLICY "Auth_All_messages" ON public.messages FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_channels" ON public.channels FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_categories" ON public.categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_invites" ON public.invites FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_roles" ON public.roles FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_server_bans" ON public.server_bans FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_server_logs" ON public.server_logs FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_voice_participants" ON public.voice_participants FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_relationships" ON public.relationships FOR ALL TO authenticated USING (true);
CREATE POLICY "Auth_All_calls" ON public.calls FOR ALL TO authenticated USING (true);
CREATE POLICY "expo_push_tokens_owner" ON public.expo_push_tokens FOR ALL USING (auth.uid() = user_id);


-- ==========================================
-- 5. BUCKETS STORAGE
-- ==========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('server-icons', 'server-icons', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('soundboard', 'soundboard', true) ON CONFLICT DO NOTHING;

-- Configuration Storage permissive
-- Nettoyage de l'existant
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Auth Insert" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;
DROP POLICY IF EXISTS "Public_Access_Storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth_Insert_Storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth_Update_Storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth_Delete_Storage" ON storage.objects;

CREATE POLICY "Public_Access_Storage" ON storage.objects FOR SELECT USING (true);
CREATE POLICY "Auth_Insert_Storage" ON storage.objects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth_Update_Storage" ON storage.objects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth_Delete_Storage" ON storage.objects FOR DELETE TO authenticated USING (true);


-- ==========================================
-- 6. CONFIGURATION REALTIME
-- ==========================================
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.relationships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_bans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_logs;


-- ==========================================
-- 7. TRIGGERS ET FONCTIONS
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, avatar_url, is_super_admin, can_create_servers, max_servers)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    CASE WHEN new.email = 'admin@example.com' THEN true ELSE false END,
    CASE WHEN new.email = 'admin@example.com' THEN true ELSE false END,
    CASE WHEN new.email = 'admin@example.com' THEN 100 ELSE 1 END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- trigger pour protéger les droits sensibles (is_super_admin, can_create_servers)
CREATE OR REPLACE FUNCTION public.protect_profile_rights()
RETURNS trigger AS $$
BEGIN
  -- Seule une personne déjà super_admin peut changer ces colonnes
  -- auth.uid() est l'utilisateur qui fait l'update
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_super_admin = true
  ) THEN
    -- Si l'utilisateur n'est pas super_admin, on remet les anciennes valeurs
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      NEW.is_super_admin := OLD.is_super_admin;
    END IF;
    IF NEW.can_create_servers IS DISTINCT FROM OLD.can_create_servers THEN
      NEW.can_create_servers := OLD.can_create_servers;
    END IF;
    IF NEW.max_servers IS DISTINCT FROM OLD.max_servers THEN
      NEW.max_servers := OLD.max_servers;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_update_protect_rights ON public.profiles;
CREATE TRIGGER on_profile_update_protect_rights
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_rights();


-- ==========================================
-- 8. SUPER ADMINS (APPLICATIF)
-- ==========================================
-- Promotion si le profil existe déjà
UPDATE public.profiles
SET is_super_admin = true, can_create_servers = true, max_servers = 100
WHERE email = 'admin@example.com';

CREATE OR REPLACE FUNCTION public.mark_channel_notifications_read(p_user_id uuid, p_channel_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.notifications
  SET read = true
  WHERE user_id = p_user_id AND read = false AND data->>'channel_id' = p_channel_id::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
