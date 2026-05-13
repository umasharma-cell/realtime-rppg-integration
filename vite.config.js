import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.resolve(__dirname, 'vendor');

// Plugin that serves vendor/wiseai-sdk/ at /wiseai-sdk/ URL path.
// This bypasses Vite's public/ restriction entirely.
function serveVendorSDK() {
  return {
    name: 'serve-vendor-sdk',
    // Copy vendor/wiseai-sdk/ into dist/wiseai-sdk/ on build
    closeBundle() {
      const src = path.join(vendorDir, 'wiseai-sdk');
      const dest = path.resolve(__dirname, 'dist', 'wiseai-sdk');
      if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/wiseai-sdk/')) {
          const filePath = path.join(vendorDir, req.url);
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath);
            const mimeTypes = {
              '.js': 'application/javascript',
              '.json': 'application/json',
              '.wasm': 'application/wasm',
              '.bin': 'application/octet-stream',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.setHeader('Access-Control-Allow-Origin', '*');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [serveVendorSDK()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: [/\/wiseai-sdk\//],
    },
  },
});
