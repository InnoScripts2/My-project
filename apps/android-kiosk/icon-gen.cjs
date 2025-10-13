// Генерация валидных PNG placeholder иконок для launcher в недостающих плотностях.
// В дальнейшем заменить на брендированный адаптивный набор.

const fs = require('fs');
const path = require('path');

const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9+KXcAAAAASUVORK5CYII='; // 1x1 прозрачный PNG
const buf = Buffer.from(base64, 'base64');

const resDir = path.join(__dirname, 'app', 'src', 'main', 'res');
const targets = [
  'mipmap-xhdpi/ic_launcher.png',
  'mipmap-xxhdpi/ic_launcher.png',
  'mipmap-xxxhdpi/ic_launcher.png',
];

for (const rel of targets) {
  const full = path.join(resDir, rel);
  try {
    fs.writeFileSync(full, buf);
    console.log('Wrote placeholder icon:', rel, 'size=', buf.length, 'bytes');
  } catch (e) {
    console.error('Failed write', rel, e);
    process.exitCode = 1;
  }
}
