import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';
import { discoverImages, formatBytes } from './utils.js';

export interface ReportOptions {
  html?: boolean;
  csv?: boolean;
  json?: boolean;
  outputDir?: string;
}

export async function generateReports(input: string, options: ReportOptions): Promise<void> {
  const resolvedInput = path.resolve(input);
  const outputDir = path.resolve(options.outputDir || '.');

  const files = await discoverImages(resolvedInput, { recursive: true });
  if (files.length === 0) {
    logger.warn('No images found to report on.');
    return;
  }

  const reportData = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(file);
      return {
        path: path.relative(process.cwd(), file),
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        ext: path.extname(file).slice(1).toLowerCase(),
        modified: stat.mtime.toISOString(),
      };
    })
  );

  const totalSize = reportData.reduce((s, f) => s + f.size, 0);

  await fs.ensureDir(outputDir);

  // ─── JSON Report ─────────────────────────────────────────────────────
  if (options.json) {
    const jsonPath = path.join(outputDir, 'pixora-report.json');
    await fs.writeJson(jsonPath, { generated: new Date().toISOString(), totalSize, files: reportData }, { spaces: 2 });
    logger.success(`JSON report → ${jsonPath}`);
  }

  // ─── CSV Report ──────────────────────────────────────────────────────
  if (options.csv) {
    const csvPath = path.join(outputDir, 'pixora-report.csv');
    const header = 'path,size,sizeFormatted,ext,modified';
    const rows = reportData.map(
      (f) => `"${f.path}",${f.size},"${f.sizeFormatted}","${f.ext}","${f.modified}"`
    );
    await fs.writeFile(csvPath, [header, ...rows].join('\n'), 'utf-8');
    logger.success(`CSV report  → ${csvPath}`);
  }

  // ─── HTML Report ─────────────────────────────────────────────────────
  if (options.html) {
    const htmlPath = path.join(outputDir, 'pixora-report.html');
    const rows = reportData
      .map(
        (f, i) =>
          `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">
            <td>${f.path}</td>
            <td>${f.ext.toUpperCase()}</td>
            <td>${f.sizeFormatted}</td>
            <td>${new Date(f.modified).toLocaleString()}</td>
          </tr>`
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pixora Asset Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0a1e; color: #e2e8f0; padding: 2rem; }
    h1 { color: #a78bfa; font-size: 2rem; margin-bottom: 0.5rem; }
    .subtitle { color: #64748b; margin-bottom: 2rem; font-size: 0.95rem; }
    .stats { display: flex; gap: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .stat { background: #1e1333; border: 1px solid #3b0764; border-radius: 12px; padding: 1.2rem 2rem; }
    .stat-label { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.8rem; font-weight: 700; color: #c4b5fd; margin-top: 0.3rem; }
    table { width: 100%; border-collapse: collapse; background: #1a0f30; border-radius: 12px; overflow: hidden; }
    thead { background: #2d1b4e; }
    th { padding: 0.9rem 1.2rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #a78bfa; }
    td { padding: 0.75rem 1.2rem; font-size: 0.9rem; border-top: 1px solid #1e1333; }
    tr.odd td { background: rgba(124, 58, 237, 0.04); }
    tr:hover td { background: rgba(124, 58, 237, 0.1); }
  </style>
</head>
<body>
  <h1>⚡ Pixora Asset Report</h1>
  <p class="subtitle">Generated: ${new Date().toLocaleString()}</p>
  <div class="stats">
    <div class="stat">
      <div class="stat-label">Total Images</div>
      <div class="stat-value">${reportData.length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Size</div>
      <div class="stat-value">${formatBytes(totalSize)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>File Path</th>
        <th>Format</th>
        <th>Size</th>
        <th>Last Modified</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    await fs.writeFile(htmlPath, html, 'utf-8');
    logger.success(`HTML report → ${htmlPath}`);
  }

  if (!options.html && !options.csv && !options.json) {
    logger.info(`Found ${reportData.length} images | Total: ${formatBytes(totalSize)}`);
    logger.info('Use --html, --csv, or --json to save a report file.');
  }
}
