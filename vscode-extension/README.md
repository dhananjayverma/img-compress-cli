# ⚡ Pixora: Developer Asset Optimization Platform

Bring the power of **Pixora** directly into your editor! The Pixora VS Code extension provides automated, lightning-fast developer asset optimization and workspace auditing straight from the file explorer and Command Palette.

Designed to be **ultra-lightweight (< 10 KB)**, the extension automatically hooks into the global Pixora CLI to optimize images, eliminate exact duplicates, and analyze modern format coverage.

---

## ✨ Features

### 📸 1. Right-Click Image Optimization
Optimize single or multiple images directly from the VS Code Explorer:
* **Context-menu integration**: Right-click any supported image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.gif`, `.svg`) and select **Pixora: Compress Image**.
* **Lossless & Smart Lossy Compression**: High-fidelity compression that preserves visual quality while slashing file sizes by up to 80%+.
* **Auto-cache verification**: Files that haven't changed are instantly skipped, speeding up subsequent optimizations.

### 📊 2. Project Asset Auditing
Audit your entire project to find optimization opportunities:
* Open the Command Palette (`Cmd + Shift + P` / `Ctrl + Shift + P`) and run **`Pixora: Audit Workspace for Unoptimized Assets`**.
* Generates a detailed audit report in the **Pixora Audits** output channel containing:
  - **Modern Format Coverage**: Counts how many images are missing WebP or AVIF equivalents.
  - **Largest Images Report**: Highlights top files consuming excessive disk space.
  - **Duplicate Detection**: Identifies exact and visually similar images that can be consolidated.

### 🧠 3. Smart CLI Auto-Detection
* The extension checks if you have the global CLI tool (`@dhananjay_verma9546/pixora-compress`) installed.
* If missing, it prompts you and installs it globally with **a single click**—no manual command copying required.

---

## 🚀 Installation & Prerequisites

### Step 1: Install the Extension
Install it via the VS Code Marketplace or load the `.vsix` package:
```bash
code --install-extension vscode-pixora-1.0.0.vsix
```

### Step 2: Install Pixora CLI (Global)
The extension relies on the Pixora CLI for compression engine operations.
You can install it manually in your terminal:
```bash
npm install -g @dhananjay_verma9546/pixora-compress
```
*(Alternatively, simply trigger any command in VS Code, and the extension will prompt you to install it automatically!)*

---

## 🛠️ How It Works (Under the Hood)

Pixora uses a **decoupled runner architecture** to keep the VS Code extension responsive and incredibly small.
Instead of embedding heavy native image-processing binaries (like `libvips` and `sharp`) into the `.vsix` file (which would blow the package size up to **23+ MB**), the extension acts as a frontend controller that:
1. Validates the existence of the `pixora` CLI on your machine.
2. Spawns the CLI as a background process (`child_process.exec`) inside your workspace context.
3. Communicates using structured machine-readable JSON protocols.
4. Renders interactive notifications and custom Output Channels inside VS Code.

This ensures a rapid installation process, zero memory overhead, and allows your CLI tool to update independently of the VS Code extension.

---

## ⚙️ Development & Contribution

If you want to contribute to the extension or test changes locally:

1. Clone the repository and install dependencies in the extension directory:
   ```bash
   cd vscode-extension
   npm install
   ```
2. Build the main CLI project in the root folder so the compiled code is ready:
   ```bash
   npm run build
   ```
3. Open the `vscode-extension` workspace in VS Code.
4. Open `extension.ts` and press **`F5`** (or go to `Run and Debug` -> `Launch Extension`) to start an **Extension Development Host** debug window.
5. Package the extension into a `.vsix` file:
   ```bash
   npx @vscode/vsce package
   ```

---

## 📄 License
This extension is licensed under the [MIT License](LICENSE).
