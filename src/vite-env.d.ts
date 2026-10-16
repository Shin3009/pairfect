/// <reference types="vite/client" />

/** Biến môi trường đọc lúc build (đặt trong .env.local, xem .env.example). */
interface ImportMetaEnv {
  /** Cấu hình Firebase để gửi kỷ lục lên Firestore (xem online.ts). Bỏ trống thì không gửi. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  /** Realtime Database dùng làm phòng chờ cho đấu online (xem pvp/signaling.ts). Bỏ trống thì không có đấu online. */
  readonly VITE_FIREBASE_DATABASE_URL?: string;
  /** Máy chủ TURN của Metered cho đấu online (xem pvp/turn.ts). Bỏ trống thì chỉ dùng STUN. */
  readonly VITE_METERED_DOMAIN?: string;
  readonly VITE_METERED_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
