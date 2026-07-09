import { program } from 'commander';
import { cosmiconfig } from 'cosmiconfig';
import { compressImages } from './compress.js';
import { buildRuntimeOptions } from './utils.js';
import { logger } from './logger.js';
import { runInitWizard } from './init.js';
import type { ConfigFile } from './types.js';
import { generateAssets } from './generate.js';
import { generateSpriteSheet } from './sprite.js';
import { optimizeSvgFile } from './svg.js';
import { runAudit, printAuditReport, getImageStats } from './audit.js';
import { compareImagesQuality, generateDiffHeatmap } from './metrics.js';
import { restoreBackups } from './backup.js';
import { updateHtmlFile, updateMarkdownFile } from './integrations.js';
import { runBenchmark } from './benchmark.js';
import { generateReports } from './reports.js';
import { runBuildPipeline, printBuildResult } from './build.js';
import { analyzeImage, printAnalysis } from './analyzer.js';
import { scoreProject, printScore } from './score.js';
import { generatePalette, printPalette, paletteToJson, paletteToCss, paletteToTailwind } from './palette.js';
import { generateIcons, printIconResult } from './icons.js';
import { generateOGImages, printOGResult } from './og.js';
import { startApiServer } from './api.js';
import { getAnalyticsSummary, printAnalytics } from './analytics.js';
import { runRulesOnFolder } from './rules.js';
import { runWorkflowFile } from './workflow.js';
import { scanProject, fixIssuesAutomatically } from './scanner.js';
import { smartRename, organizeFolder } from './organizer.js';
import { installGitHook, optimizeStagedImages } from './git.js';
import { runFrameworkRecipe } from './recipes.js';
import fs from 'fs-extra';
import path from 'path';

// ─── Config file loader ─────────────────────────────────────────────

async function loadConfig(): Promise<ConfigFile> {
  const explorer = cosmiconfig('pixora', {
    searchPlaces: [
      'pixora.config.js',
      'pixora.config.cjs',
      'pixora.config.mjs',
      'pixora.config.json',
      '.pixorarc',
      '.pixorarc.json',
      '.pixorarc.js',
      '.pixorarc.cjs',
      // Backwards compat
      'img-compress.config.js',
      '.img-compressrc.json',
    ],
  });

  const result = await explorer.search();
  return (result?.config as ConfigFile) ?? {};
}

// ─── Banner ─────────────────────────────────────────────────────────

logger.banner();

// ─── Root Program ────────────────────────────────────────────────────

program
  .name('pixora')
  .description('⚡ Pixora — Developer Asset Optimization Platform & Automated Asset Pipeline')
  .version('1.1.0', '-v, --version');

// ─── pixora compress ────────────────────────────────────────────────

