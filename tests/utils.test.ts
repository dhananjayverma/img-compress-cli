import { describe, it, expect } from 'vitest';
import {
  parseSize,
  formatBytes,
  formatPercent,
  replaceExt,
  normalizeFormatName,
  isSameImageFormat,
  isSupportedImage,
  isAnimatedGif,
  normalizeIgnorePatterns,
  resolveTargetFormats,
  getOutputRoot,
  buildOutputPath,
  getDefaultConcurrency,
  buildStatsSummary,
} from '../src/utils.js';
import type { CompressOptions } from '../src/types.js';

// ─── parseSize ───────────────────────────────────────────────────────

describe('parseSize', () => {
  it('parses kilobytes', () => {
    expect(parseSize('300kb')).toBe(300 * 1024);
  });

  it('parses megabytes', () => {
    expect(parseSize('2mb')).toBe(2 * 1024 * 1024);
  });

  it('parses bytes', () => {
    expect(parseSize('1024b')).toBe(1024);
  });

  it('parses plain number as bytes', () => {
    expect(parseSize('500')).toBe(500);
  });

  it('is case insensitive', () => {
    expect(parseSize('300KB')).toBe(300 * 1024);
    expect(parseSize('2MB')).toBe(2 * 1024 * 1024);
  });

  it('returns undefined for empty/null', () => {
    expect(parseSize(undefined)).toBeUndefined();
    expect(parseSize(null)).toBeUndefined();
    expect(parseSize('')).toBeUndefined();
  });

  it('throws on invalid input', () => {
    expect(() => parseSize('abc')).toThrow('Invalid size value');
  });

  it('handles decimals', () => {
    expect(parseSize('1.5mb')).toBe(Math.round(1.5 * 1024 * 1024));
  });
});

// ─── formatBytes ─────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(2048)).toBe('2.00 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });

  it('handles 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('handles NaN/Infinity', () => {
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });
});

// ─── formatPercent ───────────────────────────────────────────────────

describe('formatPercent', () => {
  it('formats percentages', () => {
    expect(formatPercent(45.678)).toBe('45.7%');
  });

  it('handles NaN', () => {
    expect(formatPercent(NaN)).toBe('0%');
  });
});

// ─── replaceExt ──────────────────────────────────────────────────────

describe('replaceExt', () => {
  it('replaces extension', () => {
    expect(replaceExt('/path/photo.jpg', '.webp')).toBe('/path/photo.webp');
  });

  it('handles no dot prefix', () => {
    expect(replaceExt('/path/photo.jpg', 'png')).toBe('/path/photo.png');
  });
});

// ─── normalizeFormatName ─────────────────────────────────────────────

describe('normalizeFormatName', () => {
  it('normalizes jpeg to jpg', () => {
    expect(normalizeFormatName('jpeg')).toBe('jpg');
    expect(normalizeFormatName('JPEG')).toBe('jpg');
  });

  it('keeps other formats lowercase', () => {
    expect(normalizeFormatName('WebP')).toBe('webp');
    expect(normalizeFormatName('PNG')).toBe('png');
  });
});

// ─── isSameImageFormat ───────────────────────────────────────────────

describe('isSameImageFormat', () => {
  it('treats jpg and jpeg as same', () => {
    expect(isSameImageFormat('jpg', 'jpeg')).toBe(true);
  });

  it('detects different formats', () => {
    expect(isSameImageFormat('jpg', 'png')).toBe(false);
  });
});

// ─── isSupportedImage ────────────────────────────────────────────────

describe('isSupportedImage', () => {
  it('supports common formats', () => {
    expect(isSupportedImage('photo.jpg')).toBe(true);
    expect(isSupportedImage('photo.jpeg')).toBe(true);
    expect(isSupportedImage('photo.png')).toBe(true);
    expect(isSupportedImage('photo.webp')).toBe(true);
    expect(isSupportedImage('photo.avif')).toBe(true);
    expect(isSupportedImage('photo.gif')).toBe(true);
  });

  it('rejects unsupported formats', () => {
    expect(isSupportedImage('doc.txt')).toBe(false);
    expect(isSupportedImage('image.svg')).toBe(false);
    expect(isSupportedImage('style.css')).toBe(false);
  });
});

// ─── isAnimatedGif ───────────────────────────────────────────────────

describe('isAnimatedGif', () => {
  it('detects .gif extension', () => {
    expect(isAnimatedGif('animation.gif')).toBe(true);
    expect(isAnimatedGif('animation.GIF')).toBe(true);
  });

  it('rejects non-gif', () => {
    expect(isAnimatedGif('photo.jpg')).toBe(false);
  });
});

// ─── normalizeIgnorePatterns ─────────────────────────────────────────

