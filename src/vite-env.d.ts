/// <reference types="vite/client" />

/** Biến môi trường đọc lúc build (đặt trong .env.local, xem .env.example). */
interface ImportMetaEnv {
  /** Cấu hình Firebase để gửi kỷ lục lên Firestore (xem online.ts). Bỏ trống thì không gửi. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
