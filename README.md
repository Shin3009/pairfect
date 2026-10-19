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

File APK nằm trong thư mục `apk-output\`. Script lo hết các bước: cài thư viện, build code, tạo project Android (lần đầu), khóa màn hình ngang, bật chế độ toàn màn hình, đặt số phiên bản, chép icon app, đồng bộ và build bằng Gradle. Lần build đầu tiên sẽ lâu vài phút vì Gradle phải tải thư viện.

Số phiên bản của app lấy theo `version` trong `package.json`. Ra bản mới thì đổi bằng `npm version 0.1.2 --no-git-tag-version` (sửa cả `package.json` lẫn `package-lock.json`). Script ghi số này vào project Android: `versionName` là chính số đó (hiện trong phần cài đặt của Android), `versionCode` = X×10000 + Y×100 + Z (ví dụ 0.1.1 → 101), luôn tăng như Google Play yêu cầu.

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
- Khóa màn hình ngang: trong `android/app/src/main/AndroidManifest.xml`, đặt `android:screenOrientation="userLandscape"` cho thẻ `<activity>` (xoay được giữa hai chiều ngang, theo nút khóa xoay của người dùng), và `android:appCategory="game"` cho thẻ `<application>`. Thiếu dòng sau thì trên Android 16 máy tính bảng (vd Galaxy Tab A11) bỏ qua khóa ngang, vì app target API 36 chỉ được giữ hướng màn hình trên màn hình rộng nếu là game. `build-apk.bat` tự làm bước này.
- Toàn màn hình: `SystemBars.hidden` trong `capacitor.config.ts` ẩn thanh trạng thái và thanh điều hướng lúc mở app, nhưng vuốt từ mép màn hình là chúng hiện lại luôn. `build-apk.bat` ghi thêm vào `MainActivity.java` để vuốt chỉ hiện tạm rồi tự ẩn (chế độ immersive). Build thủ công thì chép phần `MainActivity` trong `build-apk.ps1` sang.
- Số phiên bản: đặt `versionName` và `versionCode` trong `android/app/build.gradle` khớp với `version` của `package.json` (xem ở trên). `build-apk.bat` tự làm bước này.
- Icon app: chép thư mục `resources/android/res/` đè lên `android/app/src/main/res/` (xem "Icon app và favicon" ở mục Tùy chỉnh nhanh). `build-apk.bat` tự làm bước này. Màn hình chờ (splash) vẫn là của Capacitor; có thể sinh bằng gói `@capacitor/assets`.
- Build bản phát hành: trong Android Studio chọn *Build → Generate Signed App Bundle / APK*. Google Play yêu cầu định dạng AAB.

## Đưa lên web (Cloudflare Pages)

`npm run build` tạo một trang web tĩnh trong `dist/` (đường dẫn tương đối, chạy được cả trong thư mục con), nên dịch vụ web tĩnh nào cũng dùng được. Với Cloudflare Pages:

- Nối repo với một project Pages: build command `npm run build`, thư mục output `dist`. Thêm các biến `VITE_*` giống `.env.local` vào biến môi trường của project, vì chúng được nhúng lúc build. Hoặc build trên máy rồi chạy `npx wrangler pages deploy dist`.
- `public/_headers` (Vite chép vào `dist/`) đặt các header bảo mật. Content-Security-Policy đang ở chế độ Report-Only: thử bảng xếp hạng và đấu online, console không báo `[Report Only]` thì đổi sang `Content-Security-Policy`. Thử trên máy bằng `npx wrangler pages dev dist`, lệnh này áp header giống Cloudflare.
- Trên trình duyệt, lượt chơi chỉ lưu trong localStorage (không có bản sao như trên Android), nút Back của trình duyệt rời trang (lượt chơi vẫn được lưu), và màn hình dọc hiện lời nhắc xoay máy.
- Mọi biến `VITE_*` đều nằm công khai trong bundle; đừng đặt bí mật thật vào đó. Các rủi ro còn lại khi đưa lên web và cách xử lý: xem [`docs/security.md`](docs/security.md).

## Gửi kỷ lục lên Firebase

Lần đầu mở game, người chơi được hỏi tên. Tên lưu trên máy và hiện ở góc trên bên trái menu; chạm vào đó để đổi tên. Kỷ lục trên máy (điểm cao nhất trên bảng xếp hạng) được đồng bộ lên Cloud Firestore, **mỗi người chơi một document** `highscores/<uid>`:

| Trường | Ý nghĩa |
| --- | --- |
| `name` | Tên người chơi hiện tại (tối đa 20 ký tự); đổi tên thì cập nhật luôn |
| `score` | Kỷ lục |
| `stage` | Màn đang chơi lúc thua ở lượt đạt kỷ lục, đánh số từ 1 như trên HUD |
| `updatedAt` | Thời điểm máy chủ nhận lần gửi gần nhất |

`uid` là mã người chơi của Firebase Authentication: game tự đăng nhập ẩn danh (người chơi không phải nhập gì), phiên đăng nhập lưu trên máy nên lần sau mở app vẫn là người chơi cũ. Xóa dữ liệu app hoặc cài lại thì thành người chơi mới (document mới, document cũ vẫn còn).

Game gửi khi có kỷ lục mới hoặc khi đổi tên. Mất mạng thì để đó và gửi lại khi có mạng, ở lần mở app sau, khi lượt chơi kế tiếp được ghi hoặc khi mở bảng xếp hạng online. Mỗi lần gửi, một thông báo nhỏ hiện ở giữa mép trên màn hình vài giây: gửi được kỷ lục mới, đổi được tên, hoặc chưa gửi được (game sẽ tự thử lại). Không có gì mới để gửi thì không báo. Chưa cấu hình Firebase thì game vẫn chạy bình thường, chỉ không gửi.

Màn hình **Bảng xếp hạng** có hai thẻ. Thẻ **Toàn cầu** đọc lại collection này: 10 người chơi điểm cao nhất (bằng điểm thì màn xa hơn xếp trên, vẫn bằng thì người gửi trước xếp trên), dòng của người chơi trên máy có viền vàng. Nếu họ không lọt nhóm 10 thì có thêm một dòng riêng ở cuối, kèm hạng của họ (số người điểm cao hơn cộng 1, đếm bằng truy vấn đếm của Firestore). Truy vấn chỉ sắp theo `score` nên không cần tạo chỉ mục ghép. Mỗi lần mở màn hình bảng được tải lại; mất mạng thì báo lỗi kèm nút *Thử lại*. Thẻ **Trên máy** là bảng các lượt chơi trên máy (xem Cấu trúc code). Bản build chưa cấu hình Firebase thì chỉ có bảng trên máy.

Cài đặt (làm một lần):

1. Tạo project tại [Firebase Console](https://console.firebase.google.com).
2. *Build → Authentication → Get started → Sign-in method*: bật **Anonymous**.
3. *Build → Firestore Database → Create database*: chọn vùng gần người chơi (ví dụ `asia-southeast1`), chế độ production.
4. Tab *Rules* của Firestore: dán nội dung file `firestore.rules` rồi bấm *Publish*.
5. *Project settings → General → Your apps*: thêm một Web app (biểu tượng `</>`), chép hai giá trị `apiKey` và `projectId` trong `firebaseConfig`.
6. Chép `.env.example` thành `.env.local` và điền hai giá trị đó. Chạy lại `npm run dev`, hoặc build lại APK.

`.env.local` không được đưa lên git. Cấu hình này không phải bí mật (nó nằm sẵn trong APK); dữ liệu được bảo vệ bằng `firestore.rules`:

- Ai cũng đọc được (để làm bảng xếp hạng chung).
- Chỉ chính người chơi ghi được document của mình, kỷ lục chỉ được tăng, không ai xóa được. Hai lần ghi phải cách nhau ít nhất 2 giây.
- Dữ liệu phải đúng định dạng, và điểm không được vượt mức có thể đạt tới màn đó: thua ở màn n thì tối đa n × 1700 điểm (`MAX_SCORE_PER_STAGE` trong `src/game/scoring.ts`; `npm test` kiểm tra mọi màn đều nằm dưới mức này và `firestore.rules` dùng đúng số này). Màn tối đa là 999 (`MAX_ONLINE_STAGE`, cũng được `npm test` kiểm tra).

Vẫn có thể bị gửi điểm giả nằm dưới mức đó, bằng cách gọi thẳng Firebase thay vì chơi, hoặc trên bản web chỉ cần sửa localStorage bằng DevTools. Xem [`docs/security.md`](docs/security.md) về các cách chặn.

## Đấu online

Khi bản build có đủ cấu hình (xem cài đặt bên dưới), menu có nút **Đấu online**. Một người chọn **Tạo phòng** và nhận mã phòng 6 ký tự (không có I, O, 0, 1 để khỏi đọc nhầm), người kia chọn **Vào phòng** rồi nhập mã đó. Hai máy kết nối với nhau, đếm ngược 3 giây rồi cùng bắt đầu.

Luật của một trận "đua dọn bàn" (`src/pvp/match.ts`):

- Hai bên cùng một bàn 6 x 14 (mỗi loại hình 4 ô). Kiểu dồn chọn ngẫu nhiên trong Cổ điển, Dồn xuống, Dồn trái, Dồn lên, Dồn phải.
- Ai dọn sạch bàn trước thì thắng. Hết 4 phút thì ai còn ít cặp hơn thắng, bằng nhau là hòa. Ăn cặp không được cộng giờ.
- Mỗi trận có 3 lượt Gợi ý và 3 lượt Đảo bàn. Bàn bế tắc thì tự đảo, không tốn lượt.
- **Tấn công bằng chuỗi** (`src/pvp/attacks.ts`): ăn cặp kế tiếp trong vòng 2 giây sau cặp trước thì chuỗi dài thêm. Cứ mỗi 3 cặp trong chuỗi là một đòn vào bàn đối thủ, mạnh dần theo độ dài chuỗi (chuỗi dài hơn 12 thì lặp lại từ đầu):

  | Cặp thứ | Đòn | Tác dụng trên bàn đối thủ |
  | --- | --- | --- |
  | 3 | Thả đá | Một viên đá rơi vào một ô trống (không kề viên đá khác) |
  | 6 | Nghiêng bàn | Các ô bị dồn hết về một phía, khác hướng dồn của trận |
  | 9 | Che mắt | Bàn bị che kín 3 giây (vẫn chạm được, chỉ không thấy hình) |
  | 12 | Đảo bàn | Các ô bị xáo lại, không tốn lượt Đảo bàn của họ |

  Bàn chưa có ô trống nào thì đá không rơi được. Đòn tới lúc đối thủ đã dọn xong hoặc đã hết giờ thì không có tác dụng. Bị đá chặn hay bị nghiêng mà bế tắc thì bàn tự đảo như thường.
- Không tạm dừng được: nút **II** và nút Back hỏi có đầu hàng không. App xuống nền thì đồng hồ vẫn chạy; đối thủ không nghe thấy gì từ máy bạn trong 10 giây thì được xử thắng.
- HUD hiện số cặp còn lại của bạn, và tên, số cặp, bàn thu nhỏ của đối thủ. Hết trận có **Đấu lại** (khi cả hai cùng bấm) và **Về menu** (rời phòng).
- Trận đấu online không tính điểm, không lên bảng xếp hạng và không đụng tới lượt chơi một mình đang lưu.

Cách hoạt động:

- **Tìm nhau:** phòng chờ nằm trên Firebase Realtime Database (`pvpRooms/<mã>`), dùng chung đăng nhập ẩn danh với bảng xếp hạng. Hai máy trao đổi mô tả kết nối WebRTC qua phòng chờ. Mô tả này có địa chỉ IP của người gửi, nên `database.rules.json` chỉ cho chủ phòng và khách đang ở trong phòng đọc nó; người khác có mã phòng chỉ đọc được tên chủ phòng, phiên bản và chỗ của khách.
- **Kết nối:** kênh dữ liệu WebRTC giữa hai máy. Nối thẳng được thì nối thẳng (nhờ STUN); mạng chặn nối thẳng (nhiều mạng 4G/5G, mạng công ty) thì đi qua máy chủ chuyển tiếp TURN của Metered. Tin nhắn trong trận không đi qua Firebase. Mất kết nối giữa trận (đổi mạng) thì chủ phòng tự kết nối lại.
- **Cùng một bàn mà không phải gửi bàn:** bàn được sinh từ một hạt giống chung (`src/game/rng.ts`). Mỗi máy chỉ gửi nước đi của mình, máy kia chơi lại nước đó trên bản sao bàn của đối thủ. Đòn tấn công cũng không gửi riêng: máy bị đánh tự tính ra đòn từ thời điểm các nước đi của đối thủ, áp lên bàn mình rồi báo lại như một nước đi, nên máy kẻ tấn công kiểm tra được đòn có thật và bàn thu nhỏ hiện đúng đá, nghiêng, đảo. Nhờ vậy bàn thu nhỏ luôn đúng, và nước đi không hợp lệ (gian lận) bị phát hiện ngay: đối thủ bị xử thua. Vì thế hai máy phải cùng phiên bản: đổi luật trận đấu, `Board` hay cách sinh bàn thì tăng `PROTOCOL` trong `src/pvp/protocol.ts`, để máy khác phiên bản không vào được phòng của nhau.
- **Phân xử:** chủ phòng phân xử thắng thua; đồng hồ hai máy được đồng bộ qua các lần ping.

Cài đặt (làm một lần, sau phần Firebase ở trên):

1. Firebase Console → *Build → Realtime Database → Create database*: chọn vùng gần người chơi, chế độ *locked mode*.
2. Tab *Rules* của Realtime Database: dán nội dung file `database.rules.json` rồi bấm *Publish*. Bản game 0.2.0 trở về trước không vào phòng được với luật hiện tại (vẫn tạo phòng được), nên cập nhật app trên mọi máy trước khi dán luật mới.
3. Chép địa chỉ database (dạng `https://<project>-default-rtdb.<vùng>.firebasedatabase.app`) vào `VITE_FIREBASE_DATABASE_URL` trong `.env.local`.
4. Metered (metered.ca) → *TURN Server*: tạo một credential, chép tên miền app (dạng `<app>.metered.live`) vào `VITE_METERED_DOMAIN` và **API key của credential đó** vào `VITE_METERED_API_KEY`. Đừng dùng *Secret Key* của tài khoản: key đó không được nằm trong app. Bỏ trống thì game chỉ dùng STUN, vẫn chơi được khi hai máy nối thẳng được với nhau.
5. Chạy lại `npm run dev`, hoặc build lại APK.

