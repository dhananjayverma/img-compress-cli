import fs from 'fs-extra';
import path from 'path';
import { runBuildPipeline } from './build.js';
import { updateHtmlFile } from './integrations.js';
import { logger } from './logger.js';
import chalk from 'chalk';

export async function runFrameworkRecipe(recipeName: string, rootDir = '.'): Promise<void> {
  const resolvedRoot = path.resolve(rootDir);
  const lowerName = recipeName.toLowerCase();

  logger.info(`Running framework recipe: ${recipeName.toUpperCase()} for project at ${resolvedRoot}`);

  let assetsInput = resolvedRoot;
  let assetsOutput = path.join(resolvedRoot, 'dist');
  let codeDir = resolvedRoot;

  if (lowerName === 'nextjs' || lowerName === 'next') {
    assetsInput = path.join(resolvedRoot, 'public');
    assetsOutput = path.join(resolvedRoot, 'public');
    codeDir = path.join(resolvedRoot, 'src');
    if (!(await fs.pathExists(codeDir))) codeDir = resolvedRoot;
  } else if (lowerName === 'react' || lowerName === 'vite') {
    assetsInput = path.join(resolvedRoot, 'public');
    assetsOutput = path.join(resolvedRoot, 'public');
    codeDir = path.join(resolvedRoot, 'src');
  } else if (lowerName === 'astro') {
    assetsInput = path.join(resolvedRoot, 'src', 'assets');
    assetsOutput = path.join(resolvedRoot, 'public');
    codeDir = path.join(resolvedRoot, 'src', 'pages');
  }

  // 1. Run Pipeline
  logger.info(`Step 1: Running asset pipeline (Source: ${assetsInput} → Destination: ${assetsOutput})`);
  await fs.ensureDir(assetsInput);
  await runBuildPipeline({
    input: assetsInput,
    output: assetsOutput,
    quality: 80,
  });

  // 2. Scan code files and upgrade refs to WebP/AVIF
  logger.info(`Step 2: Upgrading HTML/JSX code components...`);
  const { glob } = await import('fast-glob');
  const codeFiles = await glob('**/*.{html,htm,jsx,tsx,vue,svelte}', {
    cwd: codeDir,
    absolute: true,
  });

  for (const file of codeFiles) {
    try {
      await updateHtmlFile(file);
    } catch {}
  }

  logger.success(chalk.green(`✔ Recipe ${recipeName.toUpperCase()} completed successfully.`));
}
