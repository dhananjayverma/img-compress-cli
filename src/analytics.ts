import { loadHistory } from './database.js';
import { formatBytes } from './utils.js';
import chalk from 'chalk';

// ─── Analytics Report ─────────────────────────────────────────────────

export interface AnalyticsSummary {
  today: {
    runs: number;
    savedBytes: number;
    filesProcessed: number;
    durationMs: number;
  };
  thisMonth: {
    runs: number;
    savedBytes: number;
    filesProcessed: number;
  };
  allTime: {
    runs: number;
    savedBytes: number;
    filesProcessed: number;
  };
  recentRuns: {
    runId: string;
    startedAt: string;
    savedBytes: number;
    filesProcessed: number;
    savedPercent: number;
    durationMs: number;
  }[];
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const history = await loadHistory();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);

  const todayRuns = history.filter((r) => r.startedAt.startsWith(todayStr));
  const monthRuns = history.filter((r) => r.startedAt.startsWith(monthStr));

  const sum = (arr: typeof history, key: keyof (typeof history)[0]) =>
    arr.reduce((acc, r) => acc + (r[key] as number), 0);

  return {
    today: {
      runs: todayRuns.length,
      savedBytes: sum(todayRuns, 'savedBytes'),
      filesProcessed: sum(todayRuns, 'filesProcessed'),
      durationMs: sum(todayRuns, 'durationMs'),
    },
    thisMonth: {
      runs: monthRuns.length,
      savedBytes: sum(monthRuns, 'savedBytes'),
      filesProcessed: sum(monthRuns, 'filesProcessed'),
    },
    allTime: {
      runs: history.length,
      savedBytes: sum(history, 'savedBytes'),
      filesProcessed: sum(history, 'filesProcessed'),
    },
    recentRuns: history
      .slice(-10)
      .reverse()
      .map((r) => ({
        runId: r.runId,
        startedAt: r.startedAt,
        savedBytes: r.savedBytes,
        filesProcessed: r.filesProcessed,
        savedPercent: r.savedPercent,
        durationMs: r.durationMs,
      })),
  };
}

export function printAnalytics(summary: AnalyticsSummary): void {
  const accent = chalk.hex('#7C3AED');
  const dim = chalk.dim;
  const bold = chalk.bold;

  console.log('\n' + accent.bold('📈 Pixora Optimization Analytics'));
  console.log(dim('────────────────────────────────────────────────────────'));

  console.log(`\n${bold('📅 Today')}`);
  console.log(`  Runs:            ${summary.today.runs}`);
  console.log(`  Files Processed: ${summary.today.filesProcessed}`);
  console.log(`  Saved:           ${chalk.green(formatBytes(summary.today.savedBytes))}`);
  console.log(
    `  Time Spent:      ${(summary.today.durationMs / 1000).toFixed(1)}s`
  );

  console.log(`\n${bold('🗓️  This Month')}`);
  console.log(`  Runs:            ${summary.thisMonth.runs}`);
  console.log(`  Files Processed: ${summary.thisMonth.filesProcessed}`);
  console.log(`  Saved:           ${chalk.green(formatBytes(summary.thisMonth.savedBytes))}`);

  console.log(`\n${bold('🏆 All Time')}`);
  console.log(`  Total Runs:      ${summary.allTime.runs}`);
  console.log(`  Files Processed: ${summary.allTime.filesProcessed}`);
  console.log(`  Total Saved:     ${chalk.green(formatBytes(summary.allTime.savedBytes))}`);

  if (summary.recentRuns.length > 0) {
    console.log(`\n${bold('🕐 Recent Runs:')}`);
    summary.recentRuns.forEach((run) => {
      const date = new Date(run.startedAt).toLocaleString();
      console.log(
        `  ${dim(run.runId.slice(0, 16))}  ${date}  ` +
          `${run.filesProcessed} files  ` +
          chalk.green(`-${formatBytes(run.savedBytes)}`) +
          `  (${run.savedPercent.toFixed(1)}%)`
      );
    });
  }

  console.log('');
}
