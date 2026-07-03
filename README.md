# ⚡ pixora-compress

> Fast, cross-platform, zero-config image compression CLI built on [sharp](https://sharp.pixelplumbing.com/).

[![npm version](https://img.shields.io/npm/v/@dhananjay_verma9546/pixora-compress.svg?style=flat-square&color=7C3AED)](https://www.npmjs.com/package/@dhananjay_verma9546/pixora-compress)
[![license](https://img.shields.io/npm/l/@dhananjay_verma9546/pixora-compress.svg?style=flat-square)](LICENSE)
[![node](https://img.shields.io/node/v/@dhananjay_verma9546/pixora-compress.svg?style=flat-square)](package.json)

Compress, resize, and convert images to modern formats — WebP, AVIF, optimized JPEG & PNG — with a single command. Built for developers who want fast asset optimization in their build pipelines.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🚀 **Blazing fast** | Parallel processing with configurable concurrency |
| 📦 **Zero config** | Works out of the box — just point at a folder |
| 🖼️ **Multi-format** | JPEG, PNG, WebP, AVIF, TIFF output |
| 📐 **Smart resize** | Width-based resize without enlargement |
| 🎯 **Target size** | Binary-search quality to hit `--max-size 300kb` |
| 🧠 **Smart quality** | Auto-detect optimal quality per image |
| 📂 **Recursive** | Scan nested folders, preserve directory structure |
| 👀 **Watch mode** | Auto-compress on file changes (fs.watch) |
| 📊 **Reports** | Beautiful before/after size comparison table |
| 🏃 **Dry run** | Preview output without writing files |
| 🔧 **Config files** | `img-compress.config.js`, `.img-compressrc.json`, etc. |
| 📡 **Programmatic API** | Use in Node.js scripts and build pipelines |
| 🏷️ **Metadata** | Preserve or strip EXIF/IPTC/XMP metadata |

---

## 📥 Install

```bash
# Global install
npm install -g @dhananjay_verma9546/pixora-compress

# Or use directly with npx
npx @dhananjay_verma9546/pixora-compress ./images
```

---

## 🚀 Quick Start

```bash
# Compress all images in a folder
img-compress ./images

# Convert to WebP with custom quality
img-compress ./images --webp --quality 75

# Multi-format output to a specific directory
img-compress ./images --output ./dist --webp --avif --width 1920

# Target a specific file size
img-compress ./images --max-size 300kb --report

# Watch for changes
img-compress ./images --output ./optimized --watch
```

---

## 📋 All Options

| Option | Description | Default |
|---|---|---|
| `<folder-or-file>` | Input path (required) | — |
| `-o, --output <dir>` | Write results to a directory | `*-compressed` |
| `-w, --width <px>` | Resize to max width (no enlargement) | — |
| `-q, --quality <1-100>` | Target quality | `82` (jpg), `55` (avif) |
| `--max-size <size>` | Target output size (`300kb`, `2mb`) | — |
| `--webp` | Output WebP format | — |
| `--avif` | Output AVIF format | — |
| `--format <list>` | Comma-separated formats (`jpg,webp,avif`) | source format |
| `--recursive` | Scan subfolders | `true` for folders |
| `--ignore <patterns>` | Comma-separated glob ignore patterns | — |
| `--overwrite` | Replace original files in place | `false` |
| `--report` | Print detailed size report table | `false` |
| `--watch` | Watch for changes and re-compress | `false` |
| `--dry-run` | Preview without writing files | `false` |
| `--clean` | Remove output directory first | `false` |
| `--smart-quality` | Auto-detect optimal quality per image | `false` |
| `--preserve-metadata` | Keep EXIF/IPTC/XMP metadata | `false` |
| `--concurrency <n>` | Parallel workers | CPU count (max 8) |

---

## 📊 Report Output

Use `--report` for a detailed per-file comparison:

```
  📊 Compression Report
  ────────────────────────────────────────────────────────────────────────
  File                             Input      Output       Saved  Format
  ────────────────────────────────────────────────────────────────────────
  hero.jpg                        2.4 MB     412 KB     -82.8%   webp
  banner.png                      1.1 MB     198 KB     -82.4%   webp
  logo.png                         45 KB      12 KB     -73.3%   webp
  ────────────────────────────────────────────────────────────────────────
  Total                           3.55 MB    622 KB     -2.95 MB
                                                         -82.9%
```

---

## 🔧 Config File

Create `img-compress.config.js` in your project root:

```js
export default {
  quality: 75,
  recursive: true,
  output: './dist/images',
  formats: ['webp', 'avif'],
  ignore: ['*.svg', '*.ico'],
  preserveMetadata: false,
  concurrency: 4,
};
```

Or use any of these formats:
- `img-compress.config.js` / `.cjs` / `.mjs` / `.json`
- `.img-compressrc` / `.img-compressrc.json` / `.img-compressrc.js`

---

## 📡 Programmatic API

Use `@dhananjay_verma9546/pixora-compress` in your Node.js scripts or build tools:

```ts
import { compress } from '@dhananjay_verma9546/pixora-compress';

const result = await compress('./images', {
  quality: 75,
  formats: ['webp', 'avif'],
  output: './dist/images',
  recursive: true,
  report: true,
});

console.log(`✔ Processed ${result.summary.filesProcessed} files`);
console.log(`✔ Saved ${result.summary.savedPercent.toFixed(1)}%`);
```

### API Options

```ts
interface CompressApiOptions {
  quality?: number;        // 1-100
  width?: number;          // resize width in px
  maxSize?: string;        // '300kb', '2mb'
  output?: string;         // output directory
  formats?: string[];      // ['webp', 'avif', 'jpg', 'png']
  recursive?: boolean;     // scan subfolders
  overwrite?: boolean;     // replace originals
  report?: boolean;        // print size report
  dryRun?: boolean;        // preview without writing
  clean?: boolean;         // remove output first
  smartQuality?: boolean;  // auto-detect quality
  preserveMetadata?: boolean;
  concurrency?: number;    // parallel workers
  ignore?: string[];       // glob patterns
}
```

---

## 🏗️ Build Pipeline Integration

### npm scripts

```json
{
  "scripts": {
    "images": "img-compress ./src/assets --output ./dist/assets --webp --quality 80 --report",
    "images:watch": "img-compress ./src/assets --output ./dist/assets --webp --watch"
  }
}
```

### In a build script

```ts
import { compress } from '@dhananjay_verma9546/pixora-compress';

// Pre-build step
await compress('./src/assets', {
  output: './dist/assets',
  formats: ['webp', 'avif'],
  quality: 80,
  recursive: true,
  clean: true,
});
```

---

## 🤝 Contributing

1. Fork and clone
2. `npm install`
3. `npm run dev -- ./test-images` to test locally
4. `npm test` to run tests
5. `npm run build` to build
6. Submit a PR

---

## 📄 License

[MIT](LICENSE)