describe('normalizeIgnorePatterns', () => {
  it('splits comma-separated string', () => {
    expect(normalizeIgnorePatterns('*.svg,*.ico')).toEqual(['*.svg', '*.ico']);
  });

  it('handles array input', () => {
    expect(normalizeIgnorePatterns(['*.svg', '*.ico'])).toEqual(['*.svg', '*.ico']);
  });

  it('returns empty for undefined', () => {
    expect(normalizeIgnorePatterns(undefined)).toEqual([]);
  });
});

// ─── resolveTargetFormats ────────────────────────────────────────────

describe('resolveTargetFormats', () => {
  const baseOptions = {
    input: '.',
    recursive: false,
    overwrite: false,
    report: false,
    watch: false,
    dryRun: false,
    clean: false,
    smartQuality: false,
    preserveMetadata: false,
    concurrency: 4,
    ignore: [],
    formats: [],
  } satisfies CompressOptions;

  it('uses source format when no formats specified', () => {
    expect(resolveTargetFormats('photo.jpg', baseOptions)).toEqual(['jpg']);
  });

  it('uses specified formats', () => {
    expect(
      resolveTargetFormats('photo.jpg', { ...baseOptions, formats: ['webp', 'avif'] }),
    ).toEqual(['webp', 'avif']);
  });

  it('deduplicates formats', () => {
    expect(
      resolveTargetFormats('photo.jpg', { ...baseOptions, formats: ['webp', 'webp'] }),
    ).toEqual(['webp']);
  });
});

// ─── getOutputRoot ───────────────────────────────────────────────────

describe('getOutputRoot', () => {
  it('returns null when overwrite is true', () => {
    expect(getOutputRoot('/input', undefined, true)).toBeNull();
  });

  it('returns resolved output dir', () => {
    const result = getOutputRoot('/input', '/out', false);
    expect(result).toBe('/out');
  });
});

// ─── buildOutputPath ─────────────────────────────────────────────────

describe('buildOutputPath', () => {
  it('returns source path when overwrite', () => {
    expect(
      buildOutputPath({
        inputRoot: '/images',
        sourceFile: '/images/photo.jpg',
        outputRoot: null,
        targetFormat: 'jpg',
        overwrite: true,
      }),
    ).toBe('/images/photo.jpg');
  });

  it('adds -compressed suffix for same format', () => {
    const result = buildOutputPath({
      inputRoot: '/images',
      sourceFile: '/images/photo.jpg',
      outputRoot: null,
      targetFormat: 'jpg',
      overwrite: false,
    });
    expect(result).toContain('photo-compressed.jpg');
  });

  it('changes extension for different format', () => {
    const result = buildOutputPath({
      inputRoot: '/images',
      sourceFile: '/images/photo.jpg',
      outputRoot: null,
      targetFormat: 'webp',
      overwrite: false,
    });
    expect(result).toContain('photo.webp');
  });
});

// ─── getDefaultConcurrency ───────────────────────────────────────────

describe('getDefaultConcurrency', () => {
  it('uses provided value', () => {
    expect(getDefaultConcurrency(4)).toBe(4);
  });

  it('falls back to CPU count', () => {
    const result = getDefaultConcurrency();
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(8);
  });

  it('rejects negative values', () => {
    const result = getDefaultConcurrency(-1);
    expect(result).toBeGreaterThanOrEqual(1);
  });
});

// ─── buildStatsSummary ───────────────────────────────────────────────

describe('buildStatsSummary', () => {
  it('calculates correct summary', () => {
    const summary = buildStatsSummary([
      { source: 'a.jpg', output: 'a.webp', format: 'webp', inputBytes: 1000, outputBytes: 500 },
      { source: 'b.jpg', output: 'b.webp', format: 'webp', inputBytes: 2000, outputBytes: 800 },
    ]);

    expect(summary.filesProcessed).toBe(2);
    expect(summary.inputBytes).toBe(3000);
    expect(summary.outputBytes).toBe(1300);
    expect(summary.savedBytes).toBe(1700);
    expect(summary.savedPercent).toBeCloseTo(56.67, 1);
  });

  it('handles empty results', () => {
    const summary = buildStatsSummary([]);
    expect(summary.filesProcessed).toBe(0);
    expect(summary.savedBytes).toBe(0);
  });

  it('counts skipped files', () => {
    const summary = buildStatsSummary([
      {
        source: 'a.gif',
        output: 'a.gif',
        format: 'gif',
        inputBytes: 1000,
        outputBytes: 1000,
        skipped: true,
        skipReason: 'animated GIF',
      },
    ]);
    expect(summary.filesSkipped).toBe(1);
    expect(summary.filesProcessed).toBe(0);
  });
});
