# Drocsid 🚀

![Drocsid Logo](src/assets/logo.png)

**Drocsid** is a modern communication platform, designed to provide a fluid, secure, and highly customizable experience. Whether for gaming communities, work teams, or groups of friends, Drocsid offers a robust infrastructure built on Electron and Supabase.

## ✨ Key Features

- **💬 Real-Time Messaging**: Instant chat with Markdown support, emojis, and file sharing.
- **🔊 Voice Channels**: Connect instantly via voice with your friends (native WebRTC support via browser/Electron).
- **📊 Interactive Polls**: Create and participate in polls within text channels and DMs, with support for multiple choices and anonymity.
- **🎵 Soundboard**: Express yourself with sounds in voice channels (curated and server-specific).
- **🎬 GIF Picker**: Integrated GIF search to express yourself.
- **🛡️ Role Hierarchy**: Advanced role system with priority ordering (Position). A member with a lower-ranked role cannot perform administrative actions on a higher-ranked member.
- **🔒 Per-Channel Permissions**: Total granular control. Authorize or deny access to any specific channel for each role.
- **🔗 Invite System**: Generate unique invitation codes to grow your community effortlessly.
- **🖥️ Screen Sharing**: (Electron Version) Share your screen or a specific window with other members in the voice channel.
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

# Application URL (used for invitations and sockets)
VITE_BACKEND_URL=http://localhost:3000
```

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

## 📱 Mobile Development (Android)
The Android version is currently **under development** and will be ready soon. It uses Capacitor to provide a native mobile experience.


## 🏗️ Multi-Instance Architecture

Drocsid is built with a **decentralized mindset**. Unlike platforms that lock you into a single database, Drocsid supports **Multiple Instances**:

- **Switch Backends**: Effortlessly switch between different Supabase backends (Private, Corporate, Community).
- **Independent Data**: Each instance has its own users, servers, and history.
- **Portability**: Your application remains the same, but the "home" it connects to follows you.
- **Local Persistence**: Instances are securely stored in your local storage, allowing you to jump between communities in seconds.

## 🚀 Deployment on Render

To deploy the web version of Drocsid on [Render](https://render.com/):

### 1. Create a Web Service
- Connect your GitHub repository to Render.
- Select **Static Site** (or Web Service if you need a proxy, but Static Site is preferred for the Vite build).

### 2. Build Settings
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`

### 3. Environment Variables
Add the following variables in the Render dashboard:
- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase Anon Key.
- `VITE_BACKEND_URL`: The URL where your app is hosted (e.g., `https://drocsid-app.onrender.com`).

### 4. Client-Side Routing (Crucial)
Since Drocsid is a Single Page Application (SPA), ensure you configure **Redirects/Rewrites** in Render:
- **Source**: `/*`
- **Destination**: `/index.html`
- **Action**: Rewrite
- **Status**: 200

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
