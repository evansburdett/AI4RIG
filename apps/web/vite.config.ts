import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // There is one .env, at the repo root, shared by the API and the front end.
  // Without this Vite would look for apps/web/.env and quietly find nothing.
  envDir: repoRoot,
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to 5174, which is how two people
    // end up debugging different servers.
    strictPort: true,
  },
});
