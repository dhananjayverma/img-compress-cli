# Privacy Policy for Pixora

Last updated: July 9, 2026

At Pixora, we are committed to protecting your privacy. This Privacy Policy describes how your information is handled when using the Pixora CLI, VS Code Extension, Vite Plugin, Next.js Plugin, GitHub Action, and Docker images (collectively, the "Software").

## 1. Local-First Processing & Zero Data Transmission
Pixora is designed as a local-first developer tool.
* **On-Device Execution**: All image compression, optimization, subject detection, auditing, and formatting are executed entirely on your local machine using the `sharp` library and local CPU/GPU resources.
* **No Server Uploads**: Your source images, codebase structures, and directories are **never** uploaded to, stored on, or shared with external servers, cloud providers, or third-party databases.
* **Local API Server**: When running in "Local REST API Mode" or inside a Docker container, the API server operates strictly within your local network environment (`localhost` or your private network bounds). No telemetry or assets are transmitted outside your environment.

## 2. No Personal Data Collection
* We do **not** collect, store, or process any personal data, such as names, email addresses, IP addresses (except as necessary for local socket connections on your own host), or physical locations.
* We do **not** use tracking cookies, analytics SDKs, or user behavior tracking mechanisms.

## 3. Third-Party Integrations
* **Git & Version Control**: The pre-commit hook only operates on your local Git repository.
* **CI/CD & GitHub Actions**: When using the Pixora GitHub Action, the execution occurs within your own secure GitHub Actions runner environment. No data is sent to external platforms.
* **VS Code Marketplace**: The VS Code Extension complies with the security guidelines of the Visual Studio Code Marketplace and does not execute remote code or collect metrics.

## 4. Changes to This Policy
We may update our Privacy Policy from time to time. Any changes will be posted in this file within the repository.

## 5. Contact Us
If you have any questions or feedback regarding this Privacy Policy, please open an issue in our repository.
