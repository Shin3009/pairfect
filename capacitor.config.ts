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
  plugins: {
    // Chơi toàn màn hình: ẩn thanh trạng thái và thanh điều hướng ngay khi mở app.
    // build-apk.ps1 thêm phần còn lại vào MainActivity (vuốt mép màn hình chỉ hiện tạm, rồi tự ẩn lại).
    SystemBars: { hidden: true },
  },
};

export default config;
