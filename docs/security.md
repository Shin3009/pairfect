# Bảo mật khi đưa game lên web

Rà soát ngày 19/10/2026, cho bản web chạy trên Cloudflare Pages. Bản web và app Android dùng chung một backend: Firebase (Auth ẩn danh, Firestore cho bảng xếp hạng, Realtime Database cho phòng chờ đấu online) và máy chủ TURN của Metered.

Tóm tắt: không tìm thấy lỗi cho phép chạy mã trên máy người chơi khác (XSS) hay chiếm tài khoản của họ. Hai rủi ro chính là **điểm giả trên bảng xếp hạng** và **người ngoài dùng hết hạn mức** Firebase / Metered. Cả hai vốn có từ bản Android, nhưng bản web dễ bị khai thác hơn nhiều: chỉ cần mở DevTools.

## Đã sửa

| Vấn đề | Đã sửa thế nào | File |
| --- | --- | --- |
| Điểm giả không có giới hạn trên: `stage` không bị chặn nên điểm tối đa `stage × 1700` lớn tùy ý | Màn tối đa 999 (`MAX_ONLINE_STAGE`, `npm test` kiểm tra luật dùng đúng số này) | `firestore.rules`, `src/game/scoring.ts` |
| Script ghi liên tục vào document của mình | Hai lần ghi phải cách nhau ít nhất 2 giây | `firestore.rules` |
| Ai biết mã phòng cũng đọc được `offer` / `answer`, trong đó có địa chỉ IP công khai của hai người chơi (ví dụ mã phòng hiện trên livestream) | Người ngoài chỉ đọc được `hostName`, `protocol`, `guest`; `offer` / `answer` chỉ chủ phòng và khách đang ở trong phòng đọc được. `joinRoom` đọc từng phần thay vì cả phòng | `database.rules.json`, `src/pvp/signaling.ts` |
| `createdAt` của phòng ghi tùy ý được, nên không dọn được phòng cũ theo tuổi | `createdAt` phải đúng giờ máy chủ (`now`) | `database.rules.json` |
| Không có header bảo mật | CSP (đang ở chế độ Report-Only), chặn nhúng vào trang khác, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `noindex` cho bản xem trước | `public/_headers` |

Cách đã kiểm tra:

- Luật Firestore và Realtime Database: 33 trường hợp trên Firebase Emulator (`@firebase/rules-unit-testing`), chạy đúng các thao tác của game: tạo phòng, vào phòng, trao đổi offer / answer, khởi động lại ICE, mời khách ra, rời phòng; ghi kỷ lục, đổi tên, màn 999 / 1000, ghi liền nhau.
- `_headers`: chạy `dist/` bằng `npx wrangler pages dev dist` (áp header giống Cloudflare Pages), mở bảng xếp hạng toàn cầu và đấu online hai tab tới khi vào trận: console không có cảnh báo CSP nào.

### Việc cần làm bằng tay sau khi cập nhật

1. **Build lại app Android trước, rồi mới dán luật mới.** Bản 0.2.0 trở về trước đọc cả phòng khi vào phòng, nên với `database.rules.json` mới thì máy cài bản cũ **không vào phòng được** (vẫn tạo phòng được). Cập nhật app trên mọi máy rồi mới dán luật Realtime Database. `firestore.rules` mới không ảnh hưởng bản cũ.
2. Dán `firestore.rules` và `database.rules.json` vào Firebase Console (xem README).
3. Sau khi deploy lên Cloudflare, thử bảng xếp hạng và đấu online (một máy Wi-Fi, một máy 4G để đi qua TURN). Console không báo `[Report Only]` thì trong `public/_headers` đổi `Content-Security-Policy-Report-Only` thành `Content-Security-Policy`.

## Vấn đề còn lại

Xếp theo mức độ, cao nhất trước.

### 1. Điểm giả trên bảng xếp hạng (cao)

Trên web: DevTools → Application → Local Storage → sửa `pairfect-leaderboard` thành `[{"score":1698300,"stage":999,"date":0}]` rồi tải lại trang; `syncBest()` tự gửi lên. Không cần game: lấy API key trong bundle, đăng nhập ẩn danh qua REST rồi ghi thẳng. Luật hiện tại chỉ chặn được điểm vượt `stage × 1700` và màn quá 999.

Game chạy hoàn toàn trên máy người chơi thì không chứng minh được điểm là thật. Các hướng sửa:

- **Kiểm tra phía máy chủ (cách duy nhất chặn hẳn).** Ghi lại hạt giống và các nước đi của cả lượt chơi (giống cách đấu online gửi sự kiện), gửi lên một Cloud Function hoặc Cloudflare Worker. Hàm đó chơi lại bằng chính `Board` / `levels` (không phụ thuộc Phaser) rồi mới ghi `highscores`; người chơi mất quyền ghi trực tiếp. Việc lớn: bàn ban đầu và mọi lần đảo phải sinh từ rng có hạt giống, và thời gian phải kiểm tra được.
- **Firebase App Check.** Chặn script gọi thẳng Firebase, nhưng không chặn sửa localStorage trên chính trang của game (xem mục 2).
- **Dọn tay.** Xóa dòng gian lận trong Firebase Console (luật không cho người chơi xóa, nhưng Console thì được).

