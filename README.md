# ⚡ Pixora — Industry-Grade Asset Optimization Toolkit

> Fast, automated, cross-platform image optimization pipeline and developer toolkit built on [sharp](https://sharp.pixelplumbing.com/).

[![npm version](https://img.shields.io/npm/v/@dhananjay_verma9546/pixora-compress.svg?style=flat-square&color=7C3AED)](https://www.npmjs.com/package/@dhananjay_verma9546/pixora-compress)
[![license](https://img.shields.io/npm/l/@dhananjay_verma9546/pixora-compress.svg?style=flat-square)](LICENSE)
[![node](https://img.shields.io/node/v/@dhananjay_verma9546/pixora-compress.svg?style=flat-square)](package.json)

Pixora is a complete automation engine for modern web applications. Compress, convert, audit, generate responsive image sets, extract color palettes, bundle sprite sheets, detect subjects using lightweight heuristics, simulate CDNs, run visual diffs, and configure custom workflow engines.

---

## 🔄 Pixora Automation Workflow

Here is how Pixora automates your development pipeline:

```mermaid
graph TD
    A[Staged Images / Assets Folder] --> B[pixora git-hook / pixora scan]
    B --> C{Rules Engine matched?}
    C -- Yes --> D[Apply custom actions: resize, convert, lossless]
    C -- No --> E[Run standard Build Pipeline]
    
    E --> E1[1. Smart Quality Compression]
    E --> E2[2. Convert to WebP + AVIF]
    E --> E3[3. Generate Responsive Widths]
    E --> E4[4. Generate BlurHash + LQIP]
    E --> E5[5. Optimize SVGs via SVGO]
    
    E1 & E2 & E3 & E4 & E5 --> F[Generate manifest.json]
    F --> G[Auto-update HTML/React Image components]
    G --> H[CDN Upload Simulator / Deployment]
    H --> I[HTML / JSON / CSV Report & Analytics]
```

---

## ✨ Feature Index (Everything We Made)

Here is a full breakdown of every module and capability now supported by Pixora v2:

### 🚀 1. Core Optimization & Compression
* **In-Place Compression**: Run standard optimizations on existing JPEGs, PNGs, and GIFs using `pixora compress`.
* **Format Conversion**: Convert files dynamically into modern formats (WebP, AVIF, JPEG, PNG, TIFF) using `pixora convert --to <format>`.
* **Smart Width Resizing**: Scale images to a specific width without enlargement or aspect ratio distortion.
* **Target Size Budgeting**: Target a specific file size (e.g. `--max-size 300kb`), dynamically computing the optimal quality parameters.
* **Smart Quality Rules**: Auto-detects optimal compression quality limits per image type (e.g., Photos compress lower, logos/screenshots keep higher density).
* **Metadata Stripping**: Preserve or remove EXIF/IPTC/XMP metadata during compression.

### 🌐 2. Generation & Layout Assets
* **BlurHash Placeholders**: Extracts beautiful CSS-friendly BlurHash strings for instant skeleton loader previews.
* **LQIP (Low Quality Image Placeholders)**: Generates base64 embedded preview buffers for smooth blur-in loading states.
* **Responsive Responsive Widths**: Outputs resized versions of an image (320w, 640w, 768w, 1024w, 1440w, 1920w) instantly.
* **Sprite Sheet Compiler**: Bundles directories of icons into single CSS-mapped sprite sheets.
* **SVG Optimizer**: Minimizes SVG vectors via built-in SVGO configurations.
* **App Icon Generator**: Generates full icon assets for iOS, Android, PWAs, Favicons, and Apple Touch previews from a single PNG file.
* **Open Graph social previews**: Smart Attention-cropping for social network dimensions (Facebook, Twitter Cards, Discord, WhatsApp).

### 📊 3. Analysis, Auditing & Scanners
* **Project Scanner (`pixora scan`)**: Crawls code directories (`.html`, `.jsx`, `.tsx`, etc.) to find broken image links, missing `loading="lazy"` tags, unused media, and duplicate visual assets.
* **Heuristic Subject Detection**: Detects layout structures (portrait, landscape, square), text-density layout blocks, and counts faces via skin-tone heuristics.
* **Visual Diff Metric Comparison**: Computes SSIM (Structural Similarity Index), PSNR, and MSE to analyze image degradation.
* **Visual Diff Heatmaps**: Outputs a visual blue-to-red diff overlay image highlighting exact pixel alterations.
* **Interactive Performance Scorer**: Rates folders 0–100 on modern layout choices, metadata footprint, and format optimization.

### ⚙️ 4. Automation & Integration
* **Workflow Engine (`pixora workflow`)**: Chain scan, build, report, API, and analytics steps using custom YAML/JSON step files.
* **Rules Engine (`pixora rules`)**: Apply custom conditionals to folders (e.g., `if: size > 2MB → action: [compress, resize:1920]`).
* **Git Commit hook**: Pre-commit hook optimizing newly added staged images automatically during every `git commit`.
* **Framework Recipes**: Special templates for `nextjs`, `react`, `vite`, and `astro` projects.
* **Dev Server & CDN Simulator**: Run a local dev server simulating on-the-fly transformations (e.g. `?w=300&format=webp`).
* **Interactive Web Dashboard**: Graphical charts showing savings, format distributions, and CDN statistics served at `/__dashboard`.

---

## 📥 Installation

```bash
# Global installation
npm install -g @dhananjay_verma9546/pixora-compress

# Run instantly via npx
npx @dhananjay_verma9546/pixora-compress build ./assets
```

---

## 🚀 CLI Commands Reference

### 1. Build Pipeline
```bash
pixora build ./src/assets -o ./dist/public -q 80
```

### 2. Project Scanner
```bash
# Scan code and print issues
pixora scan ./src

# Scan and automatically resolve duplicates, compress large images, and generate formats
pixora scan ./src --fix
```

### 3. Image Analysis & Performance Score
```bash
pixora analyze ./assets/hero.png
pixora score ./assets
```

### 4. Extract Palette
```bash
pixora palette logo.png --tailwind
```

### 5. App Icons & Social Assets
```bash
pixora icons icon.png -o ./public/icons
pixora og image.png -o ./public/og
```

### 6. Difference Heatmaps
```bash
pixora compare original.jpg compressed.webp --heatmap
```

---

## ⚙️ Rules & Workflows

### Rules Config (`rules.json`)
```json
{
  "rules": [
    {
      "if": "size > 2MB",
      "action": ["compress", "resize:1920"]
    },
    {
      "if": "extension == png",
      "action": ["convert:webp"]
    }
  ]
}
```
Run rules:
```bash
pixora rules ./assets -c ./rules.json
```

### Workflow Config (`workflow.json`)
```json
{
  "name": "Production Optimization",
  "steps": [
    "scan",
    "build",
    "report"
  ]
}
```
Run workflow:
```bash
pixora workflow ./workflow.json ./assets
```
