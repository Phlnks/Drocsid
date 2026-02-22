
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'url';
import { Server as SocketIoServer } from 'socket.io';
import { configureSocket } from './server';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'socket-io-server',
        configureServer: (server) => {
          if (server.httpServer) {
            const io = new SocketIoServer(server.httpServer, {
              cors: { origin: '*' }
            });
            configureSocket(io).catch(err => {
              console.error("Error configuring socket:", err);
            });
          } else {
            console.error("HTTP server is not available.");
          }
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      hmr: false,
    },
  };
});
