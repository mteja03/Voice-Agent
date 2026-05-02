import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'fs';
import { join } from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      // Vite blocks dynamic import() of .mjs files that live in /public.
      // This plugin intercepts those requests before Vite's middleware and
      // streams them as plain JS so onnxruntime-web can load them at runtime.
      name: 'serve-vad-mjs-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0];
          if (url.startsWith('/vad/') && url.endsWith('.mjs')) {
            const filePath = join(process.cwd(), 'public', url);
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    headers: {
      // Required for WASM SharedArrayBuffer (used by onnxruntime / VAD)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
