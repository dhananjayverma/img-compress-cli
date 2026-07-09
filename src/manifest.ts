import sharp from 'sharp';
import path from 'path';
import fs from 'fs-extra';

// ─── Manifest Types ───────────────────────────────────────────────────

export interface ManifestEntry {
  source: string;
  webp?: string;
  avif?: string;
  jpg?: string;
  png?: string;
  blurhash?: string;
  lqip?: string;
  dominant?: string;
  sizes: number[];
  width: number;
  height: number;
  aspectRatio: string;
  hasAlpha: boolean;
  srcset?: string;
}

export type AssetManifest = Record<string, ManifestEntry>;

// ─── GCD helper ──────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// ─── Build manifest from a folder ────────────────────────────────────

export async function buildManifest(
  outputDir: string,
  entries: ManifestEntry[]
): Promise<string> {
  const manifest: AssetManifest = {};

  for (const entry of entries) {
    const key = path.basename(entry.source, path.extname(entry.source));
    manifest[key] = entry;
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  await fs.ensureDir(outputDir);
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });

  return manifestPath;
}

// ─── Build a single manifest entry from a source image ───────────────

export async function buildManifestEntry(
  sourcePath: string,
  outputDir: string,
  extras: Partial<Pick<ManifestEntry, 'blurhash' | 'lqip' | 'dominant' | 'sizes' | 'srcset'>> = {}
): Promise<ManifestEntry> {
  const metadata = await sharp(sourcePath).metadata();
  const w = metadata.width ?? 0;
  const h = metadata.height ?? 0;
  const d = gcd(w, h);
  const aspectRatio = d > 0 ? `${w / d}:${h / d}` : 'N/A';

  const ext = path.extname(sourcePath);
  const base = path.basename(sourcePath, ext);

  // Detect generated sibling files
  const toRelative = (f: string) =>
    path.relative(outputDir, f).replace(/\\/g, '/');

  const webpPath = path.join(outputDir, `${base}.webp`);
  const avifPath = path.join(outputDir, `${base}.avif`);
  const jpgPath = path.join(outputDir, `${base}.jpg`);
  const pngPath = path.join(outputDir, `${base}.png`);

  return {
    source: path.relative(outputDir, sourcePath).replace(/\\/g, '/'),
    webp: (await fs.pathExists(webpPath)) ? toRelative(webpPath) : undefined,
    avif: (await fs.pathExists(avifPath)) ? toRelative(avifPath) : undefined,
    jpg: (await fs.pathExists(jpgPath)) ? toRelative(jpgPath) : undefined,
    png: (await fs.pathExists(pngPath)) ? toRelative(pngPath) : undefined,
    width: w,
    height: h,
    aspectRatio,
    hasAlpha: metadata.hasAlpha ?? false,
    sizes: extras.sizes ?? [],
    blurhash: extras.blurhash,
    lqip: extras.lqip,
    dominant: extras.dominant,
    srcset: extras.srcset,
  };
}
