import chalk from 'chalk';

const BRAND = chalk.hex('#7C3AED').bold('pixora');
const SEPARATOR = chalk.dim('│');

export const logger = {
  isSilent: false,

  /** Branded info message */
  info(message: string): void {
    if (this.isSilent) return;
    console.log(`${BRAND} ${SEPARATOR} ${chalk.cyan('ℹ')} ${message}`);
  },

  /** Success with green check */
  success(message: string): void {
    if (this.isSilent) return;
    console.log(`${BRAND} ${SEPARATOR} ${chalk.green('✔')} ${message}`);
  },

  /** Warning in yellow */
  warn(message: string): void {
    if (this.isSilent) return;
    console.log(`${BRAND} ${SEPARATOR} ${chalk.yellow('⚠')} ${chalk.yellow(message)}`);
  },

  /** Error in red */
  error(message: string): void {
    if (this.isSilent) return;
    console.error(`${BRAND} ${SEPARATOR} ${chalk.red('✖')} ${chalk.red(message)}`);
  },

  /** Dim secondary info */
  dim(message: string): void {
    if (this.isSilent) return;
    console.log(`${BRAND} ${SEPARATOR} ${chalk.dim(message)}`);
  },

  /** Raw console log (no prefix) */
  raw(message: string): void {
    if (this.isSilent) return;
    console.log(message);
  },

  /** Print the Pixora branded banner */
  banner(): void {
    if (this.isSilent) return;
    console.log('');
    console.log(
      chalk.hex('#7C3AED').bold('  ⚡ pixora') +
        chalk.dim(' v1.1.0') +
        chalk.dim('  — Developer Asset Optimization Platform')
    );
    console.log(
      chalk.dim('  compress  convert  resize  audit  compare  generate  watch  init  undo')
    );
    console.log('');
  },
};