Gói miễn phí của Realtime Database cho tối đa 100 kết nối cùng lúc; game chỉ kết nối khi đang ở phòng chờ hoặc trong trận, và ngắt khi rời phòng. Mỗi trận chỉ gửi vài chục KB qua TURN.

Thử khi phát triển (`npm run dev`):

- Hai người chơi trên cùng một máy: mở game ở hai tab. Dùng một cửa sổ ẩn danh nếu muốn hai tên khác nhau.
- Thêm `?relay` vào địa chỉ (ví dụ `http://localhost:5173/?relay`) để buộc kết nối đi qua TURN, nhằm thử máy chủ TURN khi hai tab vốn nối thẳng được.
- Gõ `pvpBot()` trong DevTools để đấu với máy ngay, không cần mạng hay Firebase: thử nhanh giao diện trận đấu. `pvpBot(800)` cho máy cứ 0,8 giây ăn một cặp (mặc định 2,5 giây); dưới 2 giây thì máy thành chuỗi và tấn công bạn, tiện để thử các đòn.
- Thử thật: một máy dùng Wi-Fi, máy kia dùng 4G.

## Cấu trúc code

```
src/
  main.ts               Khởi tạo Phaser (màn ngang cao 720, rộng theo tỉ lệ màn hình)
  native.ts             Nút Back của Android, việc app bị đưa xuống nền (plugin `@capacitor/app`), bản sao lượt chơi đang lưu (plugin `@capacitor/preferences`)
  online.ts             Đồng bộ kỷ lục lên Cloud Firestore (đăng nhập ẩn danh, gửi lại khi có mạng), đọc bảng xếp hạng online
  online.test.ts        Unit test cho việc gửi kỷ lục và đọc bảng online (Firebase giả)
  toast.ts              Thông báo nhỏ ở mép trên màn hình (HTML trong index.html), ví dụ kết quả gửi kỷ lục
  game/
    Board.ts            Toàn bộ logic: sinh bàn, đá chắn, tìm đường nối, gợi ý, đảo bàn, dồn ô, nạp lại bàn đã lưu
    Board.test.ts       Unit test cho logic
    levels.ts           Cấu hình các màn, vòng lặp vô tận và giai đoạn khó (xem docs/stages.md)
    levels.test.ts      Unit test cho cấu hình màn, tự chơi thử mọi màn
    rng.ts              Số ngẫu nhiên có hạt giống: hai máy đấu online sinh cùng một bàn
    scoring.ts          Điểm mỗi cặp, thưởng thời gian, giới hạn điểm mỗi màn (firestore.rules dùng)
    scoring.test.ts     Unit test: mọi màn nằm dưới giới hạn điểm, firestore.rules khớp
    storage.ts          Lưu vào localStorage: bảng xếp hạng (kỷ lục là điểm cao nhất trên bảng), tên người chơi, bản kỷ lục đã gửi, bộ hình ô đang chọn, cài đặt âm thanh, lượt chơi đang lưu
    storage.test.ts     Unit test cho phần lưu trữ
    tileArt.ts          Các bộ hình ô (trái cây & con vật bằng emoji, hình khối, bộ ảnh trong src/assets/tiles) và hình đá
    imagePacks.ts       Gom ảnh trong src/assets/tiles thành các bộ hình ô
    imagePacks.test.ts  Unit test cho việc gom và xếp thứ tự ảnh
  assets/tiles/         Các bộ hình ô bằng ảnh: Quái vật (SVG vẽ riêng), Tuxemon (pixel art CC BY-SA 4.0, kèm credits.txt)
  pvp/                  Đấu online (xem mục Đấu online)
    protocol.ts         Tin nhắn giữa hai máy (kiểm tra đúng dạng), mã phòng, thông báo lỗi
    clock.ts            Đo độ lệch đồng hồ giữa hai máy qua ping
    attacks.ts          Đòn tấn công bằng chuỗi: khi nào có đòn, tác dụng của từng đòn
    match.ts            Luật một trận: bàn mình và bản sao bàn đối thủ, chuỗi và đòn, phát hiện nước đi không hợp lệ, phân xử
    session.ts          Một phiên với một đối thủ: chào nhau, bắt đầu trận, đấu lại, phát hiện đối thủ rời đi
    peer.ts             Kết nối WebRTC (kênh dữ liệu), kết nối lại khi mất mạng giữa trận
    signaling.ts        Phòng chờ trên Firebase Realtime Database (tạo / vào phòng, trao đổi mô tả kết nối)
    turn.ts             Lấy danh sách máy chủ STUN/TURN từ Metered
    loopback.ts         Kết nối giả trong bộ nhớ, cho test và đấu với máy
    bot.ts              Chỉ khi phát triển: đấu với máy (pvpBot() trong DevTools)
    *.test.ts           Unit test cho giao thức, đồng hồ, luật trận đấu và phiên
  scenes/
    ui.ts               Kích thước game, bảng màu, nút bấm và hộp thoại dùng chung
    icons.ts            Vẽ biểu tượng nút Gợi ý (bóng đèn), Đảo bàn (mũi tên bắt chéo) và Đổi tên (bút chì) bằng code
    nameDialog.ts       Hộp nhập tên người chơi và mã phòng (HTML trong index.html, để gõ được tiếng Việt bằng bàn phím hệ thống)
    MenuScene.ts        Màn hình chính: tên người chơi, Hình ô, Tiếp tục (khi có lượt chơi đang lưu), Chơi / Chơi mới (luôn từ màn 1), Đấu online, Bảng xếp hạng, Cách chơi
    LeaderboardScene.ts Bảng xếp hạng, hai thẻ: Toàn cầu (online, mỗi người chơi một dòng) và Trên máy (10 lượt chơi điểm cao nhất, kèm màn lúc thua và ngày chơi)
    TileArtScene.ts     Chọn bộ hình cho các ô, mỗi bộ kèm vài ô mẫu
    PvpLobbyScene.ts    Phòng chờ đấu online: tạo phòng (hiện mã), vào phòng (nhập mã), đang kết nối, lỗi
    GameScene.ts        Hiển thị, xử lý chạm, hiệu ứng, HUD, tạm dừng, thắng/thua; cả trận đấu online
database.rules.json     Quy tắc bảo mật của Realtime Database cho phòng chờ đấu online (dán vào Firebase Console)
public/_headers         Header bảo mật (CSP...) cho bản web trên Cloudflare Pages, Vite chép vào dist/
public/favicon.*        Favicon và apple-touch-icon của bản web (tạo bằng npm run icons)
resources/icon/         Hình gốc của icon app: lớp nền và lớp hình (SVG)
resources/android/res/  Icon Android đã xuất, build-apk.bat chép vào project Android
scripts/icons.mjs       npm run icons: xuất icon Android, ảnh cho Google Play và favicon từ resources/icon/
docs/security.md        Rà soát bảo mật bản web: những gì đã sửa và các vấn đề còn lại
```

