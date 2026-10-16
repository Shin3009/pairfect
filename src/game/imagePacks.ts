/**
 * Bộ hình ô bằng ảnh: mỗi thư mục con của src/assets/tiles là một bộ, tên thư mục là tên bộ hiện trong game.
 * Không phụ thuộc Phaser; tileArt.ts tìm file ảnh lúc build rồi gọi groupPacks.
 */

export interface ImagePack {
  /** Tên thư mục, cũng là tên bộ hiện trong game. */
  folder: string;
  /** URL ảnh theo thứ tự tên file: ảnh đầu tiên là loại 1. */
  urls: string[];
}

/**
 * Gom các file ảnh (đường dẫn → URL) theo thư mục chứa chúng. Ảnh trong một bộ xếp theo tên file,
 * so phần số theo giá trị (2.png đứng trước 10.png). Các bộ xếp theo tên thư mục.
 */
export function groupPacks(files: Record<string, string>): ImagePack[] {
  const byFolder = new Map<string, { file: string; url: string }[]>();
  for (const [path, url] of Object.entries(files)) {
    const parts = path.split('/');
    if (parts.length < 2) continue;
    const folder = parts[parts.length - 2];
    const list = byFolder.get(folder) ?? [];
    list.push({ file: parts[parts.length - 1], url });
    byFolder.set(folder, list);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return [...byFolder]
    .sort(([a], [b]) => byName(a, b))
    .map(([folder, list]) => ({
      folder,
      urls: list.sort((a, b) => byName(a.file, b.file)).map((f) => f.url),
    }));
}
