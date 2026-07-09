import fs from 'fs-extra';
import path from 'path';
import { runBuildPipeline } from './build.js';
import { runAudit, printAuditReport } from './audit.js';
import { getAnalyticsSummary, printAnalytics } from './analytics.js';
import { generateReports } from './reports.js';
import { startApiServer } from './api.js';
import { logger } from './logger.js';

export interface WorkflowStep {
  run: string; // e.g. "scan" | "compress" | "convert:webp" | "convert:avif" | "blurhash" | "upload" | "report" | "serve" | "api"
  options?: Record<string, any>;
}

export interface WorkflowConfig {
  name: string;
  steps: (string | WorkflowStep)[];
}

export async function runWorkflowFile(workflowPath: string, targetFolder = '.'): Promise<void> {
  const resolvedPath = path.resolve(workflowPath);
  if (!(await fs.pathExists(resolvedPath))) {
    throw new Error(`Workflow config not found at: ${resolvedPath}`);
  }

  let workflow: WorkflowConfig;
  try {
    workflow = await fs.readJson(resolvedPath);
  } catch {
    const mod = await import(resolvedPath);
    workflow = mod.default || mod;
  }

  logger.info(`Running workflow: ${workflow.name || 'Unnamed Workflow'}`);
  const resolvedTarget = path.resolve(targetFolder);

  for (const step of workflow.steps) {
    const stepName = typeof step === 'string' ? step : step.run;
    const stepOpts = typeof step === 'string' ? {} : (step.options ?? {});

    logger.info(`⚡ Step: ${stepName}`);

    if (stepName === 'scan' || stepName === 'audit') {
      const result = await runAudit(resolvedTarget);
      printAuditReport(result);
    } else if (stepName === 'compress' || stepName === 'build') {
      const result = await runBuildPipeline({
        input: resolvedTarget,
        output: stepOpts.output || path.join(resolvedTarget, 'dist'),
        quality: stepOpts.quality || 80,
      });
      logger.success(`Pipeline finished. Saved: ${result.savedPercent.toFixed(1)}%`);
    } else if (stepName.startsWith('convert:')) {
      const format = stepName.split(':')[1];
      const { compressImages } = await import('./compress.js');
      await compressImages({
        input: resolvedTarget,
        formats: [format!],
        overwrite: true,
        recursive: true,
        watch: false,
        report: false,
        dryRun: false,
        clean: false,
        smartQuality: false,
        preserveMetadata: false,
        concurrency: 4,
        ignore: [],
      });
    } else if (stepName === 'report') {
      await generateReports(resolvedTarget, {
        html: true,
        json: true,
        csv: true,
        outputDir: stepOpts.outputDir || resolvedTarget,
      });
    } else if (stepName === 'api') {
      await startApiServer(stepOpts.port || 3333);
    } else if (stepName === 'analytics') {
      const summary = await getAnalyticsSummary();
      printAnalytics(summary);
    } else {
      logger.warn(`Unknown workflow step: ${stepName}`);
    }
  }

  logger.success(`Workflow completed successfully.`);
}