`Board.ts` không phụ thuộc Phaser nên có thể test riêng hoặc tái sử dụng.

Luồng màn hình: `Menu` → `Game`, `Menu` → `Leaderboard`, `Menu` → `TileArt` (thẻ "Hình ô" ở góc trên bên phải menu) và `Menu` → `PvpLobby` → `Game` (đấu online). Trong lúc chơi, nút **II** mở menu tạm dừng (Tiếp tục / Chơi lại màn / Lưu và về menu; "Chơi lại màn" tốn một lượt chơi lại như khi thua, hết lượt thì không có nút này); đồng hồ và hiệu ứng dừng lại cho tới khi tiếp tục. Game cũng tự tạm dừng khi app bị đưa xuống nền (về màn hình chính, chuyển app, tắt màn hình).

**Lưu lượt chơi.** Lượt chơi đang dở luôn được lưu trong localStorage (khóa `pairfect-saved-game`): đúng bàn đang chơi, điểm, thời gian còn lại, lượt Gợi ý / Đảo bàn / chơi lại. Trên Android còn một bản sao trong bộ nhớ riêng của app (SharedPreferences, plugin `@capacitor/preferences`), vì WebView có thể chưa kịp ghi localStorage xuống đĩa thì app đã bị tắt; lúc mở app, bản nào lưu sau thì được dùng. Game lưu khi vào màn, mỗi giây, khi tạm dừng (nên cũng lưu mỗi khi app xuống nền), khi thắng, khi thua và khi bấm "Lưu và về menu". Nhờ vậy app bị tắt ngang (vuốt khỏi danh sách app gần đây, hệ điều hành dọn app, lỗi, hết pin) vẫn chơi tiếp được, chỉ mất tối đa khoảng một giây. Có lượt chơi đang lưu thì menu có nút **Tiếp tục – Màn N** ở trên cùng; "Chơi mới" sẽ hỏi lại trước khi xóa lượt đang lưu. App bị tắt lúc đang hiện hộp thoại thua thì chơi tiếp sẽ hiện lại đúng hộp thoại đó; tắt lúc đang hiện hộp thoại qua màn thì chơi tiếp từ màn sau.

