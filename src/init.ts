import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { logger } from './logger.js';
import os from 'os';

export async function runInitWizard(): Promise<void> {
  logger.info('Welcome to the Pixora Interactive Configuration Wizard! ⚡');
  console.log('Let\'s create a configuration file for your project.\n');

  const cpus = os.cpus().length || 1;

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'formats',
      message: 'Select target output formats:',
      choices: [
        { name: 'WebP (Modern, highly compressed)', value: 'webp', checked: true },
        { name: 'AVIF (Next-gen, superior compression)', value: 'avif', checked: false },
        { name: 'JPEG (Standard photo compatibility)', value: 'jpg', checked: false },
        { name: 'PNG (Lossless, transparency)', value: 'png', checked: false },
      ],
    },
    {
      type: 'input',
      name: 'quality',
      message: 'Set default quality (1-100):',
      default: 80,
      validate: (input: string) => {
        const val = parseInt(input, 10);
        if (isNaN(val) || val < 1 || val > 100) {
          return 'Quality must be a number between 1 and 100';
        }
        return true;
      },
      filter: (input: string) => parseInt(input, 10),
    },
    {
      type: 'confirm',
      name: 'smartQuality',
      message: 'Enable Smart Quality Detection? (Different qualities for photo/logo/screenshot)',
      default: true,
    },
    {
      type: 'input',
      name: 'output',
      message: 'Default output directory (leave blank for source-compressed):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'recursive',
      message: 'Scan folders recursively by default?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'preserveMetadata',
      message: 'Preserve image metadata (EXIF/GPS/XMP)?',
      default: false,
    },
    {
      type: 'input',
      name: 'concurrency',
      message: `Set parallel compression workers (1-${cpus * 2}):`,
      default: Math.min(cpus, 8),
      validate: (input: string) => {
        const val = parseInt(input, 10);
        if (isNaN(val) || val < 1) {
          return 'Concurrency must be at least 1';
        }
        return true;
      },
      filter: (input: string) => parseInt(input, 10),
    },
    {
      type: 'input',
      name: 'ignore',
      message: 'Glob patterns to ignore (comma separated):',
      default: '**/node_modules/**, **/.git/**',
    },
  ]);

  const configContent = `export default {
  quality: ${answers.quality},
  recursive: ${answers.recursive},
  output: ${answers.output ? `'${answers.output}'` : 'undefined'},
  formats: ${JSON.stringify(answers.formats)},
  ignore: ${JSON.stringify(answers.ignore.split(',').map((s: string) => s.trim()).filter(Boolean))},
  preserveMetadata: ${answers.preserveMetadata},
  concurrency: ${answers.concurrency},
  smartQuality: ${answers.smartQuality},
};
`;

  const configFile = path.join(process.cwd(), 'pixora.config.js');
  await fs.writeFile(configFile, configContent, 'utf-8');
  console.log('');
  logger.success(`Configuration file created at: ${configFile}`);
}
