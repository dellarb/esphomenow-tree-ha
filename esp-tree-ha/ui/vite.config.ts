import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

const gitHash = process.env.GIT_HASH || execSync('git rev-parse --short HEAD 2>/dev/null || echo unknown').toString().trim();
const gitDate = process.env.GIT_DATE || execSync('git log -1 --format=%cI 2>/dev/null || echo unknown').toString().trim();

export default defineConfig({
  base: process.env.VITE_BASE || './',
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
    __GIT_DATE__: JSON.stringify(gitDate),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
});
