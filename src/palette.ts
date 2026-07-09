import sharp from 'sharp';
import path from 'path';
import chalk from 'chalk';

// ─── Palette Types ────────────────────────────────────────────────────

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  allColors: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Simple median cut palette extraction
function extractPalette(data: Buffer, channels: number, count: number): string[] {
  const buckets: Map<string, number> = new Map();

  for (let i = 0; i < data.length; i += channels) {
    const r = Math.round(data[i]! / 16) * 16;
    const g = Math.round(data[i + 1]! / 16) * 16;
    const b = Math.round(data[i + 2]! / 16) * 16;
    const hex = rgbToHex(r, g, b);
    buckets.set(hex, (buckets.get(hex) ?? 0) + 1);
  }

  // Sort by frequency
  const sorted = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  // Deduplicate with minimum distance threshold
  const unique: string[] = [];
  for (const color of sorted) {
    if (unique.every((u) => colorDistance(u, color) > 40)) {
      unique.push(color);
      if (unique.length >= count) break;
    }
  }

  return unique;
}

// ─── Main Palette Generator ───────────────────────────────────────────

export async function generatePalette(filePath: string): Promise<ColorPalette> {
  const { data, info } = await sharp(filePath)
    .resize(64, 64, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colors = extractPalette(data, info.channels, 10);

  // Sort candidates by luminance for semantic role assignment
  const byLuminance = [...colors].sort((a, b) => {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return luminance(r2, g2, b2) - luminance(r1, g1, b1);
  });

  const lightest = byLuminance[0] ?? '#FFFFFF';
  const darkest = byLuminance[byLuminance.length - 1] ?? '#000000';

  // Primary: most frequent color
  const primary = colors[0] ?? '#6C3EFF';
  // Secondary: second most frequent with enough contrast
  const secondary =
    colors.find((c, i) => i > 0 && colorDistance(c, primary) > 60) ??
    colors[1] ??
    '#A78BFA';
  // Accent: most saturated/vibrant
  const accent =
    colors.find((c) => {
      const [r, g, b] = hexToRgb(c);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return max - min > 80; // high saturation
    }) ??
    colors[2] ??
    '#F59E0B';

  // Background: lightest color
  const background = lightest;
  // Text: darkest color (with minimum contrast)
  const text = darkest;

  return {
    primary,
    secondary,
    accent,
    background,
    text,
    allColors: colors,
  };
}

// ─── Export helpers ───────────────────────────────────────────────────

export function paletteToJson(palette: ColorPalette): string {
  return JSON.stringify(palette, null, 2);
}

export function paletteToCss(palette: ColorPalette): string {
  return `:root {
  --color-primary:    ${palette.primary};
  --color-secondary:  ${palette.secondary};
  --color-accent:     ${palette.accent};
  --color-background: ${palette.background};
  --color-text:       ${palette.text};
}`;
}

export function paletteToTailwind(palette: ColorPalette): string {
  return `// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary:    '${palette.primary}',
        secondary:  '${palette.secondary}',
        accent:     '${palette.accent}',
        background: '${palette.background}',
        text:       '${palette.text}',
      },
    },
  },
};`;
}

// ─── Printer ──────────────────────────────────────────────────────────

export function printPalette(palette: ColorPalette, filePath: string): void {
  const accent = chalk.hex('#7C3AED');
  const dim = chalk.dim;

  console.log('\n' + accent.bold(`🎨 Color Palette: ${path.basename(filePath)}`));
  console.log(dim('────────────────────────────────────────────────────────'));

  const swatch = (label: string, hex: string) => {
    const block = chalk.bgHex(hex)('    ');
    console.log(`  ${block}  ${chalk.bold(label.padEnd(14))} ${hex}`);
  };

  swatch('Primary', palette.primary);
  swatch('Secondary', palette.secondary);
  swatch('Accent', palette.accent);
  swatch('Background', palette.background);
  swatch('Text', palette.text);

  if (palette.allColors.length > 5) {
    console.log(`\n  ${dim('All extracted colors:')}`);
    palette.allColors.forEach((c) => {
      process.stdout.write('  ' + chalk.bgHex(c)('  ') + ' ' + dim(c) + '  ');
    });
    console.log('');
  }

  console.log('');
}
