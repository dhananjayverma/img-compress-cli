import * as vscode from 'vscode';
import { compress, runAudit } from '@dhananjay_verma9546/pixora-compress';

export function activate(context: vscode.ExtensionContext) {
  // 1. Right click compress file command
  const compressCommand = vscode.commands.registerCommand(
    'vscode-pixora.compressFile',
    async (uri: vscode.Uri) => {
      if (!uri) return;

      const filePath = uri.fsPath;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pixora: Compressing Asset...',
          cancellable: false,
        },
        async () => {
          try {
            const result = await compress(filePath, {
              overwrite: true,
              quality: 80,
              smartQuality: true,
            });

            const stats = result.results[0];
            if (stats) {
              const savedKb = ((stats.inputBytes - stats.outputBytes) / 1024).toFixed(1);
              vscode.window.showInformationMessage(
                `⚡ Pixora Optimized! Saved ${savedKb} KB (${result.summary.savedPercent}%)`
              );
            }
          } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Pixora failed: ${error.message}`);
          }
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

      const rootPath = workspaceFolders[0].uri.fsPath;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pixora: Auditing Workspace assets...',
          cancellable: false,
        },
        async () => {
          try {
            const auditResult = await runAudit(rootPath);
            const channel = vscode.window.createOutputChannel('Pixora Audits');
            channel.show();

            channel.appendLine(`⚡ Pixora Audit Report for ${rootPath}`);
            channel.appendLine(`=========================================`);
            channel.appendLine(`Unoptimized count: ${auditResult.missingWebP.length} assets missing WebP/AVIF equivalents`);
            channel.appendLine(`Total files evaluated: ${auditResult.totalImages}`);
            channel.appendLine(`=========================================`);
          } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Pixora Audit failed: ${error.message}`);
          }
        }
      );
    }
  );

  context.subscriptions.push(compressCommand, auditCommand);
}

export function deactivate() {}