### 2. Người ngoài dùng hết hạn mức (trung bình)

Năm biến `VITE_*` nằm trong bundle JS công khai. Điều đó bình thường, nhưng ai cũng dùng được chúng từ script của riêng mình:

- **Firestore:** `allow read: if true` cho script đọc cả collection liên tục. Gói Spark (miễn phí) hết hạn mức thì bảng xếp hạng ngừng chạy tới hết ngày; gói Blaze thì tốn tiền. Luật `request.query.limit <= 10` không giúp được: script vẫn đọc từng trang 10 dòng, và luật đó làm hỏng truy vấn đếm hạng (`getCount`).
- **Tài khoản ẩn danh không giới hạn:** mỗi lần đăng nhập ẩn danh mới là một uid mới, nên giới hạn 2 giây chỉ có tác dụng trên một dòng; script tạo nhiều tài khoản để ghi nhiều dòng (kể cả tên rác).
- **Realtime Database:** script tạo phòng qua REST không kèm `onDisconnect`, phòng nằm đó mãi (mỗi phòng tới khoảng 40 KB). Giờ `createdAt` đã đáng tin, nên cần một tác vụ định kỳ xóa phòng có `createdAt` quá 24 giờ: Cloud Function có lịch chạy (cần gói Blaze) hoặc Cloudflare Worker có cron dùng service account. Đừng xóa phòng mới hơn vài giờ: phòng còn cần để khởi động lại kết nối trong cả phiên đấu (nhiều trận đấu lại).
- **Metered TURN:** API key của credential nằm trong bundle, ai cũng lấy được thông tin đăng nhập TURN rồi chuyển tiếp dữ liệu của họ bằng hạn mức của bạn (Metered nói đó là tác hại duy nhất). Hướng sửa:
  - Đặt giới hạn / cảnh báo dùng vượt mức trong tài khoản Metered.
  - Chuyển việc cấp thông tin đăng nhập sang một Cloudflare Pages Function: dùng Secret Key của Metered (lưu trong secret của Cloudflare, không có tiền tố `VITE_`) để tạo credential hết hạn sau vài phút. Hàm đó vẫn gọi được từ bên ngoài, nên cần giới hạn tần suất (Cloudflare Rate Limiting hoặc Turnstile).
  - Hoặc dùng TURN của Cloudflare (Realtime TURN), cũng cấp credential ngắn hạn qua một Worker.

Cách chặn chung cho Firebase: **Firebase App Check**, bật Enforce cho Firestore và Realtime Database.

- Web: provider reCAPTCHA Enterprise.
- Android: Play Integrity, cần plugin native cho Capacitor, đăng ký app Android trong Firebase và đưa app lên Google Play. reCAPTCHA trong WebView của Capacitor (origin `https://localhost`) không ổn định, nên thử trên Android trước khi bật Enforce.

Trong lúc chưa có App Check: giữ gói Spark (hết hạn mức thì ngừng chứ không tính tiền), hoặc đặt cảnh báo ngân sách nếu dùng Blaze.

### 3. API key Firebase chưa giới hạn theo tên miền (thấp)

Google Cloud Console → *APIs & Services → Credentials* → API key của web app → *Application restrictions: Websites*, thêm:

- `https://<tên miền của bạn>/*` và `https://<project>.pages.dev/*`
- `https://*.<project>.pages.dev/*` nếu dùng bản xem trước
- `https://localhost/*`: origin của app Android (Capacitor)
- `http://localhost:5173/*` khi phát triển

Thử lại bảng xếp hạng và đấu online trên cả web lẫn Android sau khi lưu. Cách này chỉ ngăn trang web khác dùng key; script ngoài trình duyệt vẫn giả được header `Referer`.

### 4. Bản xem trước của Cloudflare Pages công khai và ghi vào dữ liệu thật (thấp)

Mỗi lần đẩy một nhánh, Cloudflare Pages tạo một địa chỉ `<mã>.<project>.pages.dev` ai cũng mở được, và các bản deploy cũ vẫn chạy. Mọi bản dùng chung một project Firebase, nên bản thử nghiệm gửi kỷ lục lên bảng xếp hạng thật. `_headers` đã thêm `noindex` cho các địa chỉ này. Còn lại:

- Bật Cloudflare Access cho bản xem trước (*Settings → General → Access policy* của project Pages).
- Hoặc đặt biến môi trường riêng cho *Preview*, trỏ tới một project Firebase thứ hai.
- Hoặc tắt deploy tự động cho nhánh khác nhánh chính.

