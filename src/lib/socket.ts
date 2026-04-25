import { io } from "socket.io-client";

// Allow overriding the backend URL via environment variable
let backendUrl = window.location.origin;

if (import.meta.env.VITE_BACKEND_URL) {
  backendUrl = import.meta.env.VITE_BACKEND_URL;
} else if (window.location.origin === 'file://') {
  // Fallback for built Electron app if VITE_BACKEND_URL is missing
  backendUrl = 'http://localhost:3000'; 
}

const socket = io(backendUrl, {
  autoConnect: true,
  transports: ['websocket'], // FORCE WebSockets
});

socket.on('connect', () => {
  console.log('Socket connected successfully to:', backendUrl);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message, 'URL:', backendUrl);
});

export default socket;
