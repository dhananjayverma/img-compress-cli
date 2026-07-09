import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import { encode } from 'blurhash';

export interface GenerationResult {
  source: string;
  lqip: string;
  blurhash: string;
  dominantColor: {
    primary: string;
    secondary: string;
  };
  responsiveImages: {
    width: number;
    path: string;
  }[];
  htmlSnippet: string;
  jsxSnippet: string;
}

export async function generateAssets(
  inputFile: string,
  outputDir: string
): Promise<GenerationResult> {
  const ext = path.extname(inputFile);
  const baseName = path.basename(inputFile, ext);
  await fs.ensureDir(outputDir);

  // ─── LQIP (Low Quality Image Placeholder) ──────────────────────────
  const lqipBuffer = await sharp(inputFile)
    .resize(20)
    .blur(1.2)
    .jpeg({ quality: 20 })
    .toBuffer();
  const lqip = `data:image/jpeg;base64,${lqipBuffer.toString('base64')}`;

  // ─── BlurHash ──────────────────────────────────────────────────────
  let blurhash = '';
  try {
    const { data, info } = await sharp(inputFile)
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });
    blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
  } catch (err) {
    blurhash = 'L6PZ|Ye.dGs:rqfQfQfQ.Ka|j[fm'; // fallback placeholder hash
  }

  // ─── Dominant Color Extraction ────────────────────────────────────
  let primary = '#FFFFFF';
  let secondary = '#F4F4F4';
  try {
    const { data } = await sharp(inputFile)
      .resize(4, 4, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorsMap: Record<string, number> = {};
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== undefined && data[i+1] !== undefined && data[i+2] !== undefined) {
        const r = data[i]!;
        const g = data[i+1]!;
        const b = data[i+2]!;
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
        colorsMap[hex] = (colorsMap[hex] || 0) + 1;
      }
    }
    const sortedColors = Object.keys(colorsMap).sort((a, b) => colorsMap[b]! - colorsMap[a]!);
    primary = sortedColors[0] || '#FFFFFF';
    secondary = sortedColors[1] || '#F4F4F4';
  } catch {}

  // ─── Responsive Images ─────────────────────────────────────────────
  const widths = [320, 640, 768, 1024, 1440, 1920];
  const responsiveImages: { width: number; path: string }[] = [];
  const metadata = await sharp(inputFile).metadata();
  const originalWidth = metadata.width ?? 1920;

  for (const w of widths) {
    if (w <= originalWidth) {
      const outputFilename = `${baseName}-${w}.webp`;
      const outputPath = path.join(outputDir, outputFilename);
      await sharp(inputFile)
        .resize(w)
        .webp({ quality: 80 })
        .toFile(outputPath);
      responsiveImages.push({ width: w, path: outputPath });
    }
  }

  // ─── Srcset / Snippet construction ────────────────────────────────
  const srcsetName = responsiveImages
    .map((img) => `${path.basename(img.path)} ${img.width}w`)
    .join(', ');

  const defaultImg = responsiveImages[responsiveImages.length - 1] 
    ? path.basename(responsiveImages[responsiveImages.length - 1]!.path) 
    : path.basename(inputFile);

  const htmlSnippet = `<picture>
  <source srcset="${srcsetName}" sizes="(max-width: 768px) 100vw, 50vw" type="image/webp">
  <img src="${defaultImg}" alt="${baseName}" loading="lazy" style="background: ${primary}">
</picture>`;

  const jsxSnippet = `<picture>
  <source srcSet="${srcsetName}" sizes="(max-width: 768px) 100vw, 50vw" type="image/webp" />
  <img src="${defaultImg}" alt="${baseName}" loading="lazy" style={{ background: '${primary}' }} />
</picture>`;

  return {
    source: inputFile,
    lqip,
    blurhash,
    dominantColor: { primary, secondary },
    responsiveImages,
    htmlSnippet,
    jsxSnippet,
  };
}
