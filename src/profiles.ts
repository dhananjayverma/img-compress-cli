import type { CompressOptions } from './types.js';

export interface CompressionProfile {
  quality?: number;
  formats?: string[];
  width?: number;
  smartQuality?: boolean;
}

export const COMPRESSION_PROFILES: Record<string, CompressionProfile> = {
  web: {
    formats: ['webp', 'avif'],
    quality: 75,
    smartQuality: true,
  },
  ecommerce: {
    formats: ['webp'],
    quality: 80,
    smartQuality: false,
  },
  social: {
    formats: ['jpg'],
    quality: 82,
  },
  blog: {
    formats: ['webp'],
    quality: 70,
    smartQuality: true,
  },
  thumbnail: {
    formats: ['webp'],
    quality: 65,
    width: 150,
  },
  print: {
    formats: ['tiff', 'jpg'],
    quality: 95,
  },
};

/**
 * Applies profile settings to options if a valid profile is requested.
 */
export function applyProfile(options: CompressOptions): CompressOptions {
  if (!options.profile) return options;

  const profileName = options.profile.toLowerCase();
  const profile = COMPRESSION_PROFILES[profileName];

  if (!profile) {
    throw new Error(
      `Unknown profile "${options.profile}". Supported profiles: ${Object.keys(COMPRESSION_PROFILES).join(', ')}`
    );
  }

  return {
    ...options,
    quality: options.quality ?? profile.quality,
    formats: options.formats.length > 0 ? options.formats : (profile.formats ?? []),
    width: options.width ?? profile.width,
    smartQuality: options.smartQuality || Boolean(profile.smartQuality),
  };
}
