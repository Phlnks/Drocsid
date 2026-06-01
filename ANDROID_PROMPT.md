# Drocsid Android App Prompt - Native Kotlin/Jetpack Compose

This prompt is optimized for AI Studio Build to create a native Android companion for the Drocsid platform.

---

## The Prompt

"Build a high-performance native Android application for 'Drocsid', a real-time community communication platform. The UI must be optimized for mobile phones and heavily inspired by the Discord Android app (sidebar for server navigation, bottom navigation for Home/DMs/Profile, and a clean channel list).

### Backend Integration:
- Connect to a custom backend using **Supabase** (DB, Auth, Realtime) and **LiveKit** (WebRTC).
- Configurable via `local.properties` or build-time environment variables for pre-configuring the APK with `SUPABASE_URL`, `SUPABASE_KEY`, and `LIVEKIT_URL`.

### Core Features:
- **Rich Text Chat**: Real-time messaging with Markdown, reactions, and image attachments.
- **DMs & Group DMs**: Fully functional private messaging.
- **Voice Channels & Streams**:
    - High-quality audio via LiveKit Android SDK.
    - View remote streams and screen shares (viewer mode only).
- **Foreground Service & Persistent Audio**:
    - Use a persistent `Foreground Service` to keep voice sessions active while the app is in the background or the screen is locked.
    - Implement a `WakeLock` to prevent system sleep during active calls.
- **Sticky Call Notification Controls**:
    - A high-priority system notification during calls containing actionable buttons: **Mute**, **Deafen**, and **Disconnect**.
    - These buttons must interact directly with the foreground service to update the call state without requiring the user to open the app.
- **Wake-up Notifications**:
    - Integrate **Firebase Cloud Messaging (FCM)** for push notifications.
    - Notifications must be structured to "wake up" the device and display even if the app process has been killed.
- **User Settings**: Simple interface for profile management and notification toggles.

### Technical Stack:
- **Kotlin** with **Jetpack Compose**.
- **MVVM Architecture** with StateFlow.
- **Retrofit/Ktor** for API calls.
- **LiveKit Android SDK** for WebRTC.
- **Supabase Kotlin SDK** for real-time synchronization.
"

---

## Technical Considerations for Implementation

1. **Foreground Service**: Necessary for Android 10+ to ensure audio doesn't cut out. Requires `FOREGROUND_SERVICE_MICROPHONE` and `FOREGROUND_SERVICE_PHONE_CALL` (or `TYPE_CONNECTED_DEVICE`) permissions.
2. **Notification Actions**: Use `PendingIntent` with `BroadcastReceiver` or `Service` start commands to handle the Mute/Deafen/Disconnect buttons.
3. **FCM Priority**: Use "high" priority in the FCM payload to ensure the fastest delivery and device wake-up.
4. **Power Management**: Whitelist the app from battery optimizations if necessary for long-running voice sessions.