Nút Back của Android: trong lúc chơi thì mở menu tạm dừng, đang tạm dừng thì chơi tiếp, ở hộp thoại thua thì về menu và ghi lượt chơi lên bảng xếp hạng, giống nút "Về menu" (ở hộp thoại qua màn thì không làm gì, để lỡ tay không rời màn); ở bảng xếp hạng và màn chọn hình ô thì về menu; ở menu thì đóng hộp thoại đang mở (kể cả hộp đổi tên; hộp nhập tên lần đầu thì bắt buộc nhập nên Back không làm gì), hoặc hỏi có thoát game không.

Bảng xếp hạng trên máy (thẻ *Trên máy*) lưu trong localStorage, giữ 10 lượt chơi điểm cao nhất. Khi **thua** (hết giờ hoặc hết nước đi), hoặc chọn "Chơi lại màn" khi tạm dừng, người chơi được **chơi lại** màn đó với điểm, lượt Gợi ý và lượt Đảo bàn như lúc mới vào màn; cả lượt chơi chỉ có **3 lượt chơi lại** (dùng chung cho hai cách), hết thì hộp thoại thua chỉ còn nút "Về menu". Lượt chơi chỉ được ghi khi người chơi **về menu từ hộp thoại thua** (nút "Về menu" hoặc nút Back), với điểm cuối cùng và màn đang chơi lúc thua; hộp thoại thua báo trước hạng sẽ được nếu lọt vào bảng. "Lưu và về menu" (ở menu tạm dừng và hộp thoại qua màn) giữ lượt chơi lại để chơi tiếp, chưa ghi. Lượt chơi bị bỏ để bắt đầu lượt mới ("Chơi mới" ở menu) thì không bao giờ được ghi. Bằng điểm thì màn xa hơn xếp trên, vẫn bằng thì lượt chơi trước xếp trên. "Kỷ lục" ở menu là điểm cao nhất trên bảng.

