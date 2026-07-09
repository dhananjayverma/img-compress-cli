# Running Pixora in Docker

Run Pixora's Developer Asset Optimization API anywhere without local Node.js or native dependency installation.

## Quick Start

### 1. Build the Docker Image
```bash
docker build -t pixora-platform .
```

### 2. Start the REST API Server
```bash
docker run -d -p 3333:3333 --name pixora-api pixora-platform
```

### 3. Compress a Local Folder using Docker CLI
If you want to run batch compression on local images:
```bash
docker run --rm -v "$(pwd)/images:/data" pixora-platform node dist/cli.js compress /data --output /data/optimized
```
