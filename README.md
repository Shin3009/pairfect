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

File APK nằm trong thư mục `apk-output\`. Script lo hết các bước: cài thư viện, build code, tạo project Android (lần đầu), khóa màn hình ngang, bật chế độ toàn màn hình, đồng bộ và build bằng Gradle. Lần build đầu tiên sẽ lâu vài phút vì Gradle phải tải thư viện.

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
- Toàn màn hình: `SystemBars.hidden` trong `capacitor.config.ts` ẩn thanh trạng thái và thanh điều hướng lúc mở app, nhưng vuốt từ mép màn hình là chúng hiện lại luôn. `build-apk.bat` ghi thêm vào `MainActivity.java` để vuốt chỉ hiện tạm rồi tự ẩn (chế độ immersive). Build thủ công thì chép phần `MainActivity` trong `build-apk.ps1` sang.
- Thay icon và splash: dùng gói `@capacitor/assets` để sinh tự động từ một ảnh gốc.
- Build bản phát hành: trong Android Studio chọn *Build → Generate Signed App Bundle / APK*. Google Play yêu cầu định dạng AAB.

## Gửi kỷ lục lên Firebase

Lần đầu mở game, người chơi được hỏi tên. Tên lưu trên máy và hiện ở góc trên bên trái menu; chạm vào đó để đổi tên. Kỷ lục trên máy (điểm cao nhất trên bảng xếp hạng) được đồng bộ lên Cloud Firestore, **mỗi người chơi một document** `highscores/<uid>`:

| Trường | Ý nghĩa |
| --- | --- |
| `name` | Tên người chơi hiện tại (tối đa 20 ký tự); đổi tên thì cập nhật luôn |
| `score` | Kỷ lục |
| `stage` | Màn đang chơi lúc thua ở lượt đạt kỷ lục, đánh số từ 1 như trên HUD |
| `updatedAt` | Thời điểm máy chủ nhận lần gửi gần nhất |

`uid` là mã người chơi của Firebase Authentication: game tự đăng nhập ẩn danh (người chơi không phải nhập gì), phiên đăng nhập lưu trên máy nên lần sau mở app vẫn là người chơi cũ. Xóa dữ liệu app hoặc cài lại thì thành người chơi mới (document mới, document cũ vẫn còn).

Game gửi khi có kỷ lục mới hoặc khi đổi tên. Mất mạng thì để đó và gửi lại khi có mạng, ở lần mở app sau hoặc sau lượt thua kế tiếp. Chưa cấu hình Firebase thì game vẫn chạy bình thường, chỉ không gửi.

Cài đặt (làm một lần):

1. Tạo project tại [Firebase Console](https://console.firebase.google.com).
2. *Build → Authentication → Get started → Sign-in method*: bật **Anonymous**.
3. *Build → Firestore Database → Create database*: chọn vùng gần người chơi (ví dụ `asia-southeast1`), chế độ production.
4. Tab *Rules* của Firestore: dán nội dung file `firestore.rules` rồi bấm *Publish*.
5. *Project settings → General → Your apps*: thêm một Web app (biểu tượng `</>`), chép hai giá trị `apiKey` và `projectId` trong `firebaseConfig`.
6. Chép `.env.example` thành `.env.local` và điền hai giá trị đó. Chạy lại `npm run dev`, hoặc build lại APK.

`.env.local` không được đưa lên git. Cấu hình này không phải bí mật (nó nằm sẵn trong APK); dữ liệu được bảo vệ bằng `firestore.rules`:

- Ai cũng đọc được (để làm bảng xếp hạng chung).
- Chỉ chính người chơi ghi được document của mình, kỷ lục chỉ được tăng, không ai xóa được.
- Dữ liệu phải đúng định dạng, và điểm không được vượt mức có thể đạt tới màn đó: thua ở màn n thì tối đa n × 1500 điểm (`MAX_SCORE_PER_STAGE` trong `src/game/scoring.ts`; `npm test` kiểm tra mọi màn đều nằm dưới mức này và `firestore.rules` dùng đúng số này).

Vẫn có thể bị gửi điểm giả nằm dưới mức đó, bằng cách gọi thẳng Firebase thay vì chơi. Muốn chặn hẳn thì cần Firebase App Check với Play Integrity (xem Gợi ý phát triển tiếp).

## Cấu trúc code

```
src/
  main.ts               Khởi tạo Phaser (màn ngang cao 720, rộng theo tỉ lệ màn hình)
  native.ts             Nút Back của Android và việc app bị đưa xuống nền (plugin `@capacitor/app`)
  online.ts             Đồng bộ kỷ lục lên Cloud Firestore (đăng nhập ẩn danh, gửi lại khi có mạng)
  online.test.ts        Unit test cho việc gửi kỷ lục (Firebase giả)
  game/
    Board.ts            Toàn bộ logic: sinh bàn, đá chắn, tìm đường nối, gợi ý, đảo bàn, dồn ô
    Board.test.ts       Unit test cho logic
    levels.ts           Cấu hình các màn, vòng lặp vô tận và giai đoạn khó (xem docs/stages.md)
    levels.test.ts      Unit test cho cấu hình màn, tự chơi thử mọi màn
    scoring.ts          Điểm mỗi cặp, thưởng thời gian, giới hạn điểm mỗi màn (firestore.rules dùng)
    scoring.test.ts     Unit test: mọi màn nằm dưới giới hạn điểm, firestore.rules khớp
    storage.ts          Lưu vào localStorage: bảng xếp hạng (kỷ lục là điểm cao nhất trên bảng), tên người chơi, bản kỷ lục đã gửi
    storage.test.ts     Unit test cho phần lưu trữ
    tileArt.ts          Vẽ hình cho ô và đá bằng code (tạm thời, thay bằng ảnh thật sau)
  scenes/
    ui.ts               Kích thước game, bảng màu, nút bấm và hộp thoại dùng chung
    icons.ts            Vẽ biểu tượng nút Gợi ý (bóng đèn), Đảo bàn (mũi tên bắt chéo) và Đổi tên (bút chì) bằng code
    nameDialog.ts       Hộp nhập tên người chơi (HTML trong index.html, để gõ được tiếng Việt bằng bàn phím hệ thống)
    MenuScene.ts        Màn hình chính: tên người chơi, Chơi (luôn từ màn 1), Bảng xếp hạng, Cách chơi
    LeaderboardScene.ts Bảng xếp hạng: 10 lượt chơi điểm cao nhất, kèm màn lúc thua và ngày chơi
    GameScene.ts        Hiển thị, xử lý chạm, hiệu ứng, HUD, tạm dừng, thắng/thua
