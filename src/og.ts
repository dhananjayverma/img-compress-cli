import sharp from 'sharp';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';

// ─── OG Spec Definitions ──────────────────────────────────────────────

export interface OGSpec {
  platform: string;
  name: string;
  width: number;
  height: number;
}

export const OG_SPECS: OGSpec[] = [
  { platform: 'Twitter Card (Summary Large)',  name: 'og-twitter.jpg',    width: 1200, height: 628 },
  { platform: 'Facebook / Open Graph',         name: 'og-facebook.jpg',   width: 1200, height: 630 },
  { platform: 'LinkedIn',                      name: 'og-linkedin.jpg',   width: 1200, height: 627 },
  { platform: 'Discord',                       name: 'og-discord.jpg',    width: 1280, height: 720 },
  { platform: 'WhatsApp Preview',              name: 'og-whatsapp.jpg',   width: 400,  height: 300 },
  { platform: 'Instagram Square',              name: 'og-instagram.jpg',  width: 1080, height: 1080 },
];

// ─── Generator ───────────────────────────────────────────────────────

export interface OGResult {
  generated: { platform: string; name: string; path: string; width: number; height: number }[];
  outputDir: string;
  htmlMeta: string;
}

export async function generateOGImages(
  inputFile: string,
  outputDir: string,
  quality = 85
): Promise<OGResult> {
  await fs.ensureDir(outputDir);

  const generated: OGResult['generated'] = [];
  const baseName = path.basename(inputFile, path.extname(inputFile));

  for (const spec of OG_SPECS) {
    const outPath = path.join(outputDir, `${baseName}-${spec.name}`);

    await sharp(inputFile)
      .resize(spec.width, spec.height, {
        fit: 'cover',
        position: 'attention', // smart crop — focus on subject
      })
      .jpeg({ quality, mozjpeg: true })
      .toFile(outPath);

    generated.push({
      platform: spec.platform,
      name: `${baseName}-${spec.name}`,
      path: outPath,
      width: spec.width,
      height: spec.height,
    });
  }

  // Build HTML meta snippet
  const twitterFile = generated.find((g) => g.name.includes('twitter'));
  const fbFile = generated.find((g) => g.name.includes('facebook'));

  const htmlMeta = `<!-- Open Graph / Social Meta Tags -->
<meta property="og:type"        content="website" />
<meta property="og:title"       content="Your Page Title" />
<meta property="og:description" content="Your page description" />
<meta property="og:image"       content="${fbFile?.name ?? ''}" />
<meta property="og:image:width" content="${fbFile?.width ?? 1200}" />
<meta property="og:image:height" content="${fbFile?.height ?? 630}" />

<!-- Twitter Card -->
<meta name="twitter:card"        content="summary_large_image" />
<meta name="twitter:title"       content="Your Page Title" />
<meta name="twitter:description" content="Your page description" />
<meta name="twitter:image"       content="${twitterFile?.name ?? ''}" />`;

  // Write HTML meta file
  await fs.writeFile(path.join(outputDir, `${baseName}-og-meta.html`), htmlMeta, 'utf-8');

  return { generated, outputDir, htmlMeta };
}

// ─── Printer ──────────────────────────────────────────────────────────

export function printOGResult(result: OGResult): void {
  const accent = chalk.hex('#7C3AED');
  const dim = chalk.dim;

  console.log('\n' + accent.bold('🖼️  Open Graph Images Generated'));
  console.log(dim('────────────────────────────────────────────────────────'));

  result.generated.forEach((g) => {
    console.log(
      `  ${chalk.cyan(g.platform.padEnd(34))} ${g.width}×${g.height}  ${dim(g.name)}`
    );
  });

  console.log(`\n  ${chalk.green(`✔ ${result.generated.length} OG images → ${result.outputDir}`)}`);
  console.log(`  ${dim('+ HTML meta snippet saved (*-og-meta.html)')}`);
  console.log('');
}
