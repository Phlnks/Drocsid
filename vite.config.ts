
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { Server } from 'socket.io';
import app, { configureSocket } from './server';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'socket-io-and-express',
      configureServer: (server) => {
        // Attach Socket.IO to the HTTP server
        const io = new Server(server.httpServer);
        configureSocket(io);

        // Use the full Express app as middleware
        server.middlewares.use(app);
      }
    }
  ]
});
