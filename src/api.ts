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

function parseRawBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer: Buffer, contentType: string): { filename?: string; buffer: Buffer } | null {
  const match = contentType.match(/boundary=(.+)/);
  if (!match) return null;
  const boundary = '--' + match[1];
  
  const boundaryBuffer = Buffer.from(boundary);
  const parts: Buffer[] = [];
  
  let index = buffer.indexOf(boundaryBuffer);
  if (index === -1) return null;
  
  while (index !== -1) {
    const nextIndex = buffer.indexOf(boundaryBuffer, index + boundaryBuffer.length);
    if (nextIndex === -1) break;
    
    const part = buffer.slice(index + boundaryBuffer.length, nextIndex);
    parts.push(part);
    index = nextIndex;
  }
  
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    
    const header = part.slice(0, headerEnd).toString();
    const body = part.slice(headerEnd + 4, part.length - 2); // subtract \r\n
    
    if (header.includes('filename=')) {
      const filenameMatch = header.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : undefined;
      return { filename, buffer: body };
    }
  }
  
  return null;
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
  const contentType = req.headers['content-type'] || '';
  const parsedUrl = new URL(req.url || '', 'http://localhost');
  const quality = Number(parsedUrl.searchParams.get('quality') || 80);
  const format = parsedUrl.searchParams.get('format') || 'webp';

  // 1. Upload mode (Multipart or direct binary stream)
  if (contentType.includes('multipart/form-data') || contentType.startsWith('image/') || contentType === 'application/octet-stream') {
    try {
      const rawData = await parseRawBody(req);
      let bufferToProcess = rawData;
      let originalName = 'uploaded-file';

      if (contentType.includes('multipart/form-data')) {
        const parsedPart = parseMultipart(rawData, contentType);
        if (!parsedPart) {
          return sendError(res, 400, 'Invalid multipart/form-data payload');
        }
        bufferToProcess = parsedPart.buffer;
        if (parsedPart.filename) originalName = parsedPart.filename;
      }

      let pipeline = sharp(bufferToProcess);

      if (format === 'webp') pipeline = pipeline.webp({ quality });
      else if (format === 'avif') pipeline = pipeline.avif({ quality });
      else pipeline = pipeline.jpeg({ quality, mozjpeg: true });

      const outputBuffer = await pipeline.toBuffer();
      const mime = format === 'webp' ? 'image/webp' : format === 'avif' ? 'image/avif' : 'image/jpeg';

      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': outputBuffer.length,
        'Access-Control-Allow-Origin': '*',
        'X-Pixora-Filename': originalName,
        'X-Pixora-Original-Size': bufferToProcess.length.toString(),
        'X-Pixora-Compressed-Size': outputBuffer.length.toString(),
      });
      res.end(outputBuffer);
      return;
    } catch (err) {
      return sendError(res, 400, `Compression failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Local file compression via JSON
  const body = await parseBody(req);
  const filePath = body.file as string | undefined;
  const jsonQuality = Number(body.quality ?? quality);
  const jsonFormat = (body.format as string | undefined) ?? format;

  if (!filePath) return sendError(res, 400, 'Missing required field: file');

  const resolved = path.resolve(filePath);
  if (!(await fs.pathExists(resolved))) return sendError(res, 404, `File not found: ${filePath}`);

  const ext = jsonFormat === 'webp' ? 'webp' : jsonFormat === 'avif' ? 'avif' : 'jpg';
  const outDir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  const outPath = path.join(outDir, `${base}-api-out.${ext}`);

  let pipeline = sharp(resolved);
  if (jsonFormat === 'webp') pipeline = pipeline.webp({ quality: jsonQuality });
  else if (jsonFormat === 'avif') pipeline = pipeline.avif({ quality: jsonQuality });
  else pipeline = pipeline.jpeg({ quality: jsonQuality, mozjpeg: true });

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
      version: '1.1.0',
      description: 'Developer Asset Optimization API',
      endpoints: [
        { method: 'POST', path: '/compress', body: { file: 'string', quality: 'number?', format: 'webp|avif|jpg?' }, description: 'Compress file on local disk' },
        { method: 'POST', path: '/compress?quality=80&format=webp', body: 'Binary image buffer / multipart file upload', description: 'Compress and return binary image on-the-fly' },
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
    logger.dim('  POST /compress  — compress local path OR upload image binary/multipart to compress on-the-fly');
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
