// Xuất icon app Android và favicon web từ hai lớp SVG gốc trong resources/icon/. Chạy: npm run icons
// Các file xuất ra được commit cùng repo: build-apk.ps1 chép resources/android/res/ vào project Android
// (thư mục android/ được tạo lại nên không sửa tay), còn public/ được Vite chép nguyên vào dist/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = fileURLToPath(new URL('../', import.meta.url));

function write(path, data) {
  mkdirSync(dirname(root + path), { recursive: true });
  writeFileSync(root + path, data);
  console.log(path);
}

// Hai lớp vẽ trên khung 108dp của adaptive icon (viewBox -25..125); phần hiện ra là 0..100.
const layer = (name) => readFileSync(`${root}resources/icon/${name}.svg`, 'utf8');
const inner = (svg) =>
  svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const background = layer('background');
const foreground = layer('foreground');

const SQUARE = '<rect width="100" height="100"/>';
const ROUNDED = '<rect width="100" height="100" rx="22"/>';
const CIRCLE = '<circle cx="50" cy="50" r="50"/>';

/** Icon phẳng: ghép hai lớp, chỉ giữ phần hiện ra, cắt theo hình `clip`. */
const flat = (clip) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
  `<defs><clipPath id="clip">${clip}</clipPath></defs>` +
  `<g clip-path="url(#clip)">${inner(background)}${inner(foreground)}</g></svg>`;

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

/** File .ico chứa sẵn ảnh PNG (Windows Vista trở lên và mọi trình duyệt đều đọc được). */
function ico(svg, sizes) {
  const images = sizes.map((size) => png(svg, size));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at);
    header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(images[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

// ---------------- Android
// Android 8+ dùng adaptive icon (nền + hình, launcher tự cắt theo hình tròn, bo góc...).
// Android 7 dùng ic_launcher / ic_launcher_round đã cắt sẵn.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(DENSITIES)) {
  const dir = `resources/android/res/mipmap-${name}`;
  write(`${dir}/ic_launcher_background.png`, png(background, 108 * scale));
  write(`${dir}/ic_launcher_foreground.png`, png(foreground, 108 * scale));
  write(`${dir}/ic_launcher.png`, png(flat(ROUNDED), 48 * scale));
  write(`${dir}/ic_launcher_round.png`, png(flat(CIRCLE), 48 * scale));
}
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<!-- Tạo bởi scripts/icons.mjs -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
write('resources/android/res/mipmap-anydpi-v26/ic_launcher.xml', adaptive);
write('resources/android/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptive);
// Ảnh icon 512x512 để tải lên Google Play Console (Play tự bo góc).
write('resources/play-store-icon.png', png(flat(SQUARE), 512));

// ---------------- Web
write('public/favicon.svg', flat(ROUNDED));
write('public/favicon.ico', ico(flat(ROUNDED), [16, 32, 48]));
// iOS tự bo góc icon thêm vào màn hình chính, và tô đen phần trong suốt, nên để vuông kín.
write('public/apple-touch-icon.png', png(flat(SQUARE), 180));
