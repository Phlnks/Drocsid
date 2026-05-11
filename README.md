# Drocsid 🚀

![Drocsid Logo](public/logo.png)

**Drocsid** is a modern communication platform, designed to provide a fluid, secure, and highly customizable experience. Whether for gaming communities, work teams, or groups of friends, Drocsid offers a robust infrastructure built on React, Supabase, and LiveKit.

## ✨ Key Features

- **💬 Real-Time Messaging**: Instant chat with Markdown support, emojis, and file sharing.
- **🔊 Voice Channels & Video**: Connect instantly via voice and video with your friends, powered by LiveKit WebRTC.
- **🖥️ Screen Sharing**: Share your screen or a specific window directly in voice channels or DMs.
- **📊 Interactive Polls**: Create and participate in polls within text channels and DMs.
- **🎵 Soundboard**: Express yourself with sounds in voice channels (curated and server-specific).
- **🎬 GIF Picker**: Integrated GIF search to express yourself.
- **🛡️ Role Hierarchy**: Advanced role system with priority ordering (Position). A member with a lower-ranked role cannot perform administrative actions on a higher-ranked member.
- **🔒 Per-Channel Permissions**: Total granular control. Authorize or deny access to any specific channel for each role.
- **🔗 Invite System**: Generate unique invitation codes to grow your community.
- **🔔 Smart Notifications**: Web Push Notifications, desktop notifications, and sound alerts.
- **🎨 Custom Themes**: Multiple themes (Dark, Indigo, Nature, Matrix, etc.) to adapt the application to your preferences.
- **📱 Responsive**: Works perfectly on mobile, tablet, or desktop via your browser.
- **🖼️ Media Gallery**: Advanced media preview with full-screen gallery support, keyboard navigation, and direct download.
- **👁️ Read Receipts (DM)**: Real-time read indicators showing your friends' avatars on the last message they've read.
- **📝 Personal Notes**: A dedicated space in your DMs to keep track of your own thoughts.

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

## 🛠️ Self-Hosted Deployment Guide

To run your own fully-featured instance of Drocsid, you need a database (Supabase), a WebRTC server (LiveKit), and a Node.js hosting platform (Render).

### 1. Supabase (Database, Auth, Storage)
Drocsid uses Supabase for database management, user authentication, and real-time database updates.
- **Create a project** on [Supabase](https://supabase.com).
- **Run the Schema**: Go to the **SQL Editor** tab in your Supabase dashboard. Paste and run the contents of the `supabase.sql` file located in the root of this repository. This creates all necessary tables, RLS policies, functions, and triggers.
- **Configure Authentication (Google)**: Go to **Authentication > Providers > Google**. Enable it and enter your Client ID and Secret. In your Google Cloud Console, ensure the Redirect URL is `https://<your-project>.supabase.co/auth/v1/callback`.
- **Storage Buckets**: In Supabase Storage, create the following **public** buckets:
  - `avatars` (User profile pictures)
  - `server-icons` (Server logos)
  - `attachments` (File sharing in messages)
  - `emojis` (Custom server emojis)
- **Enable Realtime**: Ensure realtime broadcasting is enabled for the `channels`, `messages`, `profiles`, `roles`, and `server_members` tables.

### 2. LiveKit (Voice, Video & Screen Sharing)
Drocsid relies on LiveKit's robust WebRTC infrastructure for high-quality audio, video, and screen sharing.
- **Create a project** on [LiveKit Cloud](https://cloud.livekit.io/) (or deploy a self-hosted instance).
- Generate a new set of API keys in your LiveKit project settings.
- Note down your **API Key**, **API Secret**, and your **WebSocket URL** (e.g., `wss://<your-project>.livekit.cloud`).

### 3. VAPID Keys (Web Push Notifications)
To enable push notifications for DMs and mentions when the app is running in the background:
- Open a terminal and run: `npx web-push generate-vapid-keys`
- Save the generated **Public Key** and **Private Key**.

### 4. Deploying the Backend on Render
Render will host the Node.js WebSocket backend (used for presence and direct messaging signaling) and serve the built React frontend.
- Create a new **Web Service** on [Render](https://render.com) and connect your GitHub repository.
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment Variables**: Add the following variables in the Render dashboard:

```env
# ==== Supabase ====
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# ==== LiveKit ====
VITE_LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# ==== Web Push Notifications ====
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@your-domain.com

# ==== Backend Configuration ====
VITE_BACKEND_URL=https://<your-render-app>.onrender.com
RENDER=true
PORT=3000
```

That's it! Render will build the Vite frontend and serve it automatically using the Express backend. Your application will be accessible at your Render URL.

## 🚀 Running Locally for Development

If you want to run Drocsid locally on your machine for development:

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your Supabase, LiveKit, and VAPID keys. Set `VITE_BACKEND_URL=http://localhost:3000`.

3. Start the development server (runs both the Vite frontend and Express backend concurrently):
```bash
npm run dev
```

The application will be accessible at `http://localhost:3000`.

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

