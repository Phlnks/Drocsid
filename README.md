![Drocsid Logo](public/logo-big.png)

**Drocsid** is a modern communication platform, designed to provide a fluid, secure, and highly customizable experience. Whether for gaming communities, work teams, or groups of friends, Drocsid offers a robust infrastructure built on React, Supabase, and Socket.io.

## ✨ Key Features

- **💬 Real-Time Messaging**: Instant chat with Markdown support, syntax highlighting, emojis, GIFs, and file sharing.
- **🔊 Voice Channels & Video**: Connect instantly via voice and video with your friends, powered by LiveKit WebRTC.
- **🖥️ Screen Sharing**: Share your screen or a specific window directly in voice channels or DMs.
- **🛡️ Granular Permissions**:
    - **Private Channels**: Make any channel invisible to everyone except specific roles.
    - **Read-Only Channels**: Create announcement-only channels where only specific roles can write.
    - **Visual Indicators**: Clear "Lock" (Read-only) and "Eye-Off" (Private) icons in settings for easy management.
- **📊 Interactive Polls**: Create and participate in polls within text channels and DMs.
- **🎵 Soundboard**: Express yourself with sounds in voice channels (curated and server-specific).
- **🛡️ Role Hierarchy**: Advanced role system with priority ordering. A member with a lower-ranked role cannot perform administrative actions on a higher-ranked member.
- **🔗 Invite System**: Generate unique invitation codes to grow your community.
- **🔔 Smart Notifications**: Web Push Notifications, desktop notifications, and sound alerts.
- **🎨 Custom Themes**: Multiple themes (Dark, Indigo, Nature, Matrix, etc.) to adapt the application to your preferences.
- **📱 Cross-Platform**: Works in your browser, and includes support for **Electron** (Desktop) and **Capacitor** (Android).
- **📝 Personal Notes**: A dedicated space in your DMs to keep track of your own thoughts.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite 6, Tailwind CSS 4, Motion, Zustand.
- **Backend**: Node.js, Express, Socket.io (Presence & Signaling).
- **Database & Auth**: Supabase (PostgreSQL, Realtime, Storage).
- **Communication**: LiveKit (WebRTC for Audio/Video/Screen Share).
- **Notifications**: Expo Push API (Mobile React Native) & Desktop In-App Alerts.
- **Multi-Platform**: Electron, Capacitor.

## ⌨️ Keyboard Shortcuts

Speed up your workflow with these native shortcuts:
- **`Ctrl + K` (or `Cmd + K`)**: Quick access to the Global Search bar.
- **`Arrow Up (↑)`**: Edit your last sent message (when the input is empty).
- **`Esc`**: Cancel the current action (cancel reply, cancel edit, or close modals/gallery).
- **`Arrows (←/→)`**: Navigate between images in the Media Gallery.

## 🌍 Internationalization

Drocsid is built with global reach in mind, using **i18next** for a localized experience:
- **Supported Languages**: English, French, and Spanish.
- **Automatic Detection**: The app detects your browser's language on the first visit.
- **Manual Switching**: Easily switch languages in the **User Settings** menu.

## 🛠️ Self-Hosted Deployment & Prerequisites

Drocsid is designed to be fully self-hostable. To run your own instance, you need a database (Supabase), a WebRTC server (LiveKit), and a Node.js environment to host the web app and signaling server.

### Prerequisites Ecosystem

- **Node.js** (v18 or higher)
- **Docker & Docker Compose** (Highly recommended for self-hosting Supabase and LiveKit)
- **Domain Name & Subdomain Architecture (Crucial for Production)**:
  Modern browsers strictly enforce security rules for WebRTC, microphone, and camera access, which **require a secure HTTPS (`wss://` and `https://`) connection**. You must have a registered domain name and configure the following subdomains:
  - **App & API Subdomain**: e.g., `drocsid.yourdomain.com` (for serving the React frontend and proxying the Node.js/Socket.io backend server).
  - **Supabase Subdomain**: e.g., `supabase.yourdomain.com` (for database api, real-time gateways, and authentication).
  - **Dedicated LiveKit Subdomain**: e.g., `livekit.yourdomain.com` (for managing WebRTC video/audio and signaling).
    
    > **💡 Why LiveKit needs a dedicated subdomain**: LiveKit runs a high-performance WebRTC engine that manages its own secure WebSockets. It requires dedicated access to standard HTTP (`80`) and HTTPS (`443`) ports to automatically provision Let's Encrypt SSL certificates and process WebRTC signaling. Giving LiveKit its own subdomain prevents port conflicts with your main web server and ensures seamless SSL verification for real-time media streams.

---

### 1. Supabase (Database, Auth, Storage) - Self-Hosted
Drocsid uses Supabase for database management, user authentication, and real-time database updates.

