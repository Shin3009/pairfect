import Phaser from 'phaser';
import { STONE } from './Board';

/**
 * Vẽ hình cho các ô bằng code, không cần file ảnh.
 * Khi có bộ hình riêng (PNG/SVG), chỉ cần load ảnh trong preload()
 * với key `tile-1`, `tile-2`, ..., `stone` và bỏ hàm này đi.
 */

export const TEXTURE_SIZE = 128;
export const MAX_TYPES = 40;
export const STONE_KEY = 'stone';

const COLORS = [0xe8505b, 0x3a86ff, 0x2a9d8f, 0xf4a259, 0x8e5ad8];
type ShapeFn = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, color: number) => void;

const poly = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, pts: [number, number][]) =>
  g.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(cx + x, cy + y)), true);

const regular = (n: number, r: number, rot = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

const SHAPES: ShapeFn[] = [
  (g, cx, cy, s) => g.fillCircle(cx, cy, s * 0.3),
  (g, cx, cy, s) => g.fillRoundedRect(cx - s * 0.26, cy - s * 0.26, s * 0.52, s * 0.52, s * 0.06),
  (g, cx, cy, s) => poly(g, cx, cy + s * 0.04, regular(3, s * 0.34)),
  (g, cx, cy, s) => poly(g, cx, cy, regular(4, s * 0.34)),
  (g, cx, cy, s) =>
    poly(g, cx, cy + s * 0.02,
      Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 === 0 ? s * 0.34 : s * 0.15;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
      })),
  (g, cx, cy, s) => poly(g, cx, cy, regular(6, s * 0.31, 0)),
  (g, cx, cy, s) => {
    g.fillRect(cx - s * 0.09, cy - s * 0.3, s * 0.18, s * 0.6);
    g.fillRect(cx - s * 0.3, cy - s * 0.09, s * 0.6, s * 0.18);
  },
  (g, cx, cy, s, color) => {
    g.lineStyle(s * 0.11, color, 1);
    g.strokeCircle(cx, cy, s * 0.24);
  },
];

export function tileKey(type: number): string {
  return `tile-${type}`;
}

/** Khóa texture cho một giá trị trên bàn: ô hình hoặc đá. */
export function textureFor(value: number): string {
  return value === STONE ? STONE_KEY : tileKey(value);
}

/** Đá chắn đường: khối xám có vết nứt, khác hẳn nền kem của ô hình. */
function createStoneTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(STONE_KEY)) return;
  const S = TEXTURE_SIZE;
  const g = scene.add.graphics();
  g.fillStyle(0x3d474f, 1).fillRoundedRect(4, 10, S - 8, S - 12, 18);
  g.fillStyle(0x7b8790, 1).fillRoundedRect(4, 2, S - 8, S - 12, 18);
  // Mặt sáng phía trên bên trái cho cảm giác khối đá
  g.fillStyle(0x95a1a9, 1);
  poly(g, 0, 0, [[18, 14], [80, 12], [62, 40], [16, 52]]);
  g.lineStyle(5, 0x4b555d, 1);
  g.beginPath().moveTo(34, 30).lineTo(56, 56).lineTo(46, 78).lineTo(66, 102).strokePath();
  g.beginPath().moveTo(56, 56).lineTo(88, 48).lineTo(104, 64).strokePath();
  g.generateTexture(STONE_KEY, S, S);
  g.destroy();
}

export function createTileTextures(scene: Phaser.Scene): void {
  createStoneTexture(scene);
  const S = TEXTURE_SIZE;
  for (let t = 1; t <= MAX_TYPES; t++) {
    const key = tileKey(t);
    if (scene.textures.exists(key)) continue;
    const i = t - 1;
    const color = COLORS[i % COLORS.length];
    const shape = SHAPES[i % SHAPES.length];

    const g = scene.add.graphics();
    // Bóng đổ + nền ô
    g.fillStyle(0xc9b79c, 1);
    g.fillRoundedRect(4, 10, S - 8, S - 12, 18);
    g.fillStyle(0xfffaf0, 1);
    g.fillRoundedRect(4, 2, S - 8, S - 12, 18);
    // Hình
    g.fillStyle(color, 1);
    shape(g, S / 2, S / 2 - 4, S, color);
    g.generateTexture(key, S, S);
    g.destroy();
  }
}