Không bao giờ đặt bí mật thật (Secret Key của Metered, service account) vào biến có tiền tố `VITE_`: mọi biến `VITE_*` đều vào bundle công khai.

### 5. HTTPS trên tên miền riêng (thấp, cấu hình)

`*.pages.dev` đã luôn chạy HTTPS (cả miền `.dev` nằm trong danh sách HSTS preload của trình duyệt). Dùng tên miền riêng thì bật *SSL/TLS → Edge Certificates → Always Use HTTPS* và *HSTS* trong Cloudflare.

### 6. Đấu online tin chủ phòng (thấp, theo thiết kế)

- Khách nhận tin `result` của chủ phòng như thật (`receive` trong `src/pvp/match.ts`), nên chủ phòng dùng bản game bị sửa luôn tự xử mình thắng được.
- Tin `bye` với `why: 'cheat'` làm người nhận thua ngay, nên đối thủ dùng bản bị sửa cũng gửi được tin này.
- Nước đi không hợp lệ thì vẫn bị phát hiện, vì mỗi máy chơi lại nước đi của đối thủ.

Kết quả đấu online không được lưu hay xếp hạng ở đâu, nên tác hại chỉ là một trận giao hữu. Nếu sau này có xếp hạng đấu online: khách tự tính kết quả từ bản sao bàn và đồng hồ của mình, so với `result`; lệch thì coi như tranh chấp, và kết quả phải do máy chủ xác nhận.

### 7. Đối thủ biết địa chỉ IP của bạn (thấp, bản chất của WebRTC)

Khi nối thẳng, hai máy biết địa chỉ IP công khai của nhau. Muốn giấu thì chỉ đi qua TURN (`iceTransportPolicy: 'relay'` trong `src/pvp/peer.ts`, hiện chỉ dùng khi thử với `?relay`), đổi lại mọi trận đều tốn băng thông TURN. Có thể làm thành tùy chọn cho người chơi.

### 8. Những điểm nhỏ

- Mã phòng sinh bằng `Math.random` (`randomCode` trong `src/pvp/protocol.ts`). Không đoán được trong thực tế (hơn một tỉ mã, không liệt kê được phòng), nhưng đổi sang `crypto.getRandomValues` thì không tốn gì.
- `npm audit` báo 4 lỗi cao trong `@grpc/grpc-js` (đi kèm `firebase`). Gói này chỉ dùng cho Firestore chạy trên Node, không có trong bundle web (game dùng `firebase/firestore/lite`), và các lỗi đều ở phía máy chủ. `uuid` (qua `@capacitor/cli`) chỉ dùng lúc build. Đừng chạy `npm audit fix --force`: nó hạ `firebase` xuống 9.14. Kiểm tra lại mỗi lần nâng `firebase`.
- Không phải bảo mật nhưng liên quan: tên người chơi hiện công khai trên bảng xếp hạng mà không có kiểm duyệt. Chính sách nội dung do người dùng tạo của Google Play có thể yêu cầu cách báo cáo / ẩn tên xấu.

## Đã kiểm tra, không có vấn đề

- **Không có chỗ chèn HTML.** Không có `innerHTML` / `eval`; thông báo và hộp nhập tên dùng `textContent`; tên người chơi vẽ trên canvas của Phaser. Tên được làm sạch (bỏ ký tự điều khiển và ký tự đảo chiều chữ) khi nhập, khi đọc bảng xếp hạng, khi đọc phòng và khi nhận tin `hello`.
- **Tin nhắn đấu online:** `decode()` (`src/pvp/protocol.ts`) kiểm tra đúng dạng mọi tin và bỏ tin dài quá 2000 ký tự. Kênh dữ liệu WebRTC luôn mã hóa (DTLS).
- **Luật:** chỉ chủ document ghi được dòng của mình, đúng bộ trường, `updatedAt` là giờ máy chủ, điểm không giảm, không ai xóa được. Không liệt kê được phòng; chỉ chủ phòng ghi được phòng; khách chỉ chiếm được chỗ còn trống; ngoài `pvpRooms` thì từ chối hết.
- **Bản build:** `dist/` không có source map; phần chỉ dùng khi phát triển (`window.game`, `pvpBot`, `?relay`) không có trong bundle; chỉ năm biến `VITE_*` (vốn công khai) được đưa vào.

## Kiểm tra lại

- **Header:** `npm run build` rồi `npx wrangler pages dev dist`, mở địa chỉ nó in ra (cổng 8788). Thử bảng xếp hạng và đấu online hai tab (một tab ẩn danh nếu muốn hai tên khác nhau), xem console có `[Report Only]` không. `curl -I` địa chỉ đó để xem header.
- **Luật:** Firebase Emulator (`firebase emulators:exec --only database,firestore`) với `@firebase/rules-unit-testing`. Mỗi lần sửa luật, thử ít nhất: tạo / vào / rời phòng, người ngoài không đọc được `offer` / `answer`, ghi kỷ lục, đổi tên, màn 999 / 1000.
