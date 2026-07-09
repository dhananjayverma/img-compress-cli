import { load } from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';

export async function updateHtmlFile(filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const $ = load(content);
    let modified = false;

    $('img').each((_, element) => {
      const src = $(element).attr('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        const ext = path.extname(src);
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
          const baseName = path.basename(src, ext);
          const dir = path.dirname(src);

          // Build a picture tag replacement
          const webpSrc = path.join(dir, `${baseName}.webp`);
          const avifSrc = path.join(dir, `${baseName}.avif`);

          const pictureNode = $('<picture></picture>');
          pictureNode.append(`<source srcset="${avifSrc}" type="image/avif">`);
          pictureNode.append(`<source srcset="${webpSrc}" type="image/webp">`);
          
          // Copy original img node and its attributes
          const newImg = $(element).clone();
          pictureNode.append(newImg);

          $(element).replaceWith(pictureNode);
          modified = true;
        }
      }
    });

    if (modified) {
      await fs.writeFile(filePath, $.html(), 'utf-8');
      logger.success(`Automatically updated HTML references in: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Failed to update HTML file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function updateMarkdownFile(filePath: string): Promise<void> {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    // Regex matching ![alt](src)
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let modified = false;

    while ((match = imgRegex.exec(content)) !== null) {
      const alt = match[1];
      const src = match[2];
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        const ext = path.extname(src);
        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
          const baseName = path.basename(src, ext);
          const dir = path.dirname(src);
          const webpSrc = path.join(dir, `${baseName}.webp`);

          // Replace with webp equivalent
          content = content.replace(match[0], `![${alt}](${webpSrc})`);
          modified = true;
        }
      }
    }

    if (modified) {
      await fs.writeFile(filePath, content, 'utf-8');
      logger.success(`Automatically updated Markdown references in: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Failed to update Markdown file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
