# Drocsid 🚀

![Drocsid Logo](src/assets/logo.png)

**Drocsid** is a modern communication platform, designed to provide a fluid, secure, and highly customizable experience. Whether for gaming communities, work teams, or groups of friends, Drocsid offers a robust infrastructure built on Electron and Supabase.

## ✨ Key Features

- **💬 Real-Time Messaging**: Instant chat with Markdown support, emojis, and file sharing.
- **🔊 Voice & Video (LiveKit)**: High-performance voice and video infrastructure powered by LiveKit SFU. Supports hundreds of participants with low latency.
- **🖥️ Screen Sharing**: Share your screen or a specific window with other members in high definition (1080p/60fps support).
- **📊 Interactive Polls**: Create and participate in polls within text channels and DMs, with support for multiple choices and anonymity.
- **🎵 Soundboard**: Express yourself with sounds in voice channels (curated and server-specific).
- **🎬 GIF Picker**: Integrated GIF search to express yourself.
- **🛡️ Role Hierarchy**: Advanced role system with priority ordering (Position). A member with a lower-ranked role cannot perform administrative actions on a higher-ranked member.
- **🔒 Per-Channel Permissions**: Total granular control. Authorize or deny access to any specific channel for each role.
- **🔗 Invite System**: Generate unique invitation codes to grow your community effortlessly.
- **📱 Private Calls**: Direct calling system for DMs with custom ringtones (double tone) and 4-second pattern.
- **🔔 Smart Notifications**: Customizable desktop notifications and sound alerts.
- **🎨 Custom Themes**: Multiple themes (Dark, Indigo, Nature, Matrix, etc.) to adapt the application to your preferences.
- **📱 Responsive & Desktop**: Works perfectly on mobile, tablet, or desktop via your browser or as a native application via Electron.
- **🖼️ Media Gallery**: Advanced media preview with full-screen gallery support, keyboard navigation, and direct download.
- **👁️ Read Receipts (DM)**: Real-time read indicators showing your friends' avatars on the last message they've read.
- **📝 Personal Notes**: A dedicated space ("Mes notes") in your DMs to keep track of your own thoughts.
- **👥 Categorized Member List**: Server members are automatically grouped by roles, respecting the hierarchy.
- **🌍 Multi-language Support**: Full support for English, French, and Spanish.
- **👥 Multi-Account Support**: Easily switch between accounts via the login screen.

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
- **Dynamic Updates**: Real-time updates of the interface without needing a page refresh.

## 🛠️ Backend Setup (Supabase)

Drocsid uses **Supabase** for database management, authentication, and real-time updates.

