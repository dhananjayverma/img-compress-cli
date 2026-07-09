import { optimize } from 'svgo';
import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';

export async function optimizeSvgFile(
  inputFile: string,
  outputFile: string
): Promise<void> {
  await fs.ensureDir(path.dirname(outputFile));

  try {
    const svgData = await fs.readFile(inputFile, 'utf-8');

    const result = optimize(svgData, {
      path: inputFile,
      multipass: true,
      plugins: ['preset-default'],
    });

    await fs.writeFile(outputFile, result.data, 'utf-8');
    logger.success(`SVG optimized: ${path.basename(inputFile)}`);
  } catch (error) {
    logger.error(
      `SVG optimization failed for ${path.basename(inputFile)}: ${
        error instanceof Error ? error.message : String(error)
      }. Falling back to plain copy.`
    );

    try {
      await fs.copy(inputFile, outputFile, { overwrite: true });
    } catch (copyError) {
      throw new Error(
        `Both SVG optimization and fallback copy failed for ${inputFile}: ${
          copyError instanceof Error ? copyError.message : String(copyError)
        }`
      );
    }
  }
}
