import Phaser from 'phaser';

/**
 * Biểu tượng cho các nút, vẽ bằng Canvas 2D giống hình các ô (xem tileArt.ts), không cần file ảnh.
 * Hình vẽ màu trắng trên khung 24x24 rồi phóng lên ICON_SIZE; khi hiển thị thì tô màu bằng setTint.
 */
export type IconName = 'hint' | 'shuffle' | 'edit' | 'sound' | 'mute';

const ICON_SIZE = 64;

/** Cái loa (thân và miệng loa) ở nửa trái khung, dùng cho Âm thanh và Tắt tiếng. */
function speaker(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(3, 9);
  ctx.lineTo(7, 9);
  ctx.lineTo(12, 4.5);
  ctx.lineTo(12, 19.5);
  ctx.lineTo(7, 15);
  ctx.lineTo(3, 15);
  ctx.closePath();
  ctx.fill();
}

const DRAW: Record<IconName, (ctx: CanvasRenderingContext2D) => void> = {
  // Bóng đèn
  hint: (ctx) => {
    ctx.beginPath();
    ctx.arc(12, 9.5, 6.5, 0.8 * Math.PI, 0.2 * Math.PI);
    ctx.lineTo(15.4, 16.2);
    ctx.lineTo(8.6, 16.2);
    ctx.closePath();
    ctx.fill();
    // Đuôi đèn: hai vòng ren
    ctx.fillRect(8.6, 17.2, 6.8, 1.7);
    ctx.fillRect(9.6, 19.6, 4.8, 1.7);
    // Vệt sáng trên mặt kính: khoét trong suốt để lộ màu nút
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(12, 9.5, 4, 1.1 * Math.PI, 1.4 * Math.PI);
    ctx.stroke();
  },
  // Hai mũi tên bắt chéo
  shuffle: (ctx) => {
    const curve = (y0: number, y1: number) => {
      ctx.beginPath();
      ctx.moveTo(3, y0);
      ctx.lineTo(6.5, y0);
      ctx.bezierCurveTo(10, y0, 13, y1, 16.5, y1);
      ctx.lineTo(18, y1);
    };
    const head = (y: number) => {
      ctx.beginPath();
      ctx.moveTo(22.5, y);
      ctx.lineTo(17.5, y - 3.6);
      ctx.lineTo(17.5, y + 3.6);
      ctx.closePath();
      ctx.fill();
    };
    ctx.lineWidth = 2.6;
    curve(17, 7);
    ctx.stroke();
    head(7);
    // Khoét một khe quanh mũi tên còn lại để thấy nó vắt qua mũi tên kia
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 5.6;
    curve(7, 17);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2.6;
    curve(7, 17);
    ctx.stroke();
    head(17);
  },
  // Bút chì nằm chéo, ngòi chỉ xuống góc dưới bên trái
  edit: (ctx) => {
    ctx.translate(12, 12);
    ctx.rotate(-Math.PI / 4);
    // Thân bút và đầu tẩy, cách nhau một khe nhỏ
    ctx.fillRect(-5.6, -2.8, 10.4, 5.6);
    ctx.fillRect(6.2, -2.8, 3.2, 5.6);
    // Ngòi
    ctx.beginPath();
    ctx.moveTo(-5.6, -2.8);
    ctx.lineTo(-10.6, 0);
    ctx.lineTo(-5.6, 2.8);
    ctx.closePath();
    ctx.fill();
  },
  // Loa có hai vòng sóng
  sound: (ctx) => {
    speaker(ctx);
    ctx.lineWidth = 2;
    for (const r of [4, 7.5]) {
      ctx.beginPath();
      ctx.arc(12.5, 12, r, -0.3 * Math.PI, 0.3 * Math.PI);
      ctx.stroke();
    }
  },
  // Loa có dấu X
  mute: (ctx) => {
    speaker(ctx);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(15.5, 9);
    ctx.lineTo(21.5, 15);
    ctx.moveTo(21.5, 9);
    ctx.lineTo(15.5, 15);
    ctx.stroke();
  },
};

/** Khóa texture của biểu tượng; vẽ ở lần dùng đầu tiên. */
export function iconTexture(scene: Phaser.Scene, name: IconName): string {
  const key = `icon-${name}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, ICON_SIZE, ICON_SIZE)!;
  const ctx = tex.getContext();
  ctx.scale(ICON_SIZE / 24, ICON_SIZE / 24);
  ctx.fillStyle = ctx.strokeStyle = '#ffffff';
  ctx.lineCap = ctx.lineJoin = 'round';
  DRAW[name](ctx);
  tex.refresh();
  return key;
}
