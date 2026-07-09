"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
function isCliAvailable() {
    return new Promise((resolve) => {
        (0, child_process_1.exec)('pixora -v', (err) => {
            resolve(!err);
        });
    });
}
async function ensureCliInstalled() {
    const available = await isCliAvailable();
    if (available) {
        return true;
    }
    const selection = await vscode.window.showWarningMessage('Pixora CLI is required to compress and audit assets, but it was not found on your PATH.', 'Install Globally', 'Cancel');
    if (selection !== 'Install Globally') {
        return false;
    }
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Installing Pixora CLI globally...',
            cancellable: false,
        }, async () => {
            return new Promise((resolve, reject) => {
                (0, child_process_1.exec)('npm install -g @dhananjay_verma9546/pixora-compress', (err, stdout, stderr) => {
                    if (err) {
                        reject(new Error(stderr || err.message));
                    }
                    else {
                        resolve();
                    }
                });
            });
        });
        vscode.window.showInformationMessage('⚡ Pixora CLI installed successfully!');
        return true;
    }
    catch (error) {
        vscode.window.showErrorMessage(`❌ Failed to install Pixora CLI: ${error.message}`);
        return false;
    }
}
function activate(context) {
    // 1. Right click compress file command
    const compressCommand = vscode.commands.registerCommand('vscode-pixora.compressFile', async (uri) => {
        if (!uri)
            return;
        const hasCli = await ensureCliInstalled();
        if (!hasCli)
            return;
        const filePath = uri.fsPath;
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Pixora: Compressing Asset...',
            cancellable: false,
        }, async () => {
            return new Promise((resolve) => {
                const command = `pixora compress "${filePath}" --overwrite --quality 80 --smart-quality --json`;
                (0, child_process_1.exec)(command, (err, stdout, stderr) => {
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
                            vscode.window.showInformationMessage(`⚡ Pixora Optimized! Saved ${savedKb} KB (${result.summary.savedPercent}%)`);
                        }
                        else {
                            vscode.window.showInformationMessage('⚡ Pixora: Image already fully optimized.');
                        }
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`❌ Pixora failed: ${error.message}`);
                    }
                    finally {
                        resolve();
                    }
                });
            });
        });
    });
    // 2. Audit workspace command
    const auditCommand = vscode.commands.registerCommand('vscode-pixora.auditWorkspace', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace open to audit.');
            return;
        }
        const hasCli = await ensureCliInstalled();
        if (!hasCli)
            return;
        const rootPath = workspaceFolders[0].uri.fsPath;
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Pixora: Auditing Workspace assets...',
            cancellable: false,
        }, async () => {
            return new Promise((resolve) => {
                const command = `pixora audit "${rootPath}" --json`;
                (0, child_process_1.exec)(command, (err, stdout, stderr) => {
                    try {
                        if (err) {
                            throw new Error(stderr || err.message);
                        }
                        const auditResult = JSON.parse(stdout);
                        const channel = vscode.window.createOutputChannel('Pixora Audits');
                        channel.show();
                        channel.appendLine(`⚡ Pixora Audit Report for ${rootPath}`);
                        channel.appendLine(`=========================================`);
                        channel.appendLine(`Unoptimized count: ${auditResult.missingWebP.length} assets missing WebP/AVIF equivalents`);
                        channel.appendLine(`Total files evaluated: ${auditResult.totalImages}`);
                        channel.appendLine(`=========================================`);
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`❌ Pixora Audit failed: ${error.message}`);
                    }
                    finally {
                        resolve();
                    }
                });
            });
        });
    });
    context.subscriptions.push(compressCommand, auditCommand);
}
function deactivate() { }
