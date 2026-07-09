import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import sharp from 'sharp';
import { logger } from './logger.js';
import { discoverImages, formatBytes } from './utils.js';

const SUPPORTED_MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.tiff': 'image/tiff',
  '.tif':  'image/tiff',
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
};

// ─── CDN Query Transform ──────────────────────────────────────────────

function parseCdnParams(query: string): { w?: number; h?: number; format?: string; q?: number } {
  const params = new URLSearchParams(query);
  return {
    w: params.has('w') ? parseInt(params.get('w')!, 10) : undefined,
    h: params.has('h') ? parseInt(params.get('h')!, 10) : undefined,
    format: params.get('format') ?? undefined,
    q: params.has('q') ? parseInt(params.get('q')!, 10) : undefined,
  };
}

async function transformImage(
  filePath: string,
  params: ReturnType<typeof parseCdnParams>
): Promise<{ buffer: Buffer; mime: string }> {
  let pipeline = sharp(filePath);

  if (params.w || params.h) {
    pipeline = pipeline.resize(params.w, params.h, { fit: 'inside', withoutEnlargement: true });
  }

  const quality = params.q ?? 80;

  if (params.format === 'webp') {
    return { buffer: await pipeline.webp({ quality }).toBuffer(), mime: 'image/webp' };
  }
  if (params.format === 'avif') {
    return { buffer: await pipeline.avif({ quality }).toBuffer(), mime: 'image/avif' };
  }
  if (params.format === 'jpg' || params.format === 'jpeg') {
    return { buffer: await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' };
  }
  if (params.format === 'png') {
    return { buffer: await pipeline.png().toBuffer(), mime: 'image/png' };
  }

  // If only w/h without format, return original format
  return { buffer: await pipeline.toBuffer(), mime: SUPPORTED_MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' };
}

// ─── Dashboard HTML ───────────────────────────────────────────────────

async function buildDashboard(rootDir: string): Promise<string> {
  const images = await discoverImages(rootDir, { recursive: true });

  const formatCounts: Record<string, number> = {};
  let totalSize = 0;
  const largest: { name: string; size: number }[] = [];

  await Promise.all(
    images.map(async (f) => {
      try {
        const stat = await fs.stat(f);
        const ext = path.extname(f).slice(1).toLowerCase();
        formatCounts[ext] = (formatCounts[ext] ?? 0) + 1;
        totalSize += stat.size;
        largest.push({ name: path.relative(rootDir, f), size: stat.size });
      } catch {}
    })
  );

  largest.sort((a, b) => b.size - a.size);
  const top10 = largest.slice(0, 10);

  const formatLabels = JSON.stringify(Object.keys(formatCounts));
  const formatValues = JSON.stringify(Object.values(formatCounts));
  const sizeLabels = JSON.stringify(top10.map((f) => path.basename(f.name)));
  const sizeValues = JSON.stringify(top10.map((f) => f.size));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pixora Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --purple: #7C3AED; --purple-light: #A78BFA; --purple-dim: #3b0764;
      --bg: #0f0a1e; --card: #1a0f30; --border: #2d1b4e; --text: #e2e8f0; --dim: #64748b;
    }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    header { background: var(--card); border-bottom: 1px solid var(--border); padding: 1.2rem 2rem; display: flex; align-items: center; gap: 1rem; }
    header h1 { color: var(--purple-light); font-size: 1.5rem; }
    header span { color: var(--dim); font-size: 0.85rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; padding: 2rem; }
    .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 1.4rem 1.8rem; }
    .stat-label { font-size: 0.78rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.5rem; }
    .stat-value { font-size: 2rem; font-weight: 700; color: var(--purple-light); }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; padding: 0 2rem 2rem; }
    @media (max-width: 768px) { .charts { grid-template-columns: 1fr; } }
    .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem; }
    .chart-card h2 { color: var(--purple-light); font-size: 1rem; margin-bottom: 1rem; font-weight: 600; }
    canvas { max-height: 260px; }
    .cdnbox { margin: 0 2rem 2rem; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem; }
    .cdnbox h2 { color: var(--purple-light); font-size: 1rem; margin-bottom: 1rem; }
    .cdnbox code { background: #0f0a1e; padding: 0.6rem 1rem; border-radius: 8px; display: block; color: #a78bfa; font-size: 0.9rem; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <header>
    <h1>⚡ Pixora Dashboard</h1>
    <span>Serving: ${rootDir} — ${images.length} images — ${formatBytes(totalSize)} total</span>
  </header>

  <div class="grid">
    <div class="stat-card">
      <div class="stat-label">Total Images</div>
      <div class="stat-value">${images.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Size</div>
      <div class="stat-value">${formatBytes(totalSize)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Formats</div>
      <div class="stat-value">${Object.keys(formatCounts).length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Largest File</div>
      <div class="stat-value">${top10[0] ? formatBytes(top10[0].size) : '—'}</div>
    </div>
  </div>

  <div class="charts">
    <div class="chart-card">
      <h2>📊 Format Distribution</h2>
      <canvas id="formatChart"></canvas>
    </div>
    <div class="chart-card">
      <h2>📦 Largest Files (bytes)</h2>
      <canvas id="sizeChart"></canvas>
    </div>
  </div>

  <div class="cdnbox">
    <h2>🌐 CDN Simulator — Transform on-the-fly</h2>
    <p style="color:#94a3b8;font-size:0.9rem">Add query params to any served image:</p>
    <code>http://localhost:4000/image.jpg?w=400&amp;format=webp&amp;q=80</code>
    <code>http://localhost:4000/photo.png?w=800&amp;h=600&amp;format=avif</code>
  </div>

  <script>
    const palette = ['#7C3AED','#A78BFA','#C4B5FD','#DDD6FE','#EDE9FE','#6D28D9','#5B21B6','#4C1D95','#8B5CF6','#9333EA'];
    const commonOpts = { plugins: { legend: { labels: { color: '#e2e8f0', font: { size: 12 } } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#2d1b4e' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#2d1b4e' } } } };

    new Chart(document.getElementById('formatChart'), {
      type: 'doughnut',
      data: { labels: ${formatLabels}, datasets: [{ data: ${formatValues}, backgroundColor: palette }] },
      options: { plugins: { legend: { labels: { color: '#e2e8f0' } } } },
    });

    new Chart(document.getElementById('sizeChart'), {
      type: 'bar',
      data: { labels: ${sizeLabels}, datasets: [{ label: 'Bytes', data: ${sizeValues}, backgroundColor: '#7C3AED' }] },
      options: { ...commonOpts, indexAxis: 'y' },
    });
  </script>
</body>
</html>`;
}

// ─── Directory Listing ────────────────────────────────────────────────

function buildDirectoryListing(dirPath: string, urlPath: string, files: string[]): string {
  const rows = files.map((f) => {
    const href = `${urlPath === '/' ? '' : urlPath}/${f}`;
    return `<li><a href="${href}">${f}</a></li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pixora Dev Server — ${urlPath}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f0a1e; color: #e2e8f0; padding: 2rem; }
    h1 { color: #a78bfa; margin-bottom: 1.5rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.4rem 0; }
    a { color: #c4b5fd; text-decoration: none; padding: 0.3rem 0.6rem; border-radius: 6px; display: inline-block; }
    a:hover { background: rgba(124,58,237,0.2); }
    .cdn { background: #1a0f30; border: 1px solid #3b0764; border-radius: 8px; padding: 1rem; margin-top: 1.5rem; font-size: 0.85rem; color: #94a3b8; }
    code { color: #a78bfa; }
  </style>
</head>
<body>
  <h1>⚡ Pixora Dev Server</h1>
  <p style="color:#64748b;margin-bottom:1.5rem">Serving: <code>${dirPath}</code></p>
  <ul>${rows}</ul>
  <div class="cdn">
    <strong style="color:#c4b5fd">CDN Simulator:</strong> Append <code>?w=400&format=webp&q=80</code> to any image URL to transform on-the-fly.
    <br>Visit <a href="/__dashboard" style="color:#a78bfa">/__dashboard</a> for analytics.
  </div>
</body>
</html>`;
}

// ─── Main Server ──────────────────────────────────────────────────────

export async function startServer(dir: string, port: number): Promise<void> {
  const rootDir = path.resolve(dir);

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const [urlPath, queryString = ''] = rawUrl.split('?') as [string, string?];
    const decodedPath = decodeURIComponent(urlPath);

    // ── Dashboard route ──────────────────────────────────────────────
    if (decodedPath === '/__dashboard') {
      try {
        const html = await buildDashboard(rootDir);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(err));
      }
      return;
    }

    const filePath = path.join(rootDir, decodedPath);

    try {
      const stat = await fs.stat(filePath);

      // ── Directory listing ─────────────────────────────────────────
      if (stat.isDirectory()) {
        const entries = await fs.readdir(filePath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(buildDirectoryListing(filePath, decodedPath, entries));
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tiff', '.tif', '.gif'].includes(ext);

      // ── CDN Transform (images with query params) ──────────────────
      if (isImage && queryString) {
        const params = parseCdnParams(queryString);
        if (params.w || params.h || params.format || params.q) {
          try {
            const { buffer, mime } = await transformImage(filePath, params);
            res.writeHead(200, {
              'Content-Type': mime,
              'Content-Length': buffer.length,
              'Cache-Control': 'public, max-age=3600',
              'X-Pixora-CDN': 'transformed',
            });
            res.end(buffer);
            return;
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(`Transform error: ${String(err)}`);
            return;
          }
        }
      }

      // ── Static file serve ─────────────────────────────────────────
      const mime = SUPPORTED_MIME[ext] || 'application/octet-stream';
      const fileBuffer = await fs.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': fileBuffer.length,
        'Cache-Control': 'no-cache',
      });
      res.end(fileBuffer);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${decodedPath}`);
    }
  });

  server.listen(port, () => {
    logger.success(`Dev server running at http://localhost:${port}`);
    logger.info(`Serving: ${rootDir}`);
    logger.dim(`Dashboard: http://localhost:${port}/__dashboard`);
    logger.dim(`CDN: http://localhost:${port}/image.jpg?w=400&format=webp&q=80`);
    logger.dim('Press Ctrl+C to stop.');
  });

  await new Promise<void>((_, reject) => {
    server.on('error', reject);
    process.once('SIGINT',  () => { server.close(); process.exit(0); });
    process.once('SIGTERM', () => { server.close(); process.exit(0); });
  });
}
