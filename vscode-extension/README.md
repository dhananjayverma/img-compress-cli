# Pixora VS Code Extension Blueprint

This directory contains the blueprint for the **Pixora VS Code Extension**.

## Features
- **Right-Click Optimization**: Right-click any image in the file explorer and choose "Pixora: Compress Image"
- **Project Scan**: Run asset auditing on the workspace to find unoptimized assets, duplicate assets, and missing loading attributes.
- **Side-by-Side Visual Diff**: Preview the compressed image alongside the original.

## How to build and run
1. Install vsce: `npm install -g @vscode/vsce`
2. Run `npm install` inside this folder.
3. Press `F5` in VS Code to open a Extension Development Host window.
4. To package the extension: `vsce package`
