import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { compress } from '../src/index.js';

const FIXTURES_DIR = path.join(import.meta.dirname, '__fixtures__');
const OUTPUT_DIR = path.join(import.meta.dirname, '__output__');

async function removeWithRetry(target: string, attempts = 5): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await fs.remove(target);
      return;
    } catch (error) {
      if (index === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// ─── Create test images ─────────────────────────────────────────────

beforeEach(async () => {
  await fs.remove(path.join(process.cwd(), '.pixora'));
});

beforeAll(async () => {
  await fs.ensureDir(FIXTURES_DIR);
  await fs.ensureDir(path.join(FIXTURES_DIR, 'sub'));

  // Create a 200x200 red JPEG
  await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg({ quality: 95 })
    .toFile(path.join(FIXTURES_DIR, 'red.jpg'));

  // Create a 100x100 blue PNG with alpha
  await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } },
  })
    .png()
    .toFile(path.join(FIXTURES_DIR, 'blue.png'));

  // Create a subdirectory image for recursive testing
  await sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
  })
    .jpeg({ quality: 90 })
    .toFile(path.join(FIXTURES_DIR, 'sub', 'green.jpg'));
});

afterAll(async () => {
  await removeWithRetry(OUTPUT_DIR);
});

// ─── Basic compression ──────────────────────────────────────────────

describe('compress API', () => {
  it('compresses JPEG images', async () => {
    const result = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: OUTPUT_DIR,
    });

    expect(result.summary.filesProcessed).toBe(1);
    expect(result.results[0].outputBytes).toBeLessThanOrEqual(result.results[0].inputBytes);

    const outputFile = path.join(OUTPUT_DIR, 'red.jpg');
    expect(await fs.pathExists(outputFile)).toBe(true);

    await fs.remove(OUTPUT_DIR);
  });

  it('converts to WebP format', async () => {
    const result = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: OUTPUT_DIR,
      formats: ['webp'],
    });

    expect(result.results[0].format).toBe('webp');
    const outputFile = path.join(OUTPUT_DIR, 'red.webp');
    expect(await fs.pathExists(outputFile)).toBe(true);

    await fs.remove(OUTPUT_DIR);
  });

  it('converts to AVIF format', async () => {
    const result = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: OUTPUT_DIR,
      formats: ['avif'],
    });

    expect(result.results[0].format).toBe('avif');
    const outputFile = path.join(OUTPUT_DIR, 'red.avif');
    expect(await fs.pathExists(outputFile)).toBe(true);

    await fs.remove(OUTPUT_DIR);
  });

  it('processes folder with multiple images', async () => {
    const result = await compress(FIXTURES_DIR, {
      output: OUTPUT_DIR,
    });

    // Should find at least red.jpg and blue.png (top-level)
    expect(result.summary.filesProcessed).toBeGreaterThanOrEqual(2);

    await fs.remove(OUTPUT_DIR);
  });

  it('handles recursive folder scan', async () => {
    const result = await compress(FIXTURES_DIR, {
      output: OUTPUT_DIR,
      recursive: true,
    });

    // Should find red.jpg, blue.png, AND sub/green.jpg
    expect(result.summary.filesProcessed).toBeGreaterThanOrEqual(3);

    await fs.remove(OUTPUT_DIR);
  });

  it('respects quality option', async () => {
    const highQ = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: path.join(OUTPUT_DIR, 'high'),
      quality: 95,
    });

    await fs.remove(path.join(process.cwd(), '.pixora'));

    const lowQ = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: path.join(OUTPUT_DIR, 'low'),
      quality: 30,
    });

    expect(lowQ.results[0].outputBytes).toBeLessThan(highQ.results[0].outputBytes);

    await fs.remove(OUTPUT_DIR);
  });

  it('resizes images with --width', async () => {
    const result = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: OUTPUT_DIR,
      width: 50,
    });

    const metadata = await sharp(result.results[0].output).metadata();
    expect(metadata.width).toBe(50);

    await fs.remove(OUTPUT_DIR);
  });

  it('supports multi-format output', async () => {
    const result = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: OUTPUT_DIR,
      formats: ['webp', 'avif'],
    });

    expect(result.results.length).toBe(2);
    const formats = result.results.map((r) => r.format).sort();
    expect(formats).toEqual(['avif', 'webp']);

    await fs.remove(OUTPUT_DIR);
  });

  it('dry-run does not write files', async () => {
    const result = await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: OUTPUT_DIR,
      dryRun: true,
    });

    expect(result.summary.filesProcessed).toBe(1);
    expect(await fs.pathExists(OUTPUT_DIR)).toBe(false);
  });

  it('--clean removes output dir before processing', async () => {
    // Create a stale file in output
    await fs.ensureDir(OUTPUT_DIR);
    await fs.writeFile(path.join(OUTPUT_DIR, 'stale.txt'), 'old');

    await compress(path.join(FIXTURES_DIR, 'red.jpg'), {
      output: OUTPUT_DIR,
      clean: true,
    });

    expect(await fs.pathExists(path.join(OUTPUT_DIR, 'stale.txt'))).toBe(false);
    expect(await fs.pathExists(path.join(OUTPUT_DIR, 'red.jpg'))).toBe(true);

    await fs.remove(OUTPUT_DIR);
  });

  it('throws on non-existent input', async () => {
    await expect(
      compress('/does/not/exist', { output: OUTPUT_DIR }),
    ).rejects.toThrow('Input path does not exist');
  });

  it('throws when --overwrite and --output both set', async () => {
    await expect(
      compress(path.join(FIXTURES_DIR, 'red.jpg'), {
        output: OUTPUT_DIR,
        overwrite: true,
      }),
    ).rejects.toThrow('Use either --overwrite or --output');
  });
});
