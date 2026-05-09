import { io } from "socket.io-client";

// Load initial config from localStorage to support instance switching
const getInitialSocketUrl = () => {
  const currentId = localStorage.getItem('drocsid-current-instance-id') || 'default';
  const instancesRaw = localStorage.getItem('drocsid-instances');
  
  if (instancesRaw) {
    try {
      const instances = JSON.parse(instancesRaw);
      const current = instances.find((i: any) => i.id === currentId);
      if (current) {
        return current.socketUrl;
      }
    } catch (e) {
      console.error('Failed to parse instances for socket initialization', e);
    }
  }

  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  } else if (window.location.origin === 'file://') {
    // Fallback for built Electron app if VITE_BACKEND_URL is missing
    return 'http://localhost:3000'; 
  }
  return window.location.origin;
};

const backendUrl = getInitialSocketUrl();

const socket = io(backendUrl, {
  autoConnect: true,
  transports: ['websocket'], // FORCE WebSockets
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

socket.on('connect', () => {
  console.log('Socket connected successfully to:', backendUrl);
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message, 'URL:', backendUrl);
});

export default socket;