### Chỉ chơi màn ngang

Game chỉ chơi màn ngang (hướng tới tablet). Kích thước logic cao 720 và rộng theo tỉ lệ màn hình (1100–1600) để lấp kín chiều ngang; thanh HUD gọn một hàng ở trên để bàn chơi có nhiều chiều cao nhất. Bàn của các màn thấp và rộng (khoảng 2,4 cột mỗi hàng), lớn dần tới tối đa 8x20. Trên màn hình không quá dài (máy tính bảng 5:3 hay 16:10, như Galaxy Tab A11 1340x800), ô được kéo cao hơn rộng, tối đa 1,25 lần (`MAX_TILE_ASPECT` trong `GameScene.ts`), để bàn lấp chỗ trống phía trên và dưới; hình trên ô vẫn giữ vuông. App Android khóa hướng ngang; trên trình duyệt đang dọc, `index.html` hiện lời nhắc xoay ngang thiết bị. Khi chạy `npm run dev`, cửa sổ trình duyệt cần rộng hơn cao.

Bản hỗ trợ cả màn dọc lẫn màn ngang vẫn còn trong lịch sử git (commit `d66039d` trên nhánh `master`).

### Thuật toán nối

Mọi đường đi tối đa 2 lần rẽ đều có dạng `a → p → q → b`, trong đó đoạn giữa `p → q` nằm trên một hàng (p cùng cột với a, q cùng cột với b) hoặc trên một cột (p cùng hàng với a, q cùng hàng với b). Hàm `findPath` thử tất cả các hàng và cột, kiểm tra ba đoạn thẳng đều trống, rồi chọn đường ngắn nhất. Trường hợp 0 hoặc 1 lần rẽ cũng được bao gồm tự nhiên. Lưới có thêm một viền ô trống bao quanh nên đường vòng ra ngoài mép không cần xử lý riêng.

