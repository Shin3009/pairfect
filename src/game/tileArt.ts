import Phaser from 'phaser';
import { STONE } from './Board';
import { groupPacks } from './imagePacks';
import { loadTileArt } from './storage';

/**
 * Hình cho các ô. Người chơi chọn một bộ hình ở menu (TileArtScene); có các bộ vẽ bằng code
 * và các bộ ảnh đặt trong src/assets/tiles (xem imagePacks.ts).
 * Mỗi bộ có texture riêng `tile-<mã bộ>-<loại>`, vẽ ở lần dùng đầu; đá (`stone`) dùng chung.
 * Ô trên bàn có thể cao hơn rộng (xem textureHeight): khi đó khóa có thêm đuôi `-h<chiều cao>`.
 */

export const TEXTURE_SIZE = 128;
export const MAX_TYPES = 40;
export const STONE_KEY = 'stone';

/** Chiều cao texture tăng theo bậc này, để chỉ phải vẽ vài cỡ ô cao dù tỉ lệ màn hình là bao nhiêu. */
const TALL_STEP = 8;

/**
 * Chiều cao texture cho ô có tỉ lệ cao / rộng `aspect` (>= 1); chiều rộng luôn là TEXTURE_SIZE.
 * Làm tròn xuống theo bậc TALL_STEP nên ô không bao giờ cao quá tỉ lệ đã cho.
 */
export function textureHeight(aspect: number): number {
  return TEXTURE_SIZE + TALL_STEP * Math.max(0, Math.floor((TEXTURE_SIZE * (aspect - 1)) / TALL_STEP + 1e-9));
}

/** Khóa texture cỡ cao `h`: ô vuông giữ khóa gốc. */
const sized = (key: string, h: number) => (h === TEXTURE_SIZE ? key : `${key}-h${h}`);

/** Cạnh của khung vuông mà emoji hoặc ảnh được phóng cho vừa. */
const FACE_BOX = TEXTURE_SIZE * 0.66;
/** Tâm của hình trên ô: cao hơn giữa ô một chút vì mép dưới của ô là phần bóng đổ. */
const FACE_X = TEXTURE_SIZE / 2;
const FACE_Y = TEXTURE_SIZE / 2 - 4;

export interface TileArt {
  /** Mã lưu trong localStorage và nằm trong khóa texture. */
  id: string;
  /** Tên hiện trong game. */
  name: string;
  /** Vẽ hình của loại `type` (từ 1) lên nền ô. Bộ ảnh trả về Promise, xong khi ảnh tải xong và đã vẽ. */
  draw: (ctx: CanvasRenderingContext2D, type: number) => void | Promise<void>;
  /** Ghi công tác giả (nội dung credits.txt của bộ ảnh), hiện trong màn chọn hình ô. */
  credits?: string;
}

// ---------------- Trái cây & con vật (emoji) ----------------

/**
 * Trái cây (thêm bắp ngô) và con vật, vẽ bằng emoji của hệ điều hành.
 * Màn chơi dùng loại 1..types (xem Board.generate), nên các hình đầu danh sách
 * là những hình khác nhau rõ nhất về màu lẫn dáng; màn sau mới thêm dần các hình dễ nhầm hơn.
 * Chỉ dùng emoji từ Unicode 8 trở về trước để Android 7 (minSdk 24) cũng có đủ.
 */
const EMOJI = [
  // Màn 1 (loại 1–11), màn 2 thêm loại 12
  '🍎', '🐶', '🍌', '🐱', '🍇', '🐼', '🍉', '🐸', '🍊', '🐷', '🍓', '🐳',
  // Màn 2–5 (13–28)
  '🐰', '🐯', '🍍', '🐧', '🍋', '🐵', '🐞', '🐙', '🍒', '🐢', '🐔', '🦁', '🌽', '🐘', '🐝', '🍐',
  // Màn 6–7 (29–40)
  '🐮', '🐌', '🦃', '🐤', '🐻', '🦄', '🐠', '🐴', '🐭', '🐛', '🐦', '🐑',
];

const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

