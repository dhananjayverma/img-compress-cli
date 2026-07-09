import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import sharp from 'sharp';
import { logger } from './logger.js';
import { analyzeImage } from './analyzer.js';
import { generatePalette } from './palette.js';
import { scoreProject } from './score.js';

// ─── Simple body parser ───────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

// ─── Route Handlers ───────────────────────────────────────────────────

async function handleCompress(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const filePath = body.file as string | undefined;
  const quality = Number(body.quality ?? 80);
  const format = (body.format as string | undefined) ?? 'webp';

  if (!filePath) return sendError(res, 400, 'Missing required field: file');

  const resolved = path.resolve(filePath);
  if (!(await fs.pathExists(resolved))) return sendError(res, 404, `File not found: filePath`);

  const ext = format === 'webp' ? 'webp' : format === 'avif' ? 'avif' : 'jpg';
  const outDir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  const outPath = path.join(outDir, `${base}-api-out.${ext}`);

  let pipeline = sharp(resolved);
  if (format === 'webp') pipeline = pipeline.webp({ quality });
  else if (format === 'avif') pipeline = pipeline.avif({ quality });
  else pipeline = pipeline.jpeg({ quality, mozjpeg: true });

  await pipeline.toFile(outPath);

  const [inStat, outStat] = await Promise.all([fs.stat(resolved), fs.stat(outPath)]);

  sendJson(res, 200, {
    success: true,
    input: { file: resolved, size: inStat.size },
    output: { file: outPath, size: outStat.size },
    savedBytes: inStat.size - outStat.size,
    savedPercent: (((inStat.size - outStat.size) / inStat.size) * 100).toFixed(1),
  });
}

async function handleAnalyze(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const filePath = body.file as string | undefined;
  if (!filePath) return sendError(res, 400, 'Missing required field: file');

  const resolved = path.resolve(filePath);
  if (!(await fs.pathExists(resolved))) return sendError(res, 404, 'File not found');

  const result = await analyzeImage(resolved);
  sendJson(res, 200, result);
}

async function handlePalette(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const filePath = body.file as string | undefined;
  if (!filePath) return sendError(res, 400, 'Missing required field: file');

  const resolved = path.resolve(filePath);
  if (!(await fs.pathExists(resolved))) return sendError(res, 404, 'File not found');

  const palette = await generatePalette(resolved);
  sendJson(res, 200, palette);
}

async function handleScore(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const dir = (body.dir as string | undefined) ?? '.';
  const result = await scoreProject(path.resolve(dir));
  sendJson(res, 200, result);
}

async function handleMeta(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const body = await parseBody(req);
  const filePath = body.file as string | undefined;
  if (!filePath) return sendError(res, 400, 'Missing required field: file');

  const resolved = path.resolve(filePath);
  if (!(await fs.pathExists(resolved))) return sendError(res, 404, 'File not found');

  const metadata = await sharp(resolved).metadata();
  const stat = await fs.stat(resolved);
  sendJson(res, 200, { ...metadata, fileSize: stat.size, filePath: resolved });
}

// ─── Router ───────────────────────────────────────────────────────────

async function router(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const method = req.method?.toUpperCase();
  const url = req.url?.split('?')[0] ?? '/';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (method === 'GET' && url === '/') {
    sendJson(res, 200, {
      name: 'Pixora REST API',
      version: '1.0.0',
      endpoints: [
        { method: 'POST', path: '/compress', body: { file: 'string', quality: 'number?', format: 'webp|avif|jpg?' } },
        { method: 'POST', path: '/analyze',  body: { file: 'string' } },
        { method: 'POST', path: '/palette',  body: { file: 'string' } },
        { method: 'POST', path: '/score',    body: { dir: 'string?' } },
        { method: 'POST', path: '/meta',     body: { file: 'string' } },
      ],
    });
    return;
  }

  if (method === 'GET' && url === '/health') {
    sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  if (method === 'POST') {
    try {
      if (url === '/compress') return await handleCompress(req, res);
      if (url === '/analyze')  return await handleAnalyze(req, res);
      if (url === '/palette')  return await handlePalette(req, res);
      if (url === '/score')    return await handleScore(req, res);
      if (url === '/meta')     return await handleMeta(req, res);
    } catch (err) {
      sendError(res, 500, err instanceof Error ? err.message : 'Internal error');
      return;
    }
  }

  sendError(res, 404, `Route not found: ${method} ${url}`);
}

// ─── Server ───────────────────────────────────────────────────────────

export async function startApiServer(port = 3333): Promise<void> {
  const server = http.createServer((req, res) => {
    router(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    });
  });

  server.listen(port, () => {
    logger.success(`Pixora REST API running at http://localhost:${port}`);
    logger.info('Available endpoints:');
    logger.dim('  POST /compress  — compress an image');
    logger.dim('  POST /analyze   — analyze image heuristics');
    logger.dim('  POST /palette   — extract color palette');
    logger.dim('  POST /score     — get performance score for a folder');
    logger.dim('  POST /meta      — get image metadata');
    logger.dim('  GET  /health    — health check');
    logger.dim('\nPress Ctrl+C to stop.');
  });

  await new Promise<void>((_, reject) => {
    server.on('error', reject);
    process.once('SIGINT', () => { server.close(); process.exit(0); });
    process.once('SIGTERM', () => { server.close(); process.exit(0); });
  });
}