### 1. Create a Supabase Project
- Go to [supabase.com](https://supabase.com/) and create a new project.

### 2. Configure the Database
- Access the **SQL Editor** tab in your Supabase dashboard.
- Copy and paste the contents of the `supabase.sql` file (found in the root of this project) into the SQL editor.
- Run the query to create all necessary tables, Row Level Security (RLS) policies, and functions.

### 3. Configure Authentication (Google Login)
- Go to **Authentication** -> **Providers** -> **Google**.
- Enable Google provider and enter your Client ID and Secret.
- **Important**: In the **Redirect URL** field of your Google Cloud Console, add: `https://your-project.supabase.co/auth/v1/callback`.
- Also ensure that in Supabase **Authentication** -> **URL Configuration**, the **Site URL** is set to your application URL (e.g., `http://localhost:3000`) and add it to the **Redirect URLs** list.

### 4. Enable Realtime
- Access the **SQL Editor** tab in your Supabase dashboard and run:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE messages, profiles, server_members, roles, channels;
  ```
- Or ensure that **Realtime** is enabled for these tables under Database -> Replication.

## ⚙️ Environment Configuration

Rename the `.env.example` file to `.env` (or create a new one) and fill in the following variables:

```env
# Your Supabase Project URL
VITE_SUPABASE_URL=https://your-project.supabase.co
# Public Anonymous API Key
VITE_SUPABASE_PUBLISHABLE_KEY=your_public_key
# Service Role Key (Required for the Node.js backend to clean up dead voice calls)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application URL (used for invitations and sockets)
VITE_BACKEND_URL=http://localhost:3000

# LiveKit (Voice/Video) Configuration
# Global fallback if not defined in the instance settings
# For Windows app, ensure VITE_LIVEKIT_TOKEN_ENDPOINT points to your hosted backend URL
VITE_LIVEKIT_URL=wss://your-livekit-server.com
VITE_LIVEKIT_TOKEN_ENDPOINT=http://localhost:3000/api/livekit/token
```

## 🛠️ Setting up your own Supabase Instance

If you want to host Drocsid on your own infrastructure (avoiding free-tier quotas), follow these steps:

1. **Local/Self-Hosted Setup**: You can use the [Supabase CLI](https://supabase.com/docs/guides/cli) to run a local instance using Docker:
   - Run `supabase init` in the root (requires Supabase CLI).
   - Use the provided `supabase.sql` file to initialize your schema.
2. **Schema Deployment**: 
   - Copy the SQL from `supabase.sql`.
   - Paste it into your Supabase SQL Editor and run it. This creates all tables, RLS policies, and triggers.
3. **Storage Buckets**: Ensure you create the following public buckets in your Supabase storage:
   - `avatars`: For user profile pictures.
   - `server-icons`: For server logos.
   - `attachments`: For message file sharing.
   - `emojis`: For custom server emojis.
4. **Realtime Configuration**: Ensure "Broadcast" and "Presence" are enabled in your project settings to support the live member list and voice signaling.

## 🛠️ Setting up your own LiveKit Server

To have full control over your voice and video infrastructure:

1. **Self-Hosting (Docker)**: You can easily run LiveKit on your own server using Docker:
   - Follow the [LiveKit Deployment Guide](https://docs.livekit.io/realtime/self-hosting/deployment/).
2. **Token Generation**:
   - LiveKit requires a JWT token for clients to join a room.
   - We recommend using a dedicated API or your own backend to handle token distribution securely.
   - Drocsid is pre-configured to fetch tokens from the endpoint specified in `VITE_LIVEKIT_TOKEN_ENDPOINT`.
3. **Frontend Integration**:
   - Set `VITE_LIVEKIT_URL` to your LiveKit server's WebSocket address (e.g., `wss://livekit.mydomain.com`).
   - Set `VITE_LIVEKIT_TOKEN_ENDPOINT` to your backend's API endpoint (e.g., `https://drocsid-api.mydomain.com/api/livekit/token`).

## 🆕 First-Time Setup & Instances

Drocsid features a specialized **Instance Setup Screen** for new users:

1. **Initial Launch**: If no environment variables are defined or if it's your first time, you'll be greeted by the Setup Screen.
2. **Configuration**: Enter your custom Instance Name, Supabase URL, and Anon Key.
3. **Multi-Instance**: You can add multiple instances (e.g., "Work", "Gaming", "Development") via the **Instance Settings** (bottom-left gear icon next to your profile).
4. **Switching**: Click on the instances in the settings to switch between different backends instantly.
5. **Persistence**: All instances are stored locally in your browser/app data.

## 🚀 Running the Server

Once dependencies are installed (`npm install`), you can start the application:

### Development Mode (Browser)
```bash
npm run dev
```
The application will be accessible at `http://localhost:3000`.

### Desktop Mode (Electron)
```bash
npm run electron:dev
```

### Build for Production
```bash
# For web deployment
npm run build

# For Windows installer (Electron)
npm run electron:build
```

## 📱 Mobile Experience
Drocsid is fully responsive and optimized for mobile devices:
- **Instant Browser Access**: No installation required! Simply open your instance URL in your mobile browser (Chrome, Safari, etc.) for a native-like experience.
- **Android App**: Currently under development, using Capacitor for a focused native mobile experience.
- **Windows App**: You can access the official installer for Windows by visiting the `/download` page of your application.


## 🎙️ LiveKit Integration

Drocsid has evolved from basic Peer-to-Peer WebRTC to a professional **SFU (Selective Forwarding Unit)** architecture powered by **LiveKit**.

### Why LiveKit?
1. **Scalability**: Unlike P2P which slows down with 3+ people, LiveKit handles hundreds of participants by managing streams on the server.
2. **Quality & Stability**: Advanced jitter buffering and packet loss concealment for a "Discord-like" audio experience.
3. **Screen Sharing**: Native support for high-quality screen sharing with automatic bitrate adaptation.

### Configuration
LiveKit can be configured at two levels:
*   **Global (Environment)**: Defined in `.env` for the main application deployment.
*   **Per-Instance (User Settings)**: Advanced users can go to **Instance Settings** and provide a specific LiveKit URL and Token Endpoint for that particular instance. This allows for total infrastructure isolation between communities.

The Token Endpoint should be a POST API that returns a JSON object: `{ "token": "..." }`.

## 🏗️ Multi-Instance Architecture

Drocsid is built with a **decentralized mindset**. Unlike platforms that lock you into a single database, Drocsid supports **Multiple Instances**:

- **Switch Backends**: Effortlessly switch between different Supabase backends (Private, Corporate, Community).
- **Independent Infrastructure**: Custom Supabase URL, Socket URL, and **LiveKit Endpoint** can be defined per-instance.
- **Independent Data**: Each instance has its own users, servers, and history.
- **Portability**: Your application remains the same, but the "home" it connects to follows you.
- **Local Persistence**: Instances are securely stored in your local storage, allowing you to jump between communities in seconds.

## 🚀 Deployment on Render

To deploy the full-stack version of Drocsid on [Render](https://render.com/):

### 1. Create a Web Service
- Connect your GitHub repository to Render.
- Select **Web Service** (Drocsid runs a Node.js backend using Express and Socket.io for WebRTC signaling).

### 2. Build Settings
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### 3. Environment Variables
Add the following variables in the Render dashboard under your Web Service:
- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase Anon Key.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key (needed for the backend to clean up Socket.io calls).
- `VITE_BACKEND_URL`: The URL where your app is hosted (e.g., `https://drocsid-app.onrender.com`).
- `VITE_LIVEKIT_URL`: Your LiveKit Server URL (`wss://...`).
- `VITE_LIVEKIT_TOKEN_ENDPOINT`: Your hosted backend token URL (e.g., `https://drocsid-app.onrender.com/api/livekit/token`).
- `RENDER`: `true`

And that's it! Render will build the Vite frontend and serve it automatically using the Node backend.

## 🛡️ Advanced Security & Hierarchy

Drocsid implements a "Zero-Trust" mindset for server management:

- **Strict Role Ordering**: Roles have an `order` field. Users can only perform actions (Kick, Ban, Mute, Move) on members whose highest role has a *numerically higher* order (lower priority) than their own.
- **Permission inheritance**: Permissions are additive across all roles assigned to a member.
- **System Constraints**: Even an administrator cannot delete the "Owner" of a server.
- **Audit Logs**: All sensitive actions (channel creation, member bans, etc.) are logged in the `server_logs` table for transparency.

## 🤝 Connecting to a Private Backend & Quotas

Since Drocsid is designed to be self-hosted if needed:
1. Deploy your own Supabase instance (Cloud or Docker).
2. Configure your environment variables in the application to point to your instance (as explained above).
3. Generated invitation codes will automatically use the address defined in `VITE_BACKEND_URL` to ensure your members join the correct server.

> [!TIP]
> **Supabase Quotas**: The free tier of Supabase has a daily egress quota. If you notice connection issues or slow performance, it might be due to this limit. You can easily overcome this by hosting the application on your own Supabase instance, allowing for a completely free and independent setup without limits.

---
*Drocsid - Communicate without limits.*
