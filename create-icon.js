import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = path.join(__dirname, 'vscode-extension', 'images');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

sharp({
  create: {
    width: 128,
    height: 128,
    channels: 4,
    background: { r: 31, g: 41, b: 55, alpha: 1 }
  }
})
.composite([{
  input: Buffer.from(
    '<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">' +
    '  <defs>' +
    '    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '      <stop offset="0%" style="stop-color:#818CF8;stop-opacity:1" />' +
    '      <stop offset="100%" style="stop-color:#EC4899;stop-opacity:1" />' +
    '    </linearGradient>' +
    '  </defs>' +
    '  <rect x="24" y="24" width="80" height="80" rx="20" fill="url(#grad)" />' +
    '  <path d="M44 64 L56 76 L84 48" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none" />' +
    '</svg>'
  ),
  top: 0,
  left: 0
}])
.png()
.toFile(path.join(dir, 'icon.png'))
.then(() => console.log('Icon created successfully'))
.catch(err => console.error(err));
