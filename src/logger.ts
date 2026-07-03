import chalk from 'chalk';

const PREFIX = chalk.hex('#7C3AED').bold('img-compress');
const SEPARATOR = chalk.dim('│');

export const logger = {
  /** Branded info message */
  info(message: string): void {
    console.log(`${PREFIX} ${SEPARATOR} ${message}`);
  },

  /** Success with green check */
  success(message: string): void {
    console.log(`${PREFIX} ${SEPARATOR} ${chalk.green('✔')} ${message}`);
  },

  /** Warning in yellow */
  warn(message: string): void {
    console.log(`${PREFIX} ${SEPARATOR} ${chalk.yellow('⚠')} ${chalk.yellow(message)}`);
  },

  /** Error in red */
  error(message: string): void {
    console.error(`${PREFIX} ${SEPARATOR} ${chalk.red('✖')} ${chalk.red(message)}`);
  },

  /** Dim secondary info */
  dim(message: string): void {
    console.log(`${PREFIX} ${SEPARATOR} ${chalk.dim(message)}`);
  },

  /** Raw console log (no prefix) */
  raw(message: string): void {
    console.log(message);
  },

  /** Print the branded banner */
  banner(): void {
    console.log('');
    console.log(chalk.hex('#7C3AED').bold('  ⚡ img-compress') + chalk.dim(' v1.0.0'));
    console.log(chalk.dim('  Fast, zero-config image optimization'));
    console.log('');
  },
};
