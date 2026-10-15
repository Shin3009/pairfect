import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Đổi appId thành tên miền ngược của bạn trước khi phát hành, vd: com.tuan.pairfect
  appId: 'com.example.pairfect',
  // Tên hiện dưới icon trên điện thoại: nên ngắn (launcher cắt chữ sau ~12 ký tự).
  // Tên đầy đủ "Pairfect: Tile Connect" dùng làm tiêu đề trên Google Play (nhập trong Play Console).
  appName: 'Pairfect',
  webDir: 'dist',
  android: {
    backgroundColor: '#1f3b4d',
  },
};

export default config;
