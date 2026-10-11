import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // For GitHub Pages: if deploying to a repository (not user/organization site),
    // set base to '/repository-name/', otherwise use '/'
    // This will be overridden by environment variable if set
    // For WebPressive organization main site: https://webpressive.github.io
    const base = process.env.GITHUB_PAGES_BASE || '/';
    
    return {
      base: base,
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // The speech worker (live transcript) is an ES module worker
      worker: {
        format: 'es',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          // The live transcript runs ONNX Runtime on WebAssembly only: its WebGPU build would add 27 MB
          'onnxruntime-web/webgpu': 'onnxruntime-web/wasm',
        }
      },
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
      }
    };
});