/** Bóng mờ dưới hình để hình màu trắng (thỏ, gà, cừu...) vẫn nổi trên nền kem. */
function faceShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'rgba(80, 60, 30, 0.35)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
}

/**
 * Vẽ emoji vào giữa ô, phóng cho vừa khung FACE_BOX.
 * Căn theo khung bao thật của nét vẽ chứ không theo dòng chữ, vì mỗi bộ emoji
 * (Android, Samsung, Windows...) đặt hình lệch khỏi dòng chữ một kiểu.
 */
function drawEmoji(ctx: CanvasRenderingContext2D, emoji: string): void {
  const base = 100;
  ctx.font = `${base}px ${EMOJI_FONT}`;
  const m = ctx.measureText(emoji);
  const left = m.actualBoundingBoxLeft || 0;
  const right = m.actualBoundingBoxRight || base;
  const ascent = m.actualBoundingBoxAscent || base * 0.8;
  const descent = m.actualBoundingBoxDescent || base * 0.2;
  const k = FACE_BOX / Math.max(left + right, ascent + descent);
  ctx.font = `${base * k}px ${EMOJI_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  faceShadow(ctx);
  ctx.fillText(emoji, FACE_X + ((left - right) * k) / 2, FACE_Y + ((ascent - descent) * k) / 2);
}

// ---------------- Hình khối (bộ hình đầu tiên của game) ----------------

/** 8 hình × 5 màu; 8 và 5 nguyên tố cùng nhau nên 40 loại không trùng nhau. */
const SHAPE_COLORS = ['#e8505b', '#3a86ff', '#2a9d8f', '#f4a259', '#8e5ad8'];

type Pt = [number, number];

const regular = (n: number, r: number, rot = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

function fillPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], dy = 0): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y + dy) : ctx.lineTo(x, y + dy)));
  ctx.closePath();
  ctx.fill();
}

/** Vẽ quanh gốc tọa độ (đã dời về tâm ô); s là cạnh texture. */
const SHAPES: ((ctx: CanvasRenderingContext2D, s: number) => void)[] = [
  (ctx, s) => {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  (ctx, s) => fillRoundedRect(ctx, -s * 0.26, -s * 0.26, s * 0.52, s * 0.52, s * 0.06),
  (ctx, s) => fillPolygon(ctx, regular(3, s * 0.34), s * 0.04),
  (ctx, s) => fillPolygon(ctx, regular(4, s * 0.34)),
  (ctx, s) =>
    fillPolygon(
      ctx,
      Array.from({ length: 10 }, (_, i): Pt => {
        const r = i % 2 === 0 ? s * 0.34 : s * 0.15;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return [Math.cos(a) * r, Math.sin(a) * r];
      }),
      s * 0.02,
    ),
  (ctx, s) => fillPolygon(ctx, regular(6, s * 0.31, 0)),
  (ctx, s) => {
    ctx.fillRect(-s * 0.09, -s * 0.3, s * 0.18, s * 0.6);
    ctx.fillRect(-s * 0.3, -s * 0.09, s * 0.6, s * 0.18);
  },
  (ctx, s) => {
    ctx.lineWidth = s * 0.11;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
    ctx.stroke();
  },
];

function drawShape(ctx: CanvasRenderingContext2D, type: number): void {
  const i = type - 1;
  ctx.fillStyle = ctx.strokeStyle = SHAPE_COLORS[i % SHAPE_COLORS.length];
  ctx.translate(FACE_X, FACE_Y);
  SHAPES[i % SHAPES.length](ctx, TEXTURE_SIZE);
}

// ---------------- Bộ ảnh (src/assets/tiles/<tên bộ>/) ----------------

/** Ảnh lớn được thu nhỏ còn cạnh này trước khi cắt viền trong suốt, cho nhẹ. */
const MAX_SOURCE = 512;

/**
 * Ảnh đã cắt hết phần viền trong suốt, để hình nhỏ nằm giữa khoảng trống rộng (như sprite) vẫn phóng đủ to.
 * Mỗi URL chỉ tải một lần; tải lỗi thì là null và ô chỉ có nền.
 */
const faces = new Map<string, Promise<HTMLCanvasElement | null>>();

function loadFace(url: string): Promise<HTMLCanvasElement | null> {
  let face = faces.get(url);
  if (!face) {
    face = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(pixelUpscale(trimTransparent(img)));
      img.onerror = () => {
        console.warn('Không tải được ảnh hình ô:', url);
        resolve(null);
      };
      img.src = url;
    });
    faces.set(url, face);
  }
  return face;
}

function trimTransparent(img: HTMLImageElement): HTMLCanvasElement {
  // SVG không ghi kích thước thì naturalWidth là 0
  const w0 = img.naturalWidth || TEXTURE_SIZE;
  const h0 = img.naturalHeight || TEXTURE_SIZE;
  const k = Math.min(1, MAX_SOURCE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k));
  const h = Math.max(1, Math.round(h0 * k));
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, w, h);

  const data = sctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  // Ảnh trong suốt hoàn toàn hoặc không có viền trong suốt: giữ nguyên
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return src;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(src, -x0, -y0);
  return out;
}

/**
 * Ảnh nhỏ hơn khung hình (như sprite pixel art 64x64) mà phóng thẳng thì bị nhòe.
 * Phóng trước theo bội số nguyên, giữ nguyên từng điểm ảnh, rồi drawFace thu nhỏ mượt về khung.
 */
function pixelUpscale(face: HTMLCanvasElement): HTMLCanvasElement {
  const side = Math.max(face.width, face.height);
  if (side >= FACE_BOX) return face;
  const n = Math.ceil((FACE_BOX * 3) / side);
  const out = document.createElement('canvas');
  out.width = face.width * n;
  out.height = face.height * n;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(face, 0, 0, out.width, out.height);
  return out;
}

function drawFace(ctx: CanvasRenderingContext2D, face: HTMLCanvasElement): void {
  const k = FACE_BOX / Math.max(face.width, face.height);
  const w = face.width * k;
  const h = face.height * k;
  ctx.imageSmoothingQuality = 'high';
  faceShadow(ctx);
  ctx.drawImage(face, FACE_X - w / 2, FACE_Y - h / 2, w, h);
}

/** Tìm ảnh lúc build: thêm hay bớt thư mục thì phải chạy lại `npm run dev` / build. */
const PACK_FILES = import.meta.glob<string>('../assets/tiles/*/*.{png,webp,jpg,jpeg,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Ghi công tùy chọn của từng bộ: file credits.txt nằm cạnh ảnh, theo thư mục. */
const PACK_CREDITS = new Map(
  Object.entries(
    import.meta.glob<string>('../assets/tiles/*/credits.txt', { eager: true, query: '?raw', import: 'default' }),
  ).map(([path, text]) => [path.split('/').slice(-2)[0], text.trim()]),
);

const IMAGE_ARTS: TileArt[] = groupPacks(PACK_FILES).flatMap(({ folder, urls }) => {
  if (urls.length < MAX_TYPES) {
    console.warn(`Bộ hình ô "${folder}" chỉ có ${urls.length} ảnh, cần ít nhất ${MAX_TYPES}: bỏ qua.`);
    return [];
  }
  return [
    {
      id: `pack-${folder}`,
      name: folder,
      credits: PACK_CREDITS.get(folder),
      draw: (ctx, type) =>
        loadFace(urls[type - 1]).then((face) => {
          if (face) drawFace(ctx, face);
        }),
    },
  ];
});

// ---------------- Danh sách bộ hình và texture ----------------

/** Các bộ hình người chơi chọn được; bộ đầu tiên là mặc định. */
export const TILE_ARTS: TileArt[] = [
  { id: 'fruits', name: 'Trái cây & con vật', draw: (ctx, type) => drawEmoji(ctx, EMOJI[type - 1]) },
  { id: 'shapes', name: 'Hình khối', draw: drawShape },
  ...IMAGE_ARTS,
];

/** Bộ hình đã chọn; chưa chọn, hoặc bộ đã chọn không còn (đã xóa thư mục ảnh), thì là bộ mặc định. */
export function selectedTileArt(): TileArt {
  const id = loadTileArt();
  return TILE_ARTS.find((a) => a.id === id) ?? TILE_ARTS[0];
}

/** Bộ hình của các ô trên bàn, chốt lại mỗi lần createTileTextures chạy (lúc mở menu hoặc vào màn). */
let current = TILE_ARTS[0];

function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * Khóa texture của loại `type` trong bộ `art`, cao `h` (xem textureHeight); vẽ ở lần dùng đầu.
 * Bộ ảnh thì nền ô hiện ngay, hình được vẽ thêm khi ảnh tải xong.
 */
export function artTexture(scene: Phaser.Scene, art: TileArt, type: number, h = TEXTURE_SIZE): string {
  const key = sized(`tile-${art.id}-${type}`, h);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, TEXTURE_SIZE, h)!;
  const ctx = tex.getContext();
  const S = TEXTURE_SIZE;
  // Bóng đổ + nền ô
  ctx.fillStyle = '#c9b79c';
  fillRoundedRect(ctx, 4, 10, S - 8, h - 12, 18);
  ctx.fillStyle = '#fffaf0';
  fillRoundedRect(ctx, 4, 2, S - 8, h - 12, 18);
  // Các hàm vẽ hình chỉ biết ô vuông S x S: dời xuống để hình nằm giữa nền ô cao.
  // Dời trước save() để lệnh vẽ ảnh chạy sau (khi ảnh tải xong, sau restore()) vẫn được dời.
  ctx.translate(0, (h - S) / 2);
  ctx.save();
  const done = art.draw(ctx, type);
  if (done) void done.then(() => tex.refresh());
  ctx.restore();
  tex.refresh();
  return key;
}

/** Khóa texture của loại `type` trong bộ hình đang dùng, cao `h`. */
export function tileKey(type: number, h = TEXTURE_SIZE): string {
  return sized(`tile-${current.id}-${type}`, h);
}

/** Khóa texture cho một giá trị trên bàn: ô hình hoặc đá, cao `h`. */
export function textureFor(value: number, h = TEXTURE_SIZE): string {
  return value === STONE ? sized(STONE_KEY, h) : tileKey(value, h);
}

const poly = (g: Phaser.GameObjects.Graphics, pts: Pt[]) =>
  g.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);

/** Đá chắn đường: khối xám có vết nứt, khác hẳn nền kem của ô hình. Dùng chung cho mọi bộ hình. */
function createStoneTexture(scene: Phaser.Scene, h: number): void {
  const key = sized(STONE_KEY, h);
  if (scene.textures.exists(key)) return;
  const S = TEXTURE_SIZE;
  const g = scene.add.graphics();
  g.fillStyle(0x3d474f, 1).fillRoundedRect(4, 10, S - 8, h - 12, 18);
  g.fillStyle(0x7b8790, 1).fillRoundedRect(4, 2, S - 8, h - 12, 18);
  // Mặt sáng và vết nứt vẽ cho ô vuông, dời xuống giữa ô cao
  g.translateCanvas(0, (h - S) / 2);
  // Mặt sáng phía trên bên trái cho cảm giác khối đá
  g.fillStyle(0x95a1a9, 1);
  poly(g, [[18, 14], [80, 12], [62, 40], [16, 52]]);
  g.lineStyle(5, 0x4b555d, 1);
  g.beginPath().moveTo(34, 30).lineTo(56, 56).lineTo(46, 78).lineTo(66, 102).strokePath();
  g.beginPath().moveTo(56, 56).lineTo(88, 48).lineTo(104, 64).strokePath();
  g.generateTexture(key, S, h);
  g.destroy();
}

/** Chốt bộ hình đang chọn cho tileKey / textureFor và vẽ sẵn mọi loại của bộ đó (ô vuông). */
export function createTileTextures(scene: Phaser.Scene): void {
  current = selectedTileArt();
  ensureTileTextures(scene, TEXTURE_SIZE);
}

/** Vẽ sẵn mọi loại của bộ hình đang dùng và đá, cỡ cao `h` (xem textureHeight). Đã có thì thôi. */
export function ensureTileTextures(scene: Phaser.Scene, h: number): void {
  createStoneTexture(scene, h);
  for (let t = 1; t <= MAX_TYPES; t++) artTexture(scene, current, t, h);
}
