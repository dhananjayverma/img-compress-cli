import fs from 'fs-extra';
import path from 'path';
import { discoverImages, formatBytes } from './utils.js';
import { runAudit } from './audit.js';
import { compressImages } from './compress.js';
import { logger } from './logger.js';

export interface ScanIssue {
  type: 'unused' | 'duplicate' | 'large' | 'missing-webp' | 'missing-avif' | 'broken' | 'missing-lazy';
  file: string;
  message: string;
  details?: any;
}

export interface ScanResult {
  issues: ScanIssue[];
  totalScanned: number;
}

export async function scanProject(folder: string): Promise<ScanResult> {
  const resolved = path.resolve(folder);
  const files = await discoverImages(resolved, { recursive: true });

  const issues: ScanIssue[] = [];

  // 1. Audit duplicates & modern coverage
  let auditRes;
  try {
    auditRes = await runAudit(resolved);
    
    // Duplicate issues
    for (const group of auditRes.exactDuplicates) {
      const original = group[0]!;
      for (let i = 1; i < group.length; i++) {
        issues.push({
          type: 'duplicate',
          file: group[i]!,
          message: `Duplicate image of ${path.basename(original)}`,
          details: { original },
        });
      }
    }

    // Modern formats
    for (const file of auditRes.missingWebP) {
      issues.push({
        type: 'missing-webp',
        file,
        message: `Missing modern WebP format variant`,
      });
    }

    for (const file of auditRes.missingAVIF) {
      issues.push({
        type: 'missing-avif',
        file,
        message: `Missing modern AVIF format variant`,
      });
    }
  } catch {}

  // 2. Scan every image for size, dimensions, lazy loading tag references
  const htmlFiles = await import('fast-glob').then((g) =>
    g.glob('**/*.{html,htm,jsx,tsx,vue,svelte}', { cwd: resolved, absolute: true })
  );

  // Read all HTML/JS contents to find image refs
  const fileContents: { path: string; text: string }[] = [];
  for (const htmlFile of htmlFiles) {
    try {
      const text = await fs.readFile(htmlFile, 'utf-8');
      fileContents.push({ path: htmlFile, text });
    } catch {}
  }

  const allUsedNames = new Set(
    fileContents.flatMap((c) => {
      const refs: string[] = [];
      // Quick regex match for filenames in html/jsx
      const regex = /["']([^"']*\.(jpe?g|png|webp|avif|gif|svg))["']/gi;
      let match;
      while ((match = regex.exec(c.text)) !== null) {
        if (match[1]) refs.push(path.basename(match[1]));
      }
      return refs;
    })
  );

  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      const name = path.basename(file);

      // Large files (> 2MB)
      if (stat.size > 2 * 1024 * 1024) {
        issues.push({
          type: 'large',
          file,
          message: `File size is very large: ${formatBytes(stat.size)}`,
        });
      }

      // Unused check
      if (allUsedNames.size > 0 && !allUsedNames.has(name)) {
        issues.push({
          type: 'unused',
          file,
          message: `Image does not appear to be referenced in code`,
        });
      }
    } catch {}
  }

  // 3. Broken image references & lazy loading check in code
  for (const { path: codeFile, text } of fileContents) {
    // Look for <img src="..." />
    const imgTagRegex = /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi;
    let match;
    while ((match = imgTagRegex.exec(text)) !== null) {
      const src = match[2]!;
      const attributes = (match[1] || '') + ' ' + (match[3] || '');

      // Check lazy loading
      if (!attributes.includes('loading=') && !attributes.includes('loading:')) {
        issues.push({
          type: 'missing-lazy',
          file: codeFile,
          message: `Missing 'loading="lazy"' attribute in image: ${src}`,
        });
      }

      // Check broken links (if local path)
      if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')) {
        const localPath = src.startsWith('/')
          ? path.join(resolved, src)
          : path.join(path.dirname(codeFile), src);

        if (!(await fs.pathExists(localPath))) {
          issues.push({
            type: 'broken',
            file: codeFile,
            message: `Broken image reference: "${src}" does not exist`,
          });
        }
      }
    }
  }

  return { issues, totalScanned: files.length };
}

export async function fixIssuesAutomatically(issues: ScanIssue[]): Promise<void> {
  logger.info(`Starting auto-fix for ${issues.length} issues…`);

  const duplicates = issues.filter((i) => i.type === 'duplicate');
  const missingFormats = issues.filter((i) => i.type === 'missing-webp' || i.type === 'missing-avif');
  const largeImages = issues.filter((i) => i.type === 'large');

  // 1. Remove duplicates
  for (const dup of duplicates) {
    try {
      await fs.remove(dup.file);
      logger.success(`Removed duplicate: ${path.basename(dup.file)}`);
    } catch {}
  }

  // 2. Compress large images in-place
  for (const large of largeImages) {
    try {
      await compressImages({
        input: large.file,
        overwrite: true,
        recursive: false,
        quality: 75,
        formats: [path.extname(large.file).slice(1).toLowerCase()],
        ignore: [],
        watch: false,
        report: false,
        dryRun: false,
        clean: false,
        smartQuality: false,
        preserveMetadata: false,
        concurrency: 1,
      });
      logger.success(`Compressed large image: ${path.basename(large.file)}`);
    } catch {}
  }

  // 3. Generate missing modern formats
  if (missingFormats.length > 0) {
    const filesToCompress = Array.from(new Set(missingFormats.map((m) => m.file)));
    for (const file of filesToCompress) {
      try {
        await compressImages({
          input: file,
          overwrite: false,
          output: path.dirname(file),
          recursive: false,
          formats: ['webp', 'avif'],
          quality: 80,
          ignore: [],
          watch: false,
          report: false,
          dryRun: false,
          clean: false,
          smartQuality: false,
          preserveMetadata: false,
          concurrency: 4,
        });
        logger.success(`Generated WebP/AVIF formats for: ${path.basename(file)}`);
      } catch {}
    }
  }

  logger.success('Auto-fix engine completed successfully.');
}
