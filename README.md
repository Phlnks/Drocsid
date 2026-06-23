# Drocsid 🚀

![Drocsid Logo](public/logo.png)

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
- **Notifications**: Web-Push (VAPID).
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
- A domain name (for production WebRTC/HTTPS requirements)

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

### 3. VAPID Keys (Web Push Notifications)
To enable push notifications for DMs and mentions when the app is running in the background:
- Open a terminal and run: `npx web-push generate-vapid-keys`
- Save the generated **Public Key** and **Private Key**.

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

# ==== Web Push Notifications ====
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@yourdomain.com

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

---

*Drocsid - Communicate without limits.*

