import path from 'node:path';
import { compress } from '../index.js';
import type { CompressApiOptions } from '../index.js';

export interface VitePluginPixoraOptions extends CompressApiOptions {
  /**
   * Targets specific file extensions (default: ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])
   */
  targets?: string[];
  /**
   * Enable/disable logging (default: true)
   */
  silent?: boolean;
}

export function pixoraPlugin(options: VitePluginPixoraOptions = {}) {

  return {
    name: 'vite-plugin-pixora',
    apply: 'build', // Only run during build

    async writeBundle(bundleOptions: any) {
      const outDir = bundleOptions.dir || 'dist';
      const targetDir = path.resolve(process.cwd(), outDir);

      if (!options.silent) {
        console.log(`\n⚡ [vite-plugin-pixora] Starting asset pipeline optimization in: ${outDir}...`);
      }

      try {
        await compress(targetDir, {
          quality: options.quality || 80,
          formats: options.formats,
          recursive: true,
          overwrite: true, // Optimize in-place in dist
          report: options.report ?? true,
          clean: false,
          smartQuality: options.smartQuality ?? true,
          bestFormat: options.bestFormat,
          preserveMetadata: options.preserveMetadata ?? false,
          ignore: options.ignore,
          profile: options.profile,
          plugins: options.plugins,
        });
      } catch (error) {
        console.error(`❌ [vite-plugin-pixora] Optimization failed:`, error);
      }
    },
  };
}