## Tùy chỉnh nhanh

- **Độ khó, số màn:** sửa mảng `LEVELS` trong `src/game/levels.ts`. Lưu ý `rows * cols` phải là số chẵn, bàn nên rộng hơn cao (`cols > rows`), và `types` không vượt quá 40. `npm test` tự kiểm tra các điều kiện này và chơi thử hết mọi màn.
- **Điểm, số lượt gợi ý/đảo, thưởng thời gian:** các hằng số đầu file `GameScene.ts` và `src/game/scoring.ts`. Tăng điểm mà vượt `MAX_SCORE_PER_STAGE` thì `npm test` báo lỗi: nâng giới hạn ở cả `scoring.ts` lẫn `firestore.rules`.
- **Màu sắc giao diện:** đối tượng `C` trong `src/scenes/ui.ts`.
- **Icon app và favicon:** hình gốc là hai lớp SVG, `resources/icon/background.svg` (nền) và `resources/icon/foreground.svg` (một góc bàn chơi với cặp táo được nối). Sửa xong thì chạy `npm run icons` và commit cả các file xuất ra.
  - Hai lớp vẽ trên khung 108dp của adaptive icon Android: phần hiện ra trên màn hình là vùng 0..100 trong viewBox. Launcher cắt icon thành hình tròn, bo góc hay giọt nước tùy hãng, nên giữ hình chính trong vòng tròn bán kính khoảng 46 quanh tâm (50, 50).
  - `npm run icons` xuất: icon Android cho mọi mật độ màn hình (`resources/android/res/`, gồm cả bản cắt sẵn cho Android 7), ảnh 512x512 để tải lên Google Play (`resources/play-store-icon.png`), và favicon cho bản web (`public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`).