1. **Deploy Supabase**: You can self-host Supabase using Docker. Clone the [Supabase Docker repository](https://github.com/supabase/supabase/tree/master/docker) and follow their instructions to spin up the containers via `docker-compose up -d`.
2. **Run the Schema**: Once your Supabase instance is running and accessible via the studio UI (usually `http://localhost:8000`), navigate to the **SQL Editor** tab. Paste and run the entire contents of the `supabase.sql` file located in the root of this repository. This creates all necessary tables, RLS policies, functions, and triggers.
   > **⚠️ IMPORTANT - Super Admin Setup**: Before running `supabase.sql`, open the file and replace all occurrences of `admin@example.com` with your own email address. This ensures your account is automatically granted Super Admin status and unlimited server creation quotas.
3. **Configure Authentication (Google)**: Go to **Authentication > Providers**. Enable Google and enter your Client ID and Secret. Ensure the Redirect URL is `https://<your-supabase-domain>/auth/v1/callback`.
4. **Storage Buckets**: In Supabase Storage, create the following **public** buckets:
   - `avatars` (User profile pictures)
   - `server-icons` (Server logos)
   - `attachments` (File sharing in messages)
   - `emojis` (Custom server emojis)
5. **Enable Realtime**: Ensure realtime broadcasting is enabled for the `channels`, `messages`, `profiles`, `roles`, and `server_members` tables within the Supabase Database settings.

---

### 2. LiveKit (Voice, Video & Screen Sharing) - Self-Hosted
Drocsid relies on LiveKit's robust WebRTC infrastructure for high-quality audio, video, and screen sharing.

1. **Deploy LiveKit Server**: Use the LiveKit deployment tools (like `livekit-cli generate-config`) or docker-compose to self-host LiveKit. 
2. **Configure TURN Server**: It is **critical** to configure and enable the integrated TURN server feature in LiveKit. WebRTC requires TURN servers to bypass strict enterprise firewalls and NATs for reliable voice/video communication. Ensure your `livekit.yaml` config has `turn` enabled and proper UDP/TCP ports exposed (typically 3478/5349).
3. **Token Generation API**: The Drocsid Node.js backend handles LiveKit token generation. You do not need a separate token server, but you *must* provide the LiveKit API Key and Secret to the Node.js backend so it can generate secure tokens for connecting users.
4. Note down your **API Key**, **API Secret**, and your **WebSocket URL** (e.g., `wss://livekit.your-domain.com`).

---

### 3. Mobile Push Notifications (Expo Push API)
Drocsid mobile (React Native / Expo) uses native Expo Push tokens stored automatically in PostgreSQL (`expo_push_tokens` table) to deliver background push alerts. No external VAPID key generation is needed!

---

### 4. Application Installation & Startup

Once your prerequisites are running, install and configure the Drocsid app:

1. **Clone the repository**:
```bash
git clone https://github.com/your-repo/drocsid.git
cd drocsid
```

2. **Install Dependencies**:
```bash
npm install
```

3. **Configure Environment Variables**:
Copy the example environment file and fill in your self-hosted instance details.
```bash
cp .env.example .env
```
Edit the `.env` file with your credentials:
```env
# ==== Supabase (Self-hosted or Cloud) ====
VITE_SUPABASE_URL=http://localhost:8000 # Your Supabase API URL
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# ==== LiveKit (Self-hosted or Cloud) ====
VITE_LIVEKIT_URL=wss://livekit.yourdomain.com
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# ==== Backend Configuration ====
VITE_BACKEND_URL=http://localhost:3000
PORT=3000
VITE_SUPERADMIN_EMAIL=your_email@domain.com
```

> **💡 Understanding Super Admin (`VITE_SUPERADMIN_EMAIL` vs `supabase.sql`)**:
> - **`supabase.sql`**: Configures PostgreSQL triggers and Row-Level Security (RLS) policies so the database natively trusts your email as an administrator.
> - **`VITE_SUPERADMIN_EMAIL`**: Tells the React frontend interface which user should see the **Super Admin dashboard button** and triggers automatic profile privilege synchronization upon login.
> 
> *Ensure you put the exact same email address in both `supabase.sql` and `.env`.*

4. **Run the Application locally**:
Start the development server (this runs both the Vite frontend and Express backend concurrently):
```bash
npm run dev
```
The application will be accessible at `http://localhost:3000`.

5. **Building for Production**:
To deploy the app to production, build the platform and start the Node process:
```bash
npm run build
npm start
```

## 🏗️ Multi-Instance Architecture

Drocsid is built with a **decentralized mindset**. Unlike platforms that lock you into a single database, Drocsid supports **Multiple Instances**:
- **Switch Backends**: Effortlessly switch between different Supabase backends (e.g., Private, Corporate, Community) via the **Instance Settings** (bottom-left gear icon next to your profile).
- **Independent Data**: Each instance has its own users, servers, and history.
- **Portability**: Your application remains the same, but the "home" it connects to follows you.
- **Local Persistence**: Instances are securely stored in your local browser storage, allowing you to jump between communities in seconds.

## 🛡️ Advanced Security & Hierarchy

Drocsid implements a "Zero-Trust" mindset for server management:
- **Strict Role Ordering**: Roles have an `order` field. Users can only perform actions (Kick, Ban, Mute, Move) on members whose highest role has a *numerically higher* order (lower priority) than their own.
- **Permission Inheritance**: Permissions are additive across all roles assigned to a member.
- **System Constraints**: Even an administrator cannot delete or kick the "Owner" of a server.
- **Audit Logs**: All sensitive actions (channel creation, member bans, limits, etc.) are securely logged in the `server_logs` table for transparency.

## 🛠️ Troubleshooting

If you encounter issues while setting up or running your private Drocsid instance, consult this troubleshooting guide.

### 1. 🔑 Google Auth / Supabase Auth Redirection Fails
* **Symptom:** After clicking "Login with Google", you are redirected to a blank page, or get an error message like `Invalid redirect URI`, or you are redirected back to the wrong domain.
* **Causes:**
  - The Redirect URLs in your Google Cloud Console do not match your Supabase settings.
  - The Redirect URL in your Supabase Auth settings doesn't match where your Drocsid client is hosted.
* **Solutions:**
  * **For Supabase Cloud:**
    1. Go to your **Supabase Dashboard > Authentication > URL Configuration**.
    2. Verify that **Site URL** is set to your frontend application's URL (e.g., `http://localhost:3000` for development or `https://your-drocsid-frontend.domain` for production).
    3. In **Redirect URLs (Additional)**, add your production/dev URLs explicitly (e.g., `http://localhost:3000/**`, `https://your-drocsid-frontend.domain/**`).
  * **For Self-Hosted / Docker Supabase:**
    1. Do not look in the dashboard GUI; self-hosted Auth is configured via the local config files or environment variables.
    2. Open your `docker-compose.yml` or `config.toml` file.
    3. Set/verify the following environment variables (or GoTrue configuration blocks):
       - `GOTRUE_SITE_URL` to your frontend's base URL (e.g., `http://localhost:3000` or `https://your-domain.com`).
       - `GOTRUE_URI_ALLOW_LIST` (or additional redirect URIs) to allow your domains (e.g., `http://localhost:3000/**,https://your-domain.com/**`).
       - `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` and `GOTRUE_EXTERNAL_GOOGLE_SECRET` with your Google Cloud credentials.
       - Ensure `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` or the default redirect matches your setup.
    4. Restart your Docker containers (`docker compose down && docker compose up -d`) to apply config changes.
  * **General Google Cloud Console Setup:**
    - Ensure your Google OAuth Client's **Authorized Redirect URIs** is exactly: `https://<your-supabase-ref-or-domain>/auth/v1/callback`.

---

### 2. 👑 The Super Admin Dashboard Button Does Not Appear
* **Symptom:** You log in, but you don't see the "Super Admin" settings/dashboard button.
* **Causes:**
  - You did not update the default email addresses in `supabase.sql` before running the schema.
  - The `VITE_SUPERADMIN_EMAIL` variable in your `.env` file does not match your logged-in Google/Supabase account email.
* **Solutions:**
  1. Check your `.env` file. Ensure `VITE_SUPERADMIN_EMAIL` is set to your exact email (e.g., `VITE_SUPERADMIN_EMAIL=your_email@gmail.com`).
  2. If you already ran the SQL schema with `admin@example.com` or another address:
     - Open the **Supabase SQL Editor** and execute:
       ```sql
       UPDATE public.profiles
       SET is_super_admin = true, can_create_servers = true, max_servers = 100
       WHERE email = 'your_actual_logged_in_email@domain.com';
       ```
  3. Log out of the Drocsid app and log back in to synchronize your profile and force the frontend to refresh state.

---

### 3. 🎙️ Voice / Video Chat Doesn't Work
* **Symptom:** Connecting to a voice channel fails immediately, is stuck on "Connecting...", or fails to transmit audio/video.
* **Causes:**
  - LiveKit credentials (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VITE_LIVEKIT_URL`) are missing, incorrect, or mismatched.
  - The LiveKit server URL format is incorrect (e.g., missing the `wss://` protocol).
  - The LiveKit server is unreachable or offline.
* **Solutions:**
  1. **Check your protocol:** In your `.env` (or in the Super Admin / Instance Settings), the `VITE_LIVEKIT_URL` must start with **`wss://`** (e.g., `wss://your-livekit-server.com`). Do not use `https://` for the LiveKit URL.
  2. **Verify Credentials:** Ensure `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are properly set in your backend's environmental variables. The backend needs these to sign secure tokens for joining channels.
  3. **Vite Token Endpoint:** Make sure `VITE_LIVEKIT_TOKEN_ENDPOINT` is set to `/api/livekit/token` (which proxies token generation to your Express backend).
  4. Check the browser's developer console (F12) for WebSocket or connection errors.

---

### 4. 🗄️ Storage Buckets: Avatar / Attachment Upload Fails
* **Symptom:** When attempting to upload a server icon, a user avatar, or chat attachments, you get an error message (e.g., "Failed to upload", "Bucket not found", or "403 Forbidden").
* **Causes:**
  - The necessary storage buckets (`avatars`, `attachments`, `server-icons`) were not created in Supabase.
  - The buckets were created but set to "Private" instead of "Public".
  - The Row Level Security (RLS) policies for storage are missing or misconfigured.
* **Solutions:**
  1. Go to **Supabase Storage** in your dashboard.
  2. Create three new buckets: `avatars`, `attachments`, and `server-icons`.
  3. **Crucial:** Make sure to toggle on the **"Public"** setting for each bucket.
  4. Run the storage RLS policies block from `supabase.sql` to ensure authenticated users have permissions to insert/update files in those buckets.

---

### 5. 🔕 Mobile Push Notifications Are Not Delivered
* **Symptom:** Mobile app users (React Native / Expo) do not receive background notifications when mentioned or receiving DMs.
* **Causes:**
  - The user did not grant push notification permissions when prompted on their iOS/Android device.
  - The backend server cannot reach the Expo Push Service (`https://exp.host/--/api/v2/push/send`).
  - The user's device token failed to save into the `expo_push_tokens` database table.
* **Solutions:**
  1. Check device settings (iOS/Android) and ensure notifications are allowed for the Drocsid app.
  2. In Supabase table editor, inspect `expo_push_tokens` to verify that a token exists for the target `user_id`.
  3. Ensure your Node.js backend server has active outgoing internet access so it can communicate with Expo's push relay API.

---

### 6. 🌐 Port & Backend Connection Issues ("Connecting to server..." loop)
* **Symptom:** The client application loads, but stays stuck on a spinner saying "Connecting to server...".
* **Causes:**
  - The `VITE_BACKEND_URL` environment variable is missing, incorrect, or pointing to a different port.
  - The backend server is not running or crashed.
* **Solutions:**
  1. If running locally, check that `VITE_BACKEND_URL` in `.env` is set to `http://localhost:3000` (or whichever port your backend is listening on).
  2. Ensure your backend and frontend are built and running. Check the terminal logs of your `npm run dev` or `node server.ts` process for crash traces.
  3. Check the browser Console/Network tab to verify which URL Socket.io is trying to connect to.

---

### 7. ⚡ Erreur Realtime WebSocket (400 Bad Request)
* **Symptom:** Des erreurs de type `wss://supabase.drocsid.site/realtime/v1/websocket?apikey=... [HTTP/1.1 400 Bad Request]` apparaissent dans la console du navigateur et les mises à jour en temps réel ne fonctionnent pas.
* **Causes:**
  - Les connexions WebSocket exigent un protocole d'échange spécifique appelé *Upgrade Handshake* (la connexion HTTP doit être "surclassée" en WebSocket).
  - Si ton reverse proxy (très probablement Nginx) qui écoute sur `supabase.drocsid.site` n'est pas explicitement configuré pour relayer les en-têtes d'upgrade WebSocket vers ton conteneur Kong (port 8000), Nginx rejette la connexion ou ne la transmet pas correctement, ce qui renvoie une erreur HTTP 400 Bad Request au navigateur.
* **Solutions:**
  - Dans le fichier de configuration Nginx de ton sous-domaine `supabase.drocsid.site` (généralement situé dans `/etc/nginx/sites-available/` ou `/etc/nginx/conf.d/`), assure-toi que les en-têtes d'upgrade sont correctement configurés.
  - Voici le bloc de configuration Nginx idéal pour ton sous-domaine Supabase :
    ```nginx
    server {
        server_name supabase.drocsid.site;

        location / {
            proxy_pass http://localhost:8000; # Redirection vers le Kong de Supabase
            
            # --- CONFIGURATION CRITIQUE POUR LES WEBSOCKETS ---
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            # --------------------------------------------------

            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    ```

---

*Drocsid - Speak freely. Stay anonymous.*
