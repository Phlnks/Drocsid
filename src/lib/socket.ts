import { io } from "socket.io-client";

// Allow overriding the backend URL via environment variable (useful for Electron client)
// Fallback to window.location.origin for the web version
// In an Electron app, window.location.origin is 'file://', so we MUST use the remote URL
const backendUrl = import.meta.env.VITE_BACKEND_URL || (window.location.origin === 'file://' ? 'https://ais-dev-fcluti2ud4ygfukrtj5tcb-10217813119.europe-west1.run.app' : window.location.origin);

const socket = io(backendUrl, {
  autoConnect: true,
});

export default socket;
