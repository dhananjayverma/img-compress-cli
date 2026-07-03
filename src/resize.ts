import sharp, { type Sharp } from 'sharp';
import type { CompressOptions } from './types.js';

/**
 * Creates a sharp pipeline with optional resize and metadata preservation.
 */
export function createResizePipeline(inputFile: string, options: CompressOptions): Sharp {
  let image = sharp(inputFile, { failOn: 'none' }).rotate();

  if (options.width) {
    image = image.resize({
      width: options.width,
      withoutEnlargement: true,
      fit: 'inside',
    });
  }

  if (options.preserveMetadata) {
    image = image.withMetadata();
  }

  return image;
}
