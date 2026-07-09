import path from 'node:path';
import { compress } from '../index.js';
import type { CompressApiOptions } from '../index.js';

export interface NextPluginPixoraOptions extends CompressApiOptions {
  silent?: boolean;
}

export function withPixora(nextConfig: any = {}, options: NextPluginPixoraOptions = {}) {
  return {
    ...nextConfig,
    webpack(config: any, context: any) {
      // Only run during production build on the server build side once
      if (context.dev === false && context.isServer) {
        const publicDir = path.resolve(process.cwd(), 'public');
        if (!options.silent) {
          console.log(`\n⚡ [next-plugin-pixora] Starting public assets optimization...`);
        }
        // Run compression
        compress(publicDir, {
          quality: options.quality || 80,
          formats: options.formats,
          recursive: true,
          overwrite: true,
          report: options.report ?? false,
          smartQuality: options.smartQuality ?? true,
          ...options,
        }).catch((err) => {
          console.error(`❌ [next-plugin-pixora] Public assets optimization failed:`, err);
        });
      }

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, context);
      }
      return config;
    },
  };
}
