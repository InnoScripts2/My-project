const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'src', 'public');
const targetDir = path.join(__dirname, '..', 'dist', 'public');

if (!fs.existsSync(sourceDir)) {
  // Nothing to copy; keep build pipeline silent.
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

/**
 * Recursively copy directory contents.
 */
function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(sourceDir, targetDir);
