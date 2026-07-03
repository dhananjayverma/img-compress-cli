import path from 'node:path';
import chalk from 'chalk';
import type { ProcessResult, ReportSummary } from './types.js';
import { formatBytes, formatPercent } from './utils.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  // Strip ANSI codes for width calculation
  const stripped = text.replace(/\u001b\[[0-9;]*m/g, '');
  const padding = Math.max(0, width - stripped.length);
  return align === 'right' ? ' '.repeat(padding) + text : text + ' '.repeat(padding);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return '…' + text.slice(-(maxLen - 1));
}

// ─── Table report ────────────────────────────────────────────────────

export function printDetailedReport(results: ProcessResult[], summary: ReportSummary): void {
  const processedResults = results.filter((r) => !r.skipped);

  if (processedResults.length === 0) {
    console.log(chalk.dim('\n  No files to report.\n'));
    return;
  }

  // Header
  console.log('');
  console.log(chalk.hex('#7C3AED').bold('  📊 Compression Report'));
  console.log(chalk.dim('  ' + '─'.repeat(72)));

  // Column headers
  const headerFile = pad(chalk.bold.dim('File'), 32);
  const headerInput = pad(chalk.bold.dim('Input'), 10, 'right');
  const headerOutput = pad(chalk.bold.dim('Output'), 10, 'right');
  const headerSaved = pad(chalk.bold.dim('Saved'), 10, 'right');
  const headerFormat = pad(chalk.bold.dim('Format'), 8);
  console.log(`  ${headerFile} ${headerInput} ${headerOutput} ${headerSaved} ${headerFormat}`);
  console.log(chalk.dim('  ' + '─'.repeat(72)));

  // Rows
  for (const item of processedResults) {
    const filename = truncate(path.basename(item.source), 30);
    const inputSize = formatBytes(item.inputBytes);
    const outputSize = formatBytes(item.outputBytes);
    const saved = item.inputBytes - item.outputBytes;
    const percent = item.inputBytes > 0 ? (saved / item.inputBytes) * 100 : 0;

    const savedText =
      saved >= 0
        ? chalk.green(`-${formatPercent(percent)}`)
        : chalk.red(`+${formatPercent(Math.abs(percent))}`);

    const formatTag =
      item.format === 'webp'
        ? chalk.hex('#4FC3F7')(item.format)
        : item.format === 'avif'
          ? chalk.hex('#FF7043')(item.format)
          : chalk.dim(item.format);

    console.log(
      `  ${pad(chalk.white(filename), 32)} ${pad(chalk.dim(inputSize), 10, 'right')} ${pad(chalk.cyan(outputSize), 10, 'right')} ${pad(savedText, 10, 'right')} ${pad(formatTag, 8)}`,
    );
  }

  // Skipped files
  if (summary.filesSkipped > 0) {
    console.log(chalk.dim('  ' + '─'.repeat(72)));
    console.log(chalk.dim(`  ⏩ ${summary.filesSkipped} file(s) skipped (GIF / unsupported)`));
  }

  // Summary footer
  console.log(chalk.dim('  ' + '─'.repeat(72)));

  const totalInput = formatBytes(summary.inputBytes);
  const totalOutput = formatBytes(summary.outputBytes);
  const totalSaved = formatBytes(Math.abs(summary.savedBytes));
  const totalPercent = formatPercent(Math.abs(summary.savedPercent));
  const savedColor = summary.savedBytes >= 0 ? chalk.green : chalk.red;
  const savedSign = summary.savedBytes >= 0 ? '-' : '+';

  console.log(
    `  ${pad(chalk.bold('Total'), 32)} ${pad(chalk.dim(totalInput), 10, 'right')} ${pad(chalk.cyan.bold(totalOutput), 10, 'right')} ${pad(savedColor.bold(`${savedSign}${totalSaved}`), 10, 'right')}`,
  );
  console.log(
    `  ${pad('', 32)} ${pad('', 10)} ${pad('', 10)} ${pad(savedColor(`${savedSign}${totalPercent}`), 10, 'right')}`,
  );
  console.log('');
}

/** Compact one-line summary (used when --report is NOT enabled) */
export function printCompactSummary(summary: ReportSummary): void {
  if (summary.filesProcessed === 0) return;

  const savedColor = summary.savedBytes >= 0 ? chalk.green : chalk.red;
  const sign = summary.savedBytes >= 0 ? '-' : '+';
  console.log(
    chalk.dim('\n  Total: ') +
      chalk.white(`${summary.filesProcessed} files`) +
      chalk.dim(' · ') +
      chalk.dim(`${formatBytes(summary.inputBytes)} → `) +
      chalk.cyan(formatBytes(summary.outputBytes)) +
      chalk.dim(' · ') +
      savedColor(`${sign}${formatBytes(Math.abs(summary.savedBytes))} (${sign}${formatPercent(Math.abs(summary.savedPercent))})`),
  );
  console.log('');
}