- **Thêm bộ hình ô bằng ảnh:** tạo thư mục `src/assets/tiles/<tên bộ>/` và đặt vào đó ít nhất 40 ảnh `.png`, `.webp`, `.jpg`, `.jpeg` hoặc `.svg` (đuôi file viết thường). Chạy lại `npm run dev` (hoặc build), bộ mới hiện trong màn "Hình ô" với tên là tên thư mục.
  - Ảnh xếp theo tên file, phần số so theo giá trị (`2.png` trước `10.png`): ảnh đầu tiên là loại 1. Màn 1 chỉ dùng 12 loại đầu, nên đặt những hình khác nhau rõ nhất lên trước.
  - Ảnh nên có nền trong suốt. Phần viền trong suốt được tự cắt bỏ rồi phóng hình cho vừa ô, nên sprite nhỏ nằm giữa khung rộng vẫn đủ to. Ảnh nhỏ (như sprite pixel art 64x64) được phóng giữ nguyên từng điểm ảnh nên không bị nhòe. Thư mục có ít hơn 40 ảnh bị bỏ qua (có cảnh báo trong console).
  - Ảnh có giấy phép yêu cầu ghi công (CC BY, CC BY-SA...): viết phần ghi công vào file `credits.txt` trong cùng thư mục. Màn "Hình ô" hiện nút "Ghi công" trên thẻ của bộ đó để người chơi xem.
  - Game có sẵn hai bộ ảnh: **Quái vật** (40 sinh vật vẽ riêng cho game, file SVG) và **Tuxemon** (40 quái vật pixel art từ dự án mã nguồn mở [Tuxemon](https://opengameart.org/content/tuxemon-set-1-154-monsters-front-and-back-sprites-and-menu-animations), giấy phép CC BY-SA 4.0, ghi công tác giả trong `src/assets/tiles/Tuxemon/credits.txt`). Đổi sprite Tuxemon nào thì sửa luôn `credits.txt`.
  - Ảnh trong thư mục này được đóng gói vào APK. Chỉ dùng ảnh bạn có quyền phát hành: ảnh của các thương hiệu như Pokémon thuộc bản quyền của chủ sở hữu, đưa lên Google Play sẽ bị gỡ app.

Hãy dùng hình ảnh, âm thanh và tên game của riêng bạn (hoặc asset có giấy phép rõ ràng như CC0 từ kenney.nl), không dùng tài nguyên của game Onet gốc.

## Gợi ý phát triển tiếp

- Âm thanh khi chọn, khi nối, khi qua màn (`this.load.audio` + `this.sound.play`).
- Rung khi nối thành công: plugin `@capacitor/haptics`.
- Quảng cáo / mua trong ứng dụng: các plugin cộng đồng của Capacitor cho AdMob và Google Play Billing.
- Chặn điểm giả và việc dùng hết hạn mức Firebase / Metered: xem các vấn đề còn lại trong [`docs/security.md`](docs/security.md) (kiểm tra điểm phía máy chủ, Firebase App Check, dọn phòng cũ, cấp credential TURN ngắn hạn).
- Đấu online: tìm trận ngẫu nhiên thay vì chỉ vào phòng bằng mã; cân chỉnh các đòn tấn công (`COMBO_MS`, `COMBO_STEP`, `COMBO_ATTACKS`, `FOG_MS` trong `src/pvp/attacks.ts`) sau khi chơi thử với người thật.
