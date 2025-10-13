#!/bin/sh
# Build script for Docker container

set -e

echo "Building kiosk-agent..."

# Try to build with npm
if npm run build; then
    echo "TypeScript build succeeded"
    exit 0
fi

echo "TypeScript build failed, attempting to copy existing JavaScript files..."

# Create dist directory
mkdir -p dist

# Copy all JavaScript files from src to dist, maintaining directory structure
find src -name "*.js" -type f | while read -r file; do
    # Get relative path from src
    rel_path="${file#src/}"
    # Create parent directory in dist
    mkdir -p "dist/$(dirname "$rel_path")"
    # Copy file
    cp "$file" "dist/$rel_path"
done

# Copy public files if script exists
if [ -f scripts/copy-public.cjs ]; then
    node scripts/copy-public.cjs || echo "Warning: copy-public failed"
fi

echo "Build complete (using existing JS files)"
ls -la dist/ || echo "Warning: dist directory check failed"
