# Pairfect: Tile Connect

Game nối cặp hình giống nhau (cùng luật với Onet / Shisen-Sho), viết bằng **Phaser 4 + TypeScript**, đóng gói Android bằng **Capacitor 8**.

Hai ô cùng loại được nối nếu có đường đi qua các ô trống với **tối đa 2 lần rẽ**. Đường nối được phép vòng ra ngoài mép bàn.

## Chạy thử trên máy

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev        # mở http://localhost:5173
npm test           # chạy unit test cho logic bàn chơi
npm run build      # build ra thư mục dist/
```

Lệnh `npm run dev` cũng in ra địa chỉ mạng LAN, bạn có thể mở bằng trình duyệt điện thoại (cùng Wi-Fi) để thử cảm ứng ngay mà chưa cần build Android.

Khi chạy `npm run dev`, mở DevTools và gõ `game.scene.getScene('Game')` để xem trạng thái game (bàn chơi, điểm, thời gian...).

## Build APK trên Windows (một lệnh)

Cần cài **Node.js** và **Android Studio** (mở Android Studio một lần để nó tải Android SDK). Không cần đặt biến môi trường: script tự tìm SDK và JDK đi kèm Android Studio.

Nhấp đúp `build-apk.bat`, hoặc chạy trong cửa sổ dòng lệnh tại thư mục project:

```bat
build-apk.bat                  :: APK debug để thử
build-apk.bat -Install         :: APK debug + cài lên điện thoại đang cắm USB
build-apk.bat -Release         :: APK release đã ký để gửi người khác
```

Script tự dò Android SDK theo thứ tự: biến `ANDROID_HOME`/`ANDROID_SDK_ROOT`, file `android\local.properties`, cấu hình của Android Studio (kể cả bản Preview/Canary), rồi các vị trí mặc định. Nếu vẫn không tìm thấy, lấy đường dẫn trong Android Studio (*Settings → Languages & Frameworks → Android SDK → Android SDK Location*) rồi chạy `build-apk.bat -SdkPath "<đường dẫn>"`. Tương tự, có thể chỉ định JDK bằng `-JdkPath "<thư mục cài Android Studio>\jbr"`.

File APK nằm trong thư mục `apk-output\`. Script lo hết các bước: cài thư viện, build code, tạo project Android (lần đầu), khóa màn hình ngang, đồng bộ và build bằng Gradle. Lần build đầu tiên sẽ lâu vài phút vì Gradle phải tải thư viện.

Với `-Release`, lần đầu script đề nghị tạo keystore tại `%USERPROFILE%\.android-keystores\pairfect-release.jks` (để ngoài project cho an toàn). Hãy sao lưu file này cùng mật khẩu: mất keystore là không thể phát hành bản cập nhật cho app nữa.

## Build Android thủ công

Cần cài **Android Studio** (đi kèm Android SDK và JDK).

```bash
# Chỉ làm một lần: tạo project Android
npx cap add android

# Mỗi lần sửa code web: build và chép sang Android
npm run android:sync

# Mở Android Studio để chạy trên máy ảo / điện thoại thật, hoặc build APK/AAB
npm run android:open
```

Trước khi phát hành, nên làm thêm:

- Đổi `appId` trong `capacitor.config.ts` (ví dụ `com.tuan.pairfect`), làm trước khi chạy `cap add android`. Đây là ID vĩnh viễn trên Google Play.
- Khóa màn hình ngang: trong `android/app/src/main/AndroidManifest.xml`, đặt `android:screenOrientation="userLandscape"` cho thẻ `<activity>` (xoay được giữa hai chiều ngang, theo nút khóa xoay của người dùng). `build-apk.bat` tự làm bước này.
- Thay icon và splash: dùng gói `@capacitor/assets` để sinh tự động từ một ảnh gốc.
- Build bản phát hành: trong Android Studio chọn *Build → Generate Signed App Bundle / APK*. Google Play yêu cầu định dạng AAB.

## Cấu trúc code

```
src/
  main.ts               Khởi tạo Phaser (màn ngang cao 720, rộng theo tỉ lệ màn hình)
  game/
    Board.ts            Toàn bộ logic: sinh bàn, đá chắn, tìm đường nối, gợi ý, đảo bàn, dồn ô
    Board.test.ts       Unit test cho logic
    levels.ts           Cấu hình các màn, vòng lặp vô tận và giai đoạn khó (xem docs/stages.md)
    levels.test.ts      Unit test cho cấu hình màn, tự chơi thử mọi màn
    storage.ts          Lưu kỷ lục điểm vào localStorage
    tileArt.ts          Vẽ hình cho ô và đá bằng code (tạm thời, thay bằng ảnh thật sau)
  scenes/
    ui.ts               Kích thước game, bảng màu, nút bấm và hộp thoại dùng chung
    MenuScene.ts        Màn hình chính: Chơi (luôn từ màn 1), Cách chơi
    GameScene.ts        Hiển thị, xử lý chạm, hiệu ứng, HUD, tạm dừng, thắng/thua
