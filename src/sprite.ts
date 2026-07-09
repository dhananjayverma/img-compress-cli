import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import { discoverImages } from './utils.js';

export interface SpriteResult {
  spritePath: string;
  cssPath: string;
  cssContent: string;
}

export async function generateSpriteSheet(
  inputFolder: string,
  outputDir: string,
  spriteName = 'sprite'
): Promise<SpriteResult> {
  const files = await discoverImages(inputFolder);
  if (files.length === 0) {
    throw new Error('No images found to compile into sprite sheet.');
  }

  // Load metadata for all images
  const images = await Promise.all(
    files.map(async (file) => {
      const metadata = await sharp(file).metadata();
      return {
        path: file,
        width: metadata.width ?? 64,
        height: metadata.height ?? 64,
      };
    })
  );

  // Stack vertically
  const spriteWidth = Math.max(...images.map((img) => img.width));
  const spriteHeight = images.reduce((sum, img) => sum + img.height, 0);

  let currentY = 0;
  const composites = images.map((img) => {
    const offset = currentY;
    currentY += img.height;
    return {
      input: img.path,
      left: Math.round((spriteWidth - img.width) / 2),
      top: offset,
    };
  });

  const spriteBuffer = await sharp({
    create: {
      width: spriteWidth,
      height: spriteHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const spritePath = path.join(outputDir, `${spriteName}.png`);
  await fs.ensureDir(outputDir);
  await fs.writeFile(spritePath, spriteBuffer);

  // Generate CSS file content
  let cssContent = `.sprite-icon {
  background-image: url('${spriteName}.png');
  background-repeat: no-repeat;
  display: inline-block;
}\n`;

  let currentOffset = 0;
  images.forEach((img) => {
    const name = path.basename(img.path, path.extname(img.path));
    cssContent += `.icon-${name} {
  width: ${img.width}px;
  height: ${img.height}px;
  background-position: -${Math.round((spriteWidth - img.width) / 2)}px -${currentOffset}px;
}\n`;
    currentOffset += img.height;
  });

  const cssPath = path.join(outputDir, `${spriteName}.css`);
  await fs.writeFile(cssPath, cssContent, 'utf-8');

  return { spritePath, cssPath, cssContent };
}