program
  .command('compress')
  .alias('optimize')
  .description('⚡ Compress & optimize images (multi-format, parallel, smart quality)')
  .argument('[folder-or-file]', 'input folder or image file', '.')
  .option('-o, --output <dir>', 'write results to a directory')
  .option('-w, --width <number>', 'resize width in pixels (no enlargement)')
  .option('-q, --quality <number>', 'target quality 1-100')
  .option('--max-size <size>', 'target output size e.g. 300kb or 2mb')
  .option('--webp', 'output WebP format')
  .option('--avif', 'output AVIF format')
  .option('--format <list>', 'comma-separated formats: jpg,webp,avif,png,tiff')
  .option('--recursive', 'scan subfolders recursively')
  .option('--ignore <patterns>', 'comma-separated glob patterns to ignore')
  .option('--overwrite', 'replace original files in place (saves backup)')
  .option('--report', 'print detailed before/after size report')
  .option('--watch', 'watch for changes and re-compress')
  .option('--dry-run', 'preview output without writing files')
  .option('--clean', 'remove output directory before processing')
  .option('--smart-quality', 'auto-detect optimal quality per image')
  .option('--best-format', 'auto-choose best format based on image content')
  .option('--preserve-metadata', 'keep EXIF/IPTC/XMP metadata')
  .option('--concurrency <number>', 'parallel workers (default: CPU count)')
  .option(
    '--profile <name>',
    'compression profile: web | ecommerce | print | social | blog | thumbnail'
  )
  .action(async (input: string, cliOptions: Record<string, unknown>) => {
    try {
      const config = await loadConfig();
      const options = buildRuntimeOptions(input, cliOptions, config);
      const result = await compressImages(options);
      if (result?.summary?.filesProcessed === 0) {
        logger.warn('No supported images found.');
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora convert ──────────────────────────────────────────────────

program
  .command('convert')
  .description('🔄 Convert images to a specific format')
  .argument('[folder-or-file]', 'input folder or image file', '.')
  .option('--to <format>', 'target format: webp | avif | jpg | png | tiff', 'webp')
  .option('-o, --output <dir>', 'write results to a directory')
  .option('-q, --quality <number>', 'target quality 1-100')
  .option('--recursive', 'scan subfolders recursively')
  .option('--lossless', 'enable lossless compression (webp/png)')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      const config = await loadConfig();
      const cliOptions: Record<string, unknown> = {
        ...options,
        formats: [options.to],
      };
      const runtimeOptions = buildRuntimeOptions(input, cliOptions, config);
      await compressImages(runtimeOptions);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora resize ───────────────────────────────────────────────────

program
  .command('resize')
  .description('📐 Resize images (never enlarges)')
  .argument('[folder-or-file]', 'input folder or image file', '.')
  .requiredOption('-w, --width <number>', 'max width in pixels')
  .option('-o, --output <dir>', 'write results to a directory')
  .option('--recursive', 'scan subfolders recursively')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      const config = await loadConfig();
      const runtimeOptions = buildRuntimeOptions(input, options, config);
      await compressImages(runtimeOptions);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora audit ────────────────────────────────────────────────────

program
  .command('audit')
  .description(
    '📊 Audit a folder (duplicates, missing WebP/AVIF, largest files) OR inspect a single image (stats + EXIF)'
  )
  .argument('[folder-or-file]', 'input folder or image file', '.')
  .option('--json', 'output results as JSON')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      const target = path.resolve(input);
      const stat = await fs.stat(target);

      if (stat.isFile()) {
        logger.info(`Inspecting image stats & EXIF: ${path.basename(target)}`);
        const stats = await getImageStats(target);
        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log('\n' + '─'.repeat(48));
          console.log(`  Resolution:    ${stats.resolution}`);
          console.log(`  Aspect Ratio:  ${stats.aspectRatio}`);
          console.log(`  Has Alpha:     ${stats.hasAlpha}`);
          console.log(`  Color Profile: ${stats.colorProfile}`);
          console.log('─'.repeat(48));
          if (stats.exif && Object.keys(stats.exif).length > 0) {
            console.log('\n📸 EXIF Metadata:');
            Object.entries(stats.exif).forEach(([key, val]) => {
              if (typeof val !== 'object' && val !== undefined) {
                console.log(`  ${key}: ${val}`);
              }
            });
          } else {
            console.log('\n  No EXIF metadata found.');
          }
        }
        return;
      }

      logger.info(`Auditing folder: ${input}…`);
      const result = await runAudit(target);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printAuditReport(result);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora compare ──────────────────────────────────────────────────

program
  .command('compare')
  .description('🔍 Compare two images: SSIM, PSNR, MSE, compression ratio')
  .argument('<image1>', 'original image')
  .argument('<image2>', 'compressed/modified image')
  .option('--json', 'output results as JSON')
  .option('--heatmap', 'generate a visual difference heatmap PNG')
  .option('--heatmap-out <path>', 'custom output path for heatmap')
  .action(async (image1: string, image2: string, options: Record<string, unknown>) => {
    try {
      logger.info(`Comparing ${path.basename(image1)} ↔ ${path.basename(image2)}…`);
      const metrics = await compareImagesQuality(image1, image2);
      if (options.json) {
        console.log(JSON.stringify(metrics, null, 2));
      } else {
        console.log('\n' + '─'.repeat(52));
        console.log(`  SSIM (Structural Similarity):  ${metrics.ssim.toFixed(4)} / 1.0000`);
        console.log(`  PSNR (Peak Signal-to-Noise):   ${metrics.psnr.toFixed(2)} dB`);
        console.log(`  Mean Squared Error:            ${metrics.mse.toFixed(4)}`);
        console.log(`  Compression Ratio:             ${metrics.compressionRatio.toFixed(2)}x`);
        console.log('─'.repeat(52));
        const ssimRating =
          metrics.ssim > 0.97
            ? '🟢 Excellent'
            : metrics.ssim > 0.92
              ? '🟡 Good'
              : metrics.ssim > 0.85
                ? '🟠 Acceptable'
                : '🔴 Poor';
        console.log(`  Quality Rating:                ${ssimRating}`);
        console.log('');
      }
      if (options.heatmap) {
        logger.info('Generating difference heatmap…');
        const heatmap = await generateDiffHeatmap(
          image1,
          image2,
          options.heatmapOut as string | undefined
        );
        logger.success(`Heatmap saved → ${heatmap.outputPath}`);
        logger.dim(`  Max diff: ${heatmap.maxDiff}  Avg diff: ${heatmap.avgDiff.toFixed(2)}  Changed pixels: ${heatmap.diffPixelPercent.toFixed(1)}%`);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora generate ─────────────────────────────────────────────────

program
  .command('generate')
  .description(
    '🌐 Generate web performance assets: responsive images, BlurHash, LQIP, dominant colors, sprites, SVG optimization'
  )
  .argument('[folder-or-file]', 'input image file or folder', '.')
  .option('-o, --output <dir>', 'output directory', './output')
  .option('--sprite', 'compile folder of icons into a sprite sheet + CSS')
  .option('--sprite-name <name>', 'sprite sheet file name (without extension)', 'sprite')
  .option('--svg', 'optimize SVG files with SVGO')
  .option('--json', 'output results as JSON (for single image mode)')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      const outputDir = (options.output as string) || './output';

      // Sprite sheet generation
      if (options.sprite) {
        logger.info(`Compiling sprite sheet from folder: ${input}…`);
        const result = await generateSpriteSheet(
          input,
          outputDir,
          (options.spriteName as string) || 'sprite'
        );
        logger.success(`Sprite: ${result.spritePath}`);
        logger.success(`CSS:    ${result.cssPath}`);
        return;
      }

      // SVG optimization
      if (options.svg || input.toLowerCase().endsWith('.svg')) {
        logger.info(`Optimizing SVG: ${input}…`);
        const outPath = path.join(outputDir, path.basename(input));
        await optimizeSvgFile(input, outPath);
        logger.success(`SVG optimized → ${outPath}`);
        return;
      }

      // Web performance asset generation
      logger.info(`Generating performance assets for: ${path.basename(input)}…`);
      const result = await generateAssets(input, outputDir);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              lqip: result.lqip.substring(0, 80) + '…',
              blurhash: result.blurhash,
              dominantColor: result.dominantColor,
              responsiveImages: result.responsiveImages.map((r) => ({
                width: r.width,
                path: path.relative(process.cwd(), r.path),
              })),
            },
            null,
            2
          )
        );
      } else {
        logger.success('Performance assets generated!');
        console.log('\n  📌 LQIP (Base64 preview):');
        console.log('  ' + result.lqip.substring(0, 80) + '…');
        console.log('\n  🎨 BlurHash:');
        console.log('  ' + result.blurhash);
        console.log('\n  🌈 Dominant Colors:');
        console.log('  Primary:   ' + result.dominantColor.primary);
        console.log('  Secondary: ' + result.dominantColor.secondary);
        console.log('\n  📱 Responsive Widths:');
        result.responsiveImages.forEach((img) => {
          console.log(`    ${img.width}w → ${path.relative(process.cwd(), img.path)}`);
        });
        console.log('\n  📄 HTML Snippet:\n');
        console.log(result.htmlSnippet);
        console.log('\n  ⚛️  JSX Snippet:\n');
        console.log(result.jsxSnippet);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora watch ────────────────────────────────────────────────────

program
  .command('watch')
  .description('👀 Watch folder for changes and re-compress automatically')
  .argument('[folder-or-file]', 'input folder or image file', '.')
  .option('-o, --output <dir>', 'write results to a directory')
  .option('--webp', 'output WebP')
  .option('--avif', 'output AVIF')
  .option('--quality <number>', 'target quality')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      const config = await loadConfig();
      const runtimeOptions = buildRuntimeOptions(input, { ...options, watch: true }, config);
      await compressImages(runtimeOptions);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora benchmark ────────────────────────────────────────────────

program
  .command('benchmark')
  .description('📈 Benchmark formats (JPG vs PNG vs WebP vs AVIF) and recommend best for your images')
  .argument('[folder-or-file]', 'input folder or image file', '.')
  .option('--json', 'output results as JSON')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      logger.info(`Running format benchmark on: ${input}…`);
      await runBenchmark(input, { json: Boolean(options.json) });
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora html-update ──────────────────────────────────────────────

program
  .command('html-update')
  .description('🔤 Auto-update <img> tags in HTML files to <picture> with WebP/AVIF sources')
  .argument('[glob]', 'HTML files or glob pattern', '.')
  .action(async (input: string) => {
    try {
      const resolved = path.resolve(input);
      const stat = await fs.stat(resolved);
      const htmlFiles: string[] = [];

      if (stat.isFile() && input.endsWith('.html')) {
        htmlFiles.push(resolved);
      } else if (stat.isDirectory()) {
        const { glob } = await import('fast-glob');
        const found = await glob('**/*.{html,htm}', { cwd: resolved, absolute: true });
        htmlFiles.push(...found);
      }

      if (htmlFiles.length === 0) {
        logger.warn('No HTML files found.');
        return;
      }

      logger.info(`Updating ${htmlFiles.length} HTML file(s)…`);
      for (const file of htmlFiles) {
        await updateHtmlFile(file);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora markdown-update ──────────────────────────────────────────

program
  .command('markdown-update')
  .alias('md-update')
  .description('📝 Replace image paths in Markdown files with optimized WebP versions')
  .argument('[glob]', 'Markdown files or folder', '.')
  .action(async (input: string) => {
    try {
      const resolved = path.resolve(input);
      const stat = await fs.stat(resolved);
      const mdFiles: string[] = [];

      if (stat.isFile()) {
        mdFiles.push(resolved);
      } else if (stat.isDirectory()) {
        const { glob } = await import('fast-glob');
        const found = await glob('**/*.{md,mdx}', { cwd: resolved, absolute: true });
        mdFiles.push(...found);
      }

      if (mdFiles.length === 0) {
        logger.warn('No Markdown files found.');
        return;
      }

      logger.info(`Updating ${mdFiles.length} Markdown file(s)…`);
      for (const file of mdFiles) {
        await updateMarkdownFile(file);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora report ───────────────────────────────────────────────────

program
  .command('report')
  .description('📋 Generate HTML / JSON / CSV compression history report')
  .argument('[folder]', 'folder to scan', '.')
  .option('--html', 'generate HTML report file')
  .option('--csv', 'generate CSV report file')
  .option('--json', 'generate JSON report file')
  .option('-o, --output <dir>', 'output directory for report files', '.')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      logger.info('Generating compression report…');
      await generateReports(input, {
        html: Boolean(options.html),
        csv: Boolean(options.csv),
        json: Boolean(options.json),
        outputDir: (options.output as string) || '.',
      });
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora serve ────────────────────────────────────────────────────

program
  .command('serve')
  .description('🌍 Start a local dev server to preview optimized images')
  .argument('[dir]', 'directory to serve', '.')
  .option('-p, --port <number>', 'port to listen on', '4000')
  .action(async (dir: string, options: Record<string, unknown>) => {
    try {
      const { startServer } = await import('./server.js');
      await startServer(dir, Number(options.port) || 4000);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora undo ─────────────────────────────────────────────────────

program
  .command('undo')
  .description('⏪ Restore original images from backup (taken during --overwrite)')
  .action(async () => {
    try {
      logger.info('Restoring originals from backup…');
      await restoreBackups();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora init ─────────────────────────────────────────────────────

program
  .command('init')
  .description('🔧 Run the interactive setup wizard to create pixora.config.js')
  .action(async () => {
    try {
      await runInitWizard();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora build ─────────────────────────────────────────────────────

program
  .command('build')
  .description('🚀 Full asset pipeline: compress → WebP/AVIF → responsive → BlurHash/LQIP → SVG → manifest.json')
  .argument('[input]', 'input folder', '.')
  .option('-o, --output <dir>', 'output directory', './dist/assets')
  .option('-q, --quality <number>', 'compression quality', '80')
  .option('--concurrency <number>', 'parallel workers', '4')
  .action(async (input: string, options: Record<string, unknown>) => {
    try {
      const result = await runBuildPipeline({
        input,
        output: (options.output as string) || './dist/assets',
        quality: Number(options.quality) || 80,
        concurrency: Number(options.concurrency) || 4,
      });
      printBuildResult(result);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora analyze ───────────────────────────────────────────────────

program
  .command('analyze')
  .description('🧠 AI image analysis: type, best format, quality, savings estimate, face/text detection')
  .argument('<image>', 'image file to analyze')
  .option('--json', 'output as JSON')
  .action(async (image: string, options: Record<string, unknown>) => {
    try {
      const result = await analyzeImage(path.resolve(image));
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printAnalysis(result);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora score ─────────────────────────────────────────────────────

program
  .command('score')
  .description('📈 Performance score (0–100) for a folder: format, size, modern format coverage')
  .argument('[folder]', 'folder to score', '.')
  .option('--json', 'output as JSON')
  .action(async (folder: string, options: Record<string, unknown>) => {
    try {
      const result = await scoreProject(path.resolve(folder));
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printScore(result);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora palette ───────────────────────────────────────────────────

program
  .command('palette')
  .description('🎨 Extract 5-color palette (primary, secondary, accent, background, text) from an image')
  .argument('<image>', 'input image')
  .option('--json', 'output as JSON')
  .option('--css', 'output as CSS custom properties')
  .option('--tailwind', 'output as Tailwind config')
  .option('-o, --output <file>', 'save output to file')
  .action(async (image: string, options: Record<string, unknown>) => {
    try {
      const palette = await generatePalette(path.resolve(image));
      let output = '';

      if (options.css) {
        output = paletteToCss(palette);
        console.log(output);
      } else if (options.tailwind) {
        output = paletteToTailwind(palette);
        console.log(output);
      } else if (options.json) {
        output = paletteToJson(palette);
        console.log(output);
      } else {
        printPalette(palette, image);
        output = paletteToJson(palette);
      }

      if (options.output) {
        await fs.writeFile(options.output as string, output, 'utf-8');
        logger.success(`Palette saved → ${options.output}`);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora icons ─────────────────────────────────────────────────────

program
  .command('icons')
  .description('📱 Generate app icons for Android, iOS, PWA, Favicon, Social from one PNG')
  .argument('<image>', 'source PNG (preferably 1024×1024)')
  .option('-o, --output <dir>', 'output directory', './icons')
  .option('--android', 'generate only Android icons')
  .option('--ios', 'generate only iOS icons')
  .option('--pwa', 'generate only PWA icons')
  .option('--favicon', 'generate only Favicons')
  .option('--social', 'generate only Social/Apple Touch Icons')
  .action(async (image: string, options: Record<string, unknown>) => {
    try {
      const platforms: ('android' | 'ios' | 'pwa' | 'favicon' | 'social')[] = [];
      if (options.android) platforms.push('android');
      if (options.ios) platforms.push('ios');
      if (options.pwa) platforms.push('pwa');
      if (options.favicon) platforms.push('favicon');
      if (options.social) platforms.push('social');

      const result = await generateIcons(
        path.resolve(image),
        (options.output as string) || './icons',
        platforms.length > 0 ? platforms : undefined
      );
      printIconResult(result);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora og ────────────────────────────────────────────────────────

program
  .command('og')
  .description('🖼️  Generate Open Graph images for Twitter, Facebook, LinkedIn, Discord, WhatsApp, Instagram')
  .argument('<image>', 'source image')
  .option('-o, --output <dir>', 'output directory', './og')
  .option('-q, --quality <number>', 'JPEG quality 1-100', '85')
  .action(async (image: string, options: Record<string, unknown>) => {
    try {
      const result = await generateOGImages(
        path.resolve(image),
        (options.output as string) || './og',
        Number(options.quality) || 85
      );
      printOGResult(result);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora api ───────────────────────────────────────────────────────

program
  .command('api')
  .description('📡 Start Pixora REST API server (POST /compress, /analyze, /palette, /score, /meta)')
  .option('-p, --port <number>', 'port to listen on', '3333')
  .action(async (options: Record<string, unknown>) => {
    try {
      await startApiServer(Number(options.port) || 3333);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora analytics ─────────────────────────────────────────────────

program
  .command('analytics')
  .alias('stats')
  .description('📊 Show optimization analytics: savings today, this month, all time')
  .option('--json', 'output as JSON')
  .action(async (options: Record<string, unknown>) => {
    try {
      const summary = await getAnalyticsSummary();
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        printAnalytics(summary);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora dashboard ─────────────────────────────────────────────────

program
  .command('dashboard')
  .description('📈 Open browser dashboard with charts (format distribution, largest files, savings)')
  .argument('[dir]', 'directory to analyze', '.')
  .option('-p, --port <number>', 'port to listen on', '4000')
  .action(async (dir: string, options: Record<string, unknown>) => {
    try {
      const port = Number(options.port) || 4000;
      const { startServer } = await import('./server.js');
      logger.info(`Opening dashboard at http://localhost:${port}/__dashboard`);
      // Try to open browser
      const open = await import('node:child_process');
      setTimeout(() => {
        try {
          const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          open.exec(`${cmd} http://localhost:${port}/__dashboard`);
        } catch {}
      }, 800);
      await startServer(dir, port);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora rules ─────────────────────────────────────────────────────

program
  .command('rules')
  .description('⚙️  Apply custom automation rules from rules.json on a folder')
  .argument('[folder]', 'folder containing images', '.')
  .option('-c, --config <file>', 'path to rules.json', './rules.json')
  .action(async (folder: string, options: Record<string, unknown>) => {
    try {
      await runRulesOnFolder(folder, options.config as string);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora workflow ──────────────────────────────────────────────────

program
  .command('workflow')
  .description('🚀 Run workflow steps defined in a json/js file')
  .argument('<workflowFile>', 'path to workflow JSON config')
  .argument('[folder]', 'target folder to optimize', '.')
  .action(async (workflowFile: string, folder: string) => {
    try {
      await runWorkflowFile(workflowFile, folder);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora scan ──────────────────────────────────────────────────────

program
  .command('scan')
  .description('🔍 Scan project for unused/large/duplicate images, broken refs, and fix them')
  .argument('[folder]', 'project directory to scan', '.')
  .option('--fix', 'auto-fix all fixable issues')
  .action(async (folder: string, options: Record<string, unknown>) => {
    try {
      const result = await scanProject(folder);
      logger.info(`Scan complete. Found ${result.issues.length} issues across ${result.totalScanned} scanned assets.`);
      result.issues.forEach((issue) => {
        logger.warn(`  [${issue.type.toUpperCase()}] ${issue.message} in ${path.relative(process.cwd(), issue.file)}`);
      });

      if (options.fix && result.issues.length > 0) {
        await fixIssuesAutomatically(result.issues);
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora organize ──────────────────────────────────────────────────

program
  .command('organize')
  .description('📁 Smart organize images in a folder into sub-directories (photos, logos, icons, banners)')
  .argument('[folder]', 'folder to organize', '.')
  .action(async (folder: string) => {
    try {
      await organizeFolder(folder);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora rename ────────────────────────────────────────────────────

program
  .command('rename')
  .description('✏️  Smart contextual rename of an image based on metadata')
  .argument('<image>', 'image file')
  .option('-p, --prefix <name>', 'custom rename prefix')
  .action(async (image: string, options: Record<string, unknown>) => {
    try {
      await smartRename(path.resolve(image), options.prefix as string | undefined);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora git-hook ──────────────────────────────────────────────────

program
  .command('git-hook')
  .description('⚓ Install git pre-commit hook to automatically compress staged images')
  .argument('[root]', 'git repository root', '.')
  .action(async (root: string) => {
    try {
      await installGitHook(root);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora git-optimize (Internal/Hook) ──────────────────────────────

program
  .command('git-optimize')
  .description('Automatically optimize staged images (called by git hook)')
  .action(async () => {
    try {
      await optimizeStagedImages();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// ─── pixora recipe ────────────────────────────────────────────────────

program
  .command('recipe')
  .description('💎 Run framework integration recipes (nextjs, react, vite, astro)')
  .argument('<recipe>', 'recipe name: nextjs | react | vite | astro')
  .argument('[dir]', 'project root directory', '.')
  .action(async (recipe: string, dir: string) => {
    try {
      await runFrameworkRecipe(recipe, dir);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
