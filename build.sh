#!/bin/bash
# Build script for TripleZ standalone app
set -e

echo "=========================================="
echo "TripleZ - Build Script"
echo "=========================================="

echo "[1/4] Installing Python dependencies..."
pip install -r src/backend/requirements.txt

echo "[2/4] Installing frontend dependencies..."
cd src/frontend && npm ci && cd ../..

echo "[3/4] Building Next.js frontend..."
cd src/frontend && npm run build && cd ../..

echo "[4/4] Building standalone executable..."
pyinstaller app.spec

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[5/5] Creating macOS .app bundle..."
    python3 create_app_bundle.py
fi

echo ""
echo "=========================================="
echo "Build complete!"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Output: dist/TripleZ.app"
    echo "Run: open dist/TripleZ.app"
else
    echo "Output: dist/TripleZ"
fi
echo "=========================================="
