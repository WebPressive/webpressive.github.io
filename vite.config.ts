import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // For GitHub Pages: if deploying to a repository (not user/organization site),
    // set base to '/repository-name/', otherwise use '/'
    // This will be overridden by environment variable if set
    // For WebPressive organization: https://webpressive.github.io/webpressive/
    const base = process.env.GITHUB_PAGES_BASE || '/webpressive/';
    
    return {
      base: base,
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
      }
    };
});