```

`Board.ts` không phụ thuộc Phaser nên có thể test riêng hoặc tái sử dụng.

Luồng màn hình: `Menu` → `Game`, và `Menu` → `Leaderboard`. Trong lúc chơi, nút **II** mở menu tạm dừng (Tiếp tục / Chơi lại màn / Về menu); đồng hồ và hiệu ứng dừng lại cho tới khi tiếp tục. Game cũng tự tạm dừng khi app bị đưa xuống nền (về màn hình chính, chuyển app, tắt màn hình).

Nút Back của Android: trong lúc chơi thì mở menu tạm dừng, đang tạm dừng thì chơi tiếp, ở hộp thoại thua thì về menu (ở hộp thoại qua màn thì không làm gì, để lỡ tay không mất lượt chơi đang thắng); ở bảng xếp hạng thì về menu; ở menu thì đóng hộp thoại đang mở (kể cả hộp đổi tên; hộp nhập tên lần đầu thì bắt buộc nhập nên Back không làm gì), hoặc hỏi có thoát game không.

Bảng xếp hạng chỉ lưu trên máy (localStorage), giữ 10 lượt chơi điểm cao nhất. Một lượt chơi được ghi khi **thua** (hết giờ hoặc hết nước đi), với điểm cuối cùng và màn đang chơi lúc thua; hộp thoại thua báo hạng nếu lọt vào bảng. Bỏ cuộc thì không ghi: rời màn từ menu tạm dừng (Chơi lại màn / Về menu), hoặc về menu sau khi qua màn. Bằng điểm thì màn xa hơn xếp trên, vẫn bằng thì lượt chơi trước xếp trên. "Kỷ lục" ở menu là điểm cao nhất trên bảng.

### Chỉ chơi màn ngang

Game chỉ chơi màn ngang (hướng tới tablet). Kích thước logic cao 720 và rộng theo tỉ lệ màn hình (1100–1600) để lấp kín chiều ngang; thanh HUD gọn một hàng ở trên để bàn chơi có nhiều chiều cao nhất. Bàn của các màn thấp và rộng, lớn dần tới tối đa 7x20. App Android khóa hướng ngang; trên trình duyệt đang dọc, `index.html` hiện lời nhắc xoay ngang thiết bị. Khi chạy `npm run dev`, cửa sổ trình duyệt cần rộng hơn cao.

Bản hỗ trợ cả màn dọc lẫn màn ngang vẫn còn trong lịch sử git (commit `d66039d` trên nhánh `master`).

### Thuật toán nối

Mọi đường đi tối đa 2 lần rẽ đều có dạng `a → p → q → b`, trong đó đoạn giữa `p → q` nằm trên một hàng (p cùng cột với a, q cùng cột với b) hoặc trên một cột (p cùng hàng với a, q cùng hàng với b). Hàm `findPath` thử tất cả các hàng và cột, kiểm tra ba đoạn thẳng đều trống, rồi chọn đường ngắn nhất. Trường hợp 0 hoặc 1 lần rẽ cũng được bao gồm tự nhiên. Lưới có thêm một viền ô trống bao quanh nên đường vòng ra ngoài mép không cần xử lý riêng.

## Tùy chỉnh nhanh

- **Độ khó, số màn:** sửa mảng `LEVELS` trong `src/game/levels.ts`. Lưu ý `rows * cols` phải là số chẵn, bàn nên rộng hơn cao (`cols > rows`), và `types` không vượt quá 40. `npm test` tự kiểm tra các điều kiện này và chơi thử hết mọi màn.
- **Điểm, số lượt gợi ý/đảo, thưởng thời gian:** các hằng số đầu file `GameScene.ts` và `src/game/scoring.ts`. Tăng điểm mà vượt `MAX_SCORE_PER_STAGE` thì `npm test` báo lỗi: nâng giới hạn ở cả `scoring.ts` lẫn `firestore.rules`.
- **Màu sắc giao diện:** đối tượng `C` trong `src/scenes/ui.ts`.
- **Dùng hình ảnh thật thay cho hình vẽ bằng code:** thêm hàm `preload()` vào `MenuScene` (scene chạy đầu tiên) và load ảnh với key `tile-1`, `tile-2`, ... và `stone` cho đá (ví dụ `this.load.image('tile-1', 'assets/apple.png')`), sau đó bỏ các lời gọi `createTileTextures` trong `MenuScene` và `GameScene`. Ảnh nên là hình vuông, kích thước khoảng 128x128.

Hãy dùng hình ảnh, âm thanh và tên game của riêng bạn (hoặc asset có giấy phép rõ ràng như CC0 từ kenney.nl), không dùng tài nguyên của game Onet gốc.

## Gợi ý phát triển tiếp

- Âm thanh khi chọn, khi nối, khi qua màn (`this.load.audio` + `this.sound.play`).
- Rung khi nối thành công: plugin `@capacitor/haptics`.
- Quảng cáo / mua trong ứng dụng: các plugin cộng đồng của Capacitor cho AdMob và Google Play Billing.
- Bảng xếp hạng chung: đọc collection `highscores` sắp theo `score` giảm dần (`firestore.rules` đã cho đọc), mỗi document là một người chơi.
- Chặn điểm giả gửi thẳng lên Firebase: bật Firebase App Check với Play Integrity (cần plugin native cho Capacitor, đăng ký app Android trong Firebase và đưa app lên Google Play), rồi bật Enforce cho Firestore.
