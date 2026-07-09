import sharp from 'sharp';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';

// ─── Icon Size Specs ──────────────────────────────────────────────────

export interface IconSpec {
  name: string;
  size: number;
  platform: string;
}

export const ANDROID_ICONS: IconSpec[] = [
  { name: 'mipmap-mdpi/ic_launcher.png',    size: 48,  platform: 'Android' },
  { name: 'mipmap-hdpi/ic_launcher.png',    size: 72,  platform: 'Android' },
  { name: 'mipmap-xhdpi/ic_launcher.png',   size: 96,  platform: 'Android' },
  { name: 'mipmap-xxhdpi/ic_launcher.png',  size: 144, platform: 'Android' },
  { name: 'mipmap-xxxhdpi/ic_launcher.png', size: 192, platform: 'Android' },
];

export const IOS_ICONS: IconSpec[] = [
  { name: 'Icon-20.png',      size: 20,  platform: 'iOS' },
  { name: 'Icon-20@2x.png',   size: 40,  platform: 'iOS' },
  { name: 'Icon-20@3x.png',   size: 60,  platform: 'iOS' },
  { name: 'Icon-29.png',      size: 29,  platform: 'iOS' },
  { name: 'Icon-29@2x.png',   size: 58,  platform: 'iOS' },
  { name: 'Icon-29@3x.png',   size: 87,  platform: 'iOS' },
  { name: 'Icon-40.png',      size: 40,  platform: 'iOS' },
  { name: 'Icon-40@2x.png',   size: 80,  platform: 'iOS' },
  { name: 'Icon-60@2x.png',   size: 120, platform: 'iOS' },
  { name: 'Icon-60@3x.png',   size: 180, platform: 'iOS' },
  { name: 'Icon-76.png',      size: 76,  platform: 'iOS' },
  { name: 'Icon-76@2x.png',   size: 152, platform: 'iOS' },
  { name: 'Icon-83.5@2x.png', size: 167, platform: 'iOS' },
  { name: 'Icon-1024.png',    size: 1024, platform: 'iOS' },
];

export const PWA_ICONS: IconSpec[] = [
  { name: 'icon-72.png',   size: 72,  platform: 'PWA' },
  { name: 'icon-96.png',   size: 96,  platform: 'PWA' },
  { name: 'icon-128.png',  size: 128, platform: 'PWA' },
  { name: 'icon-144.png',  size: 144, platform: 'PWA' },
  { name: 'icon-152.png',  size: 152, platform: 'PWA' },
  { name: 'icon-192.png',  size: 192, platform: 'PWA' },
  { name: 'icon-384.png',  size: 384, platform: 'PWA' },
  { name: 'icon-512.png',  size: 512, platform: 'PWA' },
];

export const FAVICON_ICONS: IconSpec[] = [
  { name: 'favicon-16.png',  size: 16,  platform: 'Favicon' },
  { name: 'favicon-32.png',  size: 32,  platform: 'Favicon' },
  { name: 'favicon-48.png',  size: 48,  platform: 'Favicon' },
  { name: 'favicon-96.png',  size: 96,  platform: 'Favicon' },
  { name: 'favicon-196.png', size: 196, platform: 'Favicon' },
];

export const SOCIAL_ICONS: IconSpec[] = [
  { name: 'social-twitter.png',         size: 400,  platform: 'Social' },
  { name: 'apple-touch-icon.png',       size: 180,  platform: 'Social' },
  { name: 'apple-touch-icon-152.png',   size: 152,  platform: 'Social' },
  { name: 'apple-touch-icon-120.png',   size: 120,  platform: 'Social' },
];

export const ALL_ICON_SETS = {
  android: ANDROID_ICONS,
  ios: IOS_ICONS,
  pwa: PWA_ICONS,
  favicon: FAVICON_ICONS,
  social: SOCIAL_ICONS,
};

export type IconPlatform = keyof typeof ALL_ICON_SETS;

// ─── Generator ───────────────────────────────────────────────────────

export interface IconGenerationResult {
  generated: { platform: string; name: string; size: number; path: string }[];
  totalFiles: number;
  outputDir: string;
}

export async function generateIcons(
  inputFile: string,
  outputDir: string,
  platforms: IconPlatform[] = ['android', 'ios', 'pwa', 'favicon', 'social']
): Promise<IconGenerationResult> {
  await fs.ensureDir(outputDir);

  const generated: IconGenerationResult['generated'] = [];

  for (const platform of platforms) {
    const specs = ALL_ICON_SETS[platform];

    for (const spec of specs) {
      const outPath = path.join(outputDir, spec.name);
      await fs.ensureDir(path.dirname(outPath));

      await sharp(inputFile)
        .resize(spec.size, spec.size, {
          fit: 'cover',
          position: 'centre',
        })
        .png({ quality: 100 })
        .toFile(outPath);

      generated.push({
        platform: spec.platform,
        name: spec.name,
        size: spec.size,
        path: outPath,
      });
    }
  }

  // Generate web manifest snippet
  const webManifestIcons = (ALL_ICON_SETS.pwa as IconSpec[]).map((s) => ({
    src: s.name,
    sizes: `${s.size}x${s.size}`,
    type: 'image/png',
  }));

  await fs.writeJson(
    path.join(outputDir, 'icons-manifest.json'),
    { icons: webManifestIcons },
    { spaces: 2 }
  );

  return {
    generated,
    totalFiles: generated.length,
    outputDir,
  };
}

// ─── Printer ──────────────────────────────────────────────────────────

export function printIconResult(result: IconGenerationResult): void {
  const accent = chalk.hex('#7C3AED');
  const dim = chalk.dim;

  console.log('\n' + accent.bold('📱 App Icon Generation Complete'));
  console.log(dim('────────────────────────────────────────────────────────'));

  const byPlatform = new Map<string, typeof result.generated>();
  for (const g of result.generated) {
    if (!byPlatform.has(g.platform)) byPlatform.set(g.platform, []);
    byPlatform.get(g.platform)!.push(g);
  }

  for (const [platform, icons] of byPlatform.entries()) {
    console.log(`\n  ${chalk.cyan.bold(platform)} (${icons.length} icons)`);
    icons.forEach((icon) => {
      console.log(`    ${chalk.dim(icon.name.padEnd(40))} ${icon.size}×${icon.size}px`);
    });
  }

  console.log(`\n  ${chalk.green(`✔ Generated ${result.totalFiles} icons → ${result.outputDir}`)}`);
  console.log(`  ${dim('+ icons-manifest.json (Web App Manifest ready)')}`);
  console.log('');
}
