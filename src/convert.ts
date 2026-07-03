import type { Sharp } from 'sharp';
import type { EncoderOptions } from './types.js';

/**
 * Applies the correct sharp encoder for the target format.
 * Supports: jpg, jpeg, png, webp, avif, tiff.
 */
export function encodeSharp(
  image: Sharp,
  format: string,
  options: EncoderOptions = {},
): Sharp {
  const quality = options.quality ?? 80;

  switch (format) {
    case 'jpg':
    case 'jpeg':
      return image.jpeg({
        quality,
        mozjpeg: true,
        progressive: true,
      });

    case 'webp':
      return image.webp({
        quality,
        effort: 4,
      });

    case 'avif':
      return image.avif({
        quality,
        effort: 4,
      });

    case 'png':
      return image.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
      });

    case 'tiff':
    case 'tif':
      return image.tiff({
        quality,
        compression: 'lzw',
      });

    default:
      throw new Error(`Unsupported output format "${format}".`);
  }
}
