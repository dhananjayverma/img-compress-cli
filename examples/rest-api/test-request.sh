#!/bin/bash

# Ensure local REST API is running before executing this script
# Run: npm run dev api --port 3333

echo "Sending binary compression request to Pixora REST API..."

# Compress local file on-the-fly using direct binary stream and download output
curl -X POST "http://localhost:3333/compress?quality=75&format=webp" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@/Users/laptopbazaar/Desktop/image/tests/__fixtures__/red.jpg" \
  --output ./red-optimized.webp

echo "Optimized image saved to ./red-optimized.webp!"
