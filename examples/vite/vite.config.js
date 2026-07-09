import { defineConfig } from 'vite';
import { pixoraPlugin } from '@dhananjay_verma9546/pixora-compress';

export default defineConfig({
  plugins: [
    pixoraPlugin({
      quality: 75,
      formats: ['webp', 'avif'],
      smartQuality: true,
      silent: false,
    }),
  ],
});
