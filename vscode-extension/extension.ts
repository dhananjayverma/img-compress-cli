import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { AuditResult } from '@dhananjay_verma9546/pixora-compress';

function getCliExecutor(): string {
  // Resolve path to the monorepo local CLI
  const localCliPath = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
  if (fs.existsSync(localCliPath)) {
    return `node "${localCliPath}"`;
  }
  return 'pixora';
}

function isCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('pixora -v', (err) => {
      resolve(!err);
    });
  });
}

async function ensureCliInstalled(): Promise<boolean> {
  // If we are in dev mode using local cli, bypass global installation check
  if (getCliExecutor().startsWith('node')) {
    return true;
  }

  const available = await isCliAvailable();
  if (available) {
    return true;
  }

  const selection = await vscode.window.showWarningMessage(
    'Pixora CLI is required to compress and audit assets, but it was not found on your PATH.',
    'Install Globally',
    'Cancel'
  );

  if (selection !== 'Install Globally') {
    return false;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Installing Pixora CLI globally...',
        cancellable: false,
      },
      async () => {
        return new Promise<void>((resolve, reject) => {
          exec('npm install -g @dhananjay_verma9546/pixora-compress', (err, stdout, stderr) => {
            if (err) {
              reject(new Error(stderr || err.message));
            } else {
              resolve();
            }
          });
        });
      }
    );
    vscode.window.showInformationMessage('⚡ Pixora CLI installed successfully!');
    return true;
  } catch (error: any) {
    vscode.window.showErrorMessage(`❌ Failed to install Pixora CLI: ${error.message}`);
    return false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  // 1. Right click compress file command
  const compressCommand = vscode.commands.registerCommand(
    'vscode-pixora.compressFile',
    async (uri: vscode.Uri) => {
      if (!uri) return;

      const hasCli = await ensureCliInstalled();
      if (!hasCli) return;

      const filePath = uri.fsPath;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pixora: Compressing Asset...',
          cancellable: false,
        },
        async () => {
          return new Promise<void>((resolve) => {
            const executor = getCliExecutor();
            const command = `${executor} compress "${filePath}" --overwrite --quality 80 --smart-quality --json`;
            exec(command, (err, stdout, stderr) => {
              try {
                if (err) {
                  throw new Error(stderr || err.message);
                }

                const result = JSON.parse(stdout);
                if (!result.success) {
                  throw new Error(result.error || 'Compression failed');
                }

                const stats = result.results?.[0];
                if (stats) {
                  const savedKb = ((stats.inputBytes - stats.outputBytes) / 1024).toFixed(1);
                  vscode.window.showInformationMessage(
                    `⚡ Pixora Optimized! Saved ${savedKb} KB (${result.summary.savedPercent}%)`
                  );
                } else {
                  vscode.window.showInformationMessage('⚡ Pixora: Image already fully optimized.');
                }
              } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Pixora failed: ${error.message}`);
              } finally {
                resolve();
              }
            });
          });
        }
      );
    }
  );

  // 2. Audit workspace command
  const auditCommand = vscode.commands.registerCommand(
    'vscode-pixora.auditWorkspace',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace open to audit.');
        return;
      }

      const hasCli = await ensureCliInstalled();
      if (!hasCli) return;

      const rootPath = workspaceFolders[0].uri.fsPath;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pixora: Auditing Workspace assets...',
          cancellable: false,
        },
        async () => {
          return new Promise<void>((resolve) => {
            const executor = getCliExecutor();
            const command = `${executor} audit "${rootPath}" --json`;
            exec(command, (err, stdout, stderr) => {
              try {
                if (err) {
                  throw new Error(stderr || err.message);
                }

                const auditResult: AuditResult = JSON.parse(stdout);
                const channel = vscode.window.createOutputChannel('Pixora Audits');
                channel.show();

                channel.appendLine(`⚡ Pixora Audit Report for ${rootPath}`);
                channel.appendLine(`=========================================`);
                channel.appendLine(`Unoptimized count: ${auditResult.missingWebP.length} assets missing WebP/AVIF equivalents`);
                channel.appendLine(`Total files evaluated: ${auditResult.totalImages}`);
                channel.appendLine(`=========================================`);
              } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Pixora Audit failed: ${error.message}`);
              } finally {
                resolve();
              }
            });
          });
        }
      );
    }
  );

  context.subscriptions.push(compressCommand, auditCommand);
}

export function deactivate() {}
