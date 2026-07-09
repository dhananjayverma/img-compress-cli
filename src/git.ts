import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { compressImages } from './compress.js';
import { logger } from './logger.js';

export async function installGitHook(projectRoot = '.'): Promise<void> {
  const resolved = path.resolve(projectRoot);
  const gitDir = path.join(resolved, '.git');

  if (!(await fs.pathExists(gitDir))) {
    throw new Error('Not a git repository. Cannot install hook.');
  }

  const hooksDir = path.join(gitDir, 'hooks');
  await fs.ensureDir(hooksDir);

  const preCommitHook = path.join(hooksDir, 'pre-commit');

  const hookContent = `#!/bin/sh
# Pixora Git Pre-Commit Hook
# Automatically optimize newly added images before commit
echo "⚡ Pixora: Optimizing staged images..."
node ./dist/cli.js git-optimize
git add -u
`;

  await fs.writeFile(preCommitHook, hookContent, { mode: 0o755 });
  logger.success(`Pre-commit Git hook successfully installed → ${preCommitHook}`);
}

export async function optimizeStagedImages(): Promise<void> {
  try {
    // Find staged files
    const stdout = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' });
    const stagedFiles = stdout.split('\n').map((f) => f.trim()).filter(Boolean);

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
    const stagedImages = stagedFiles
      .map((f) => path.resolve(f))
      .filter((f) => imageExtensions.includes(path.extname(f).toLowerCase()));

    if (stagedImages.length === 0) {
      logger.info('No new or modified staged images found.');
      return;
    }

    logger.info(`Optimizing ${stagedImages.length} staged images…`);
    for (const image of stagedImages) {
      if (await fs.pathExists(image)) {
        await compressImages({
          input: image,
          overwrite: true,
          recursive: false,
          quality: 80,
          formats: [path.extname(image).slice(1).toLowerCase()],
          ignore: [],
          watch: false,
          report: false,
          dryRun: false,
          clean: false,
          smartQuality: false,
          preserveMetadata: false,
          concurrency: 1,
        });
        logger.success(`Optimized staged image: ${path.basename(image)}`);
      }
    }
  } catch (error) {
    logger.error(`Git optimization hook failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