```

`Board.ts` không phụ thuộc Phaser nên có thể test riêng hoặc tái sử dụng.

Luồng màn hình: `Menu` → `Game`. Trong lúc chơi, nút **II** mở menu tạm dừng (Tiếp tục / Chơi lại màn / Về menu); đồng hồ và hiệu ứng dừng lại cho tới khi tiếp tục.

### Chỉ chơi màn ngang

Game chỉ chơi màn ngang (hướng tới tablet). Kích thước logic cao 720 và rộng theo tỉ lệ màn hình (1100–1600) để lấp kín chiều ngang; thanh HUD gọn một hàng ở trên để bàn chơi có nhiều chiều cao nhất. Bàn của các màn thấp và rộng, lớn dần tới tối đa 7x20. App Android khóa hướng ngang; trên trình duyệt đang dọc, `index.html` hiện lời nhắc xoay ngang thiết bị. Khi chạy `npm run dev`, cửa sổ trình duyệt cần rộng hơn cao.

Bản hỗ trợ cả màn dọc lẫn màn ngang vẫn còn trong lịch sử git (commit `d66039d` trên nhánh `master`).

### Thuật toán nối

Mọi đường đi tối đa 2 lần rẽ đều có dạng `a → p → q → b`, trong đó đoạn giữa `p → q` nằm trên một hàng (p cùng cột với a, q cùng cột với b) hoặc trên một cột (p cùng hàng với a, q cùng hàng với b). Hàm `findPath` thử tất cả các hàng và cột, kiểm tra ba đoạn thẳng đều trống, rồi chọn đường ngắn nhất. Trường hợp 0 hoặc 1 lần rẽ cũng được bao gồm tự nhiên. Lưới có thêm một viền ô trống bao quanh nên đường vòng ra ngoài mép không cần xử lý riêng.

## Tùy chỉnh nhanh

- **Độ khó, số màn:** sửa mảng `LEVELS` trong `src/game/levels.ts`. Lưu ý `rows * cols` phải là số chẵn, bàn nên rộng hơn cao (`cols > rows`), và `types` không vượt quá 40. `npm test` tự kiểm tra các điều kiện này và chơi thử hết mọi màn.
- **Điểm, số lượt gợi ý/đảo, thưởng thời gian:** các hằng số đầu file `GameScene.ts`.
- **Màu sắc giao diện:** đối tượng `C` trong `src/scenes/ui.ts`.
- **Dùng hình ảnh thật thay cho hình vẽ bằng code:** thêm hàm `preload()` vào `MenuScene` (scene chạy đầu tiên) và load ảnh với key `tile-1`, `tile-2`, ... và `stone` cho đá (ví dụ `this.load.image('tile-1', 'assets/apple.png')`), sau đó bỏ các lời gọi `createTileTextures` trong `MenuScene` và `GameScene`. Ảnh nên là hình vuông, kích thước khoảng 128x128.

Hãy dùng hình ảnh, âm thanh và tên game của riêng bạn (hoặc asset có giấy phép rõ ràng như CC0 từ kenney.nl), không dùng tài nguyên của game Onet gốc.

## Gợi ý phát triển tiếp

- Âm thanh khi chọn, khi nối, khi qua màn (`this.load.audio` + `this.sound.play`).
- Nút Back của Android mở menu tạm dừng / quay lại: plugin `@capacitor/app`.
- Rung khi nối thành công: plugin `@capacitor/haptics`.
- Quảng cáo / mua trong ứng dụng: các plugin cộng đồng của Capacitor cho AdMob và Google Play Billing.
