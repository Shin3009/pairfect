# Âm thanh và nhạc nền

Ngày: 2026-10-19. Trạng thái: đã duyệt.

Bản mẫu đã duyệt: [`2026-10-19-sound-audition.html`](2026-10-19-sound-audition.html). Đây là trang nghe thử mà người chơi (chủ dự án) đã nghe và duyệt. Mã tạo âm trong đó (`STYLES`, `MUSIC`, các hàm `tone` / `noise` / `sweep` / `marimba` / `bell` / `woodTick` / `duck`) là **nguồn chuẩn** của mọi tiếng và mọi bản nhạc: chuyển sang TypeScript giữ nguyên tham số, không chỉnh tai. Mở trang bằng trình duyệt để nghe lại.

## Mục đích

Game hiện chưa có âm thanh nào. Cần thêm tiếng cho các thao tác chính, tiếng kết thúc màn, tiếng bị tấn công khi đấu online, và nhạc nền, để game có cảm giác "sống" và phản hồi rõ hơn trên tablet.

Chủ dự án thích cả ba hướng đã nghe thử, nên người chơi được **chọn một trong ba bộ âm thanh**: *Gỗ & chuông*, *Bong bóng*, *8-bit*. Mỗi bộ gồm đủ mọi tiếng và một bản nhạc nền riêng.

## Mục tiêu

- Ba bộ âm thanh, giống hệt bản mẫu, chọn được trong game, lưu trên máy.
- Tiếng cho: chọn ô, bỏ chọn, không nối được, nối cặp (cao dần theo chuỗi), gợi ý, đảo bàn, qua màn, thua, và bốn loại đòn bị tấn công khi đấu online.
- Nhạc nền riêng cho mỗi bộ, lặp liền mạch.
- Tắt được hiệu ứng và nhạc nền riêng rẽ, và tắt nhanh mọi tiếng ngay trong màn chơi.

## Không làm lần này

- Thanh chỉnh âm lượng. Mức to nhỏ cố định theo bản mẫu; người chơi dùng nút âm lượng của máy.
- Tiếng cho: đòn mình gửi đi, đếm ngược đầu trận online, sắp hết giờ, đá vỡ khi đảo bàn, các nút ở menu.
- File âm thanh hay nhạc thu sẵn.
- Nhạc ở menu, bảng xếp hạng, sảnh đấu online, màn chọn hình ô.

## Điều phải tránh (làm vậy là hỏng, dù chạy được)

- **Đụng vào rng của bàn.** Độ lệch cao độ ngẫu nhiên của tiếng (`jit`) và tiếng xáo dùng `Math.random`, không bao giờ dùng `Board.rng` / `seededRng`. Dùng rng của bàn sẽ làm hai máy đấu online lệch nhau và bị xử `cheat`. Âm thanh không được đổi bất kỳ thứ gì trong `Board`, `Match`, `levels` (không cần tăng `PROTOCOL`).
- **Có tiếng khi người chơi đã tắt**, hoặc nhạc vẫn chạy khi app xuống nền.
- **Nhạc giật hay phát lại từ đầu** khi chuyển sang màn tiếp theo, chơi lại màn, hay đấu lại.
- **Nhạc dồn một tràng** khi app quay lại sau khi bị ẩn (bộ xếp lịch phải bỏ qua phần đã lỡ, như `tick` trong bản mẫu).
- **Tiếng "mắng" người chơi khi họ chỉ đổi ý**: chạm sang ô khác hình chỉ phát tiếng chọn, không phát tiếng "không nối được".
- **Làm chậm hay đổi luồng chơi.** Âm thanh chỉ là lớp phát thêm; không chờ âm thanh, không đổi thời điểm hay thứ tự bất kỳ thao tác nào. Máy không có Web Audio thì game chạy bình thường, chỉ im lặng.

## Ràng buộc

- Phaser 4 + TypeScript + Vite + Capacitor 8 (xem `CLAUDE.md`). Không thêm thư viện.
- Tạo âm bằng Web Audio API ngay trong code, không có file âm thanh, không cần mạng (CSP trong `public/_headers` không đổi).
- Chú thích trong code và chữ hiện cho người chơi viết bằng tiếng Việt.
- Chỉ màn ngang; mọi giao diện mới sắp xếp theo `this.scale.width` như các scene khác và đăng ký `onGameResize`.
- Mọi scene mới phải tự xử lý nút Back của Android (xem `native.ts`).

## Âm thanh: đã quyết định

### Ba bộ

| id | Tên hiện cho người chơi | Tính chất |
|---|---|---|
| `wood` | Gỗ & chuông | Ấm, nhẹ, kiểu marimba. Mặc định. |
| `bubble` | Bong bóng | Pop vui nhộn, hợp bộ trái cây và quái vật. |
| `chip` | 8-bit | Máy game cổ, hợp bộ Tuxemon. |

Tên trong bảng là chữ hiện trong game. Tiếng và nhạc của từng bộ: lấy đúng theo `STYLES[id]` và `MUSIC[id]` trong bản mẫu.

### Sự kiện → tiếng

| Sự kiện | Tiếng trong bản mẫu | Chỗ gọi trong `GameScene` |
|---|---|---|
| Chạm một ô khi chưa chọn gì | `select` | `onPointer`, nhánh `!this.selected` |
| Chạm lại ô đang chọn | `deselect` | `onPointer`, nhánh `same(...)` |
| Chạm ô **khác hình** (chuyển chọn) | `select` | `onPointer`, nhánh không có đường, hai ô khác loại |
| Chạm ô **cùng hình** nhưng không có đường | `wrong` | `onPointer`, nhánh không có đường, hai ô cùng loại |
| Nối được cặp | `match(t, bậc)` | `matchPair`, chỉ khi cặp thực sự được ăn (PvP: sau khi `match.play` trả về khác null) |
| Dùng Gợi ý | `hint` | `useHint`, sau khi đã tìm được nước |
| Đảo bàn (tự bấm, hoặc tự đảo khi bế tắc) | `shuffle` | `shuffleBoard`, sau khi đảo thành công (`broken` khác null) |
| Qua màn | `clear` | `winLevel`, cùng lúc mở hộp "Qua màn!" |
| Thua màn (hết giờ / hết nước) | `lose` | `loseLevel`, trừ khi đang dựng lại hộp thua từ bản lưu (`play.lost` lúc `create`) |
| Đấu online: thắng trận | `clear` | `showResult`, **một lần** mỗi trận (hộp kết quả mở lại nhiều lần) |
| Đấu online: thua trận | `lose` | như trên |
| Đấu online: hòa | không có tiếng | |
| Bị thả đá | `hit.stone` | `showHit`, trừ khi đá không rơi được (`!e.at`, hàm đã `return` sớm) |
| Bị nghiêng bàn | `hit.tilt` | `showHit` |
| Bị che mắt | `hit.fog` | `showHit` |
| Bị đảo bàn | `hit.shuffle` | `showHit` |

### Chuỗi (nốt cao dần)

- Một mình: hai lần ăn cặp cách nhau tối đa `COMBO_MS` (2000 ms, lấy từ `pvp/attacks.ts`) thì tính là một chuỗi, giống luật đấu online. Độ dài chuỗi bắt đầu từ 1 ở cặp đầu tiên, như `Side.combo`. Đo bằng đồng hồ thật (không theo `this.time`), và tạm dừng giữa chuỗi không cần xử lý gì đặc biệt.
- Đấu online: dùng chính `played.combo` mà `match.play` trả về.
- Bậc truyền cho `match(t, bậc)` là `min(combo - 1, 7)`.

### Nhạc nền

- Mỗi bộ có một bản lặp 8 ô nhịp (`MUSIC[id]` trong bản mẫu: `bpm`, các nốt, hàm `play(step, t, out, stepDuration)` cho từng nốt móc kép).
- Xếp lịch trước một khoảng ngắn bằng đồng hồ của `AudioContext` (bản mẫu: tối đa 0,15 s, mỗi 40 ms). Lỡ nhịp (app bị ẩn) thì nhảy tới hiện tại, không phát dồn.
- Nhạc đi qua một nút "nhỏ lại" (`duck`): `clear` và `lose` hạ nhạc xuống 20% trong khoảng 2 s rồi trả lại, như bản mẫu. Hiệu ứng đang tắt thì hai tiếng này không phát và cũng không hạ nhạc.
- Mức trộn cố định theo bản mẫu: hiệu ứng 0.9, nhạc 0.5, rồi cùng đi qua bộ nén (`DynamicsCompressor`) với đúng tham số trong bản mẫu.

**Khi nào có nhạc:**

| Lúc | Nhạc |
|---|---|
| Vào màn chơi một mình | Bắt đầu (tăng dần 0,6 s), trừ khi đang dựng lại hộp thua từ bản lưu (`play.lost`): khi đó giữ tắt, như lúc hộp thua mở. |
| Đấu online | Bắt đầu khi hết đếm ngược và các ô hiện ra ("Bắt đầu!"). |
| Sang màn tiếp theo, chơi lại màn, đấu lại | Chạy tiếp, không ngắt, không phát lại từ đầu (scene khởi động lại nhưng bộ phát nhạc nằm ngoài scene). Đấu lại: nhạc đã tắt lúc có kết quả, nên bắt đầu lại khi trận mới bắt đầu. |
| Hộp Tạm dừng mở | Ngưng; "Tiếp tục" thì chạy tiếp. Phát lại từ đầu vòng hay từ chỗ dừng đều được. |
| App xuống nền | Im ngay. Lúc quay lại game đang ở hộp Tạm dừng (một mình) nên nhạc vẫn ngưng; đấu online thì nhạc chạy tiếp. |
| Qua màn | `clear` hạ nhạc trong lúc phát rồi nhạc chạy tiếp dưới hộp "Qua màn!" và sang màn sau. |
| Thua màn | `lose` phát, nhạc tắt dần và giữ tắt khi hộp thua còn mở. "Chơi lại" thì nhạc bắt đầu lại. |
| Đấu online có kết quả | Nhạc tắt dần sau tiếng thắng/thua. |
| Về menu hay sang scene khác (trừ màn chọn âm thanh) | Tắt dần. |
| Màn chọn âm thanh đang mở | Phát nhạc của bộ đang chọn (nếu nhạc đang bật), đổi bộ thì đổi nhạc, rời màn thì tắt. |
| Đổi bộ âm thanh | Chỉ đổi được ở menu, nên lần chơi sau dùng bộ mới. |

## Cài đặt: đã quyết định

Ba giá trị, lưu trên máy:

- `set`: `'wood' | 'bubble' | 'chip'`, mặc định `'wood'`.
- `sfx`: bật/tắt hiệu ứng, mặc định bật.
- `music`: bật/tắt nhạc nền, mặc định bật.

Lưu ở khóa mới `pairfect-sound` trong `src/game/storage.ts`, dạng JSON `{ set, sfx, music }`, qua `read` / `write` như các khóa khác (lỗi bộ nhớ thì bỏ qua). Giá trị hỏng hay thiếu thì trường đó lấy mặc định; `set` không còn tồn tại thì về `'wood'`. Có test trong `storage.test.ts`. Không cần sao lưu sang SharedPreferences: mất cài đặt thì chỉ quay về mặc định.

### Màn chọn âm thanh (scene mới `Sound`)

- Mở từ một thẻ mới **"Âm thanh"** ở góc trên bên phải menu, nằm bên trái thẻ "Hình ô" và cùng kiểu với nó (nền `C.panel`, cao `CHIP_H`, có biểu tượng loa thay cho ô mẫu).
- Bố cục theo kiểu `TileArtScene`: tiêu đề "Âm thanh", ba thẻ cho ba bộ, mỗi thẻ có tên bộ, một dòng mô tả (cột "Tính chất" ở trên), và dòng "Đang dùng" kèm viền màu nhấn ở bộ đang chọn.
- Chạm vào một thẻ: chọn bộ đó, lưu ngay, phát mẫu `select` rồi `match(t, 0)` (nếu hiệu ứng đang bật), và đổi nhạc đang phát sang bộ mới (nếu nhạc đang bật).
- Hai công tắc: **"Hiệu ứng"** và **"Nhạc nền"**, mỗi cái hiện rõ trạng thái Bật / Tắt, chạm để đổi, lưu ngay. Bật nhạc thì nhạc bắt đầu, tắt thì tắt dần.
- Nút "Quay lại" về `Menu`. Nút Back của Android cũng về `Menu`.
- Đăng ký trong `main.ts` cùng các scene khác.

### Nút tắt tiếng trong màn chơi

- HUD có thêm một nút vuông biểu tượng loa (`IconButton`, cỡ `HUD_BTN`, không có huy hiệu số), đặt ngay sau nút II. Có ở cả chơi một mình và đấu online.
- Biểu tượng loa khi đang có tiếng (`sfx` hoặc `music` bật), loa gạch chéo khi cả hai tắt. Hai biểu tượng mới vẽ trong `src/scenes/icons.ts` (`sound`, `mute`) theo cách các biểu tượng hiện có.
- Chạm khi đang có tiếng: nhớ cặp (`sfx`, `music`) hiện tại rồi tắt cả hai. Chạm khi cả hai đang tắt: trả lại cặp đã nhớ; không nhớ gì (hay cặp đã nhớ cũng tắt hết) thì bật cả hai. Phần nhớ chỉ sống trong phiên chạy app, không lưu.
- Thay đổi được lưu như ở màn chọn âm thanh, và có hiệu lực ngay: nhạc tắt/bật, hiệu ứng thôi phát.
- Thanh thời gian ngắn lại tương ứng (HUD vẫn xếp theo bề rộng thật như hiện nay).

## Cấu trúc mã: đã quyết định

- **`src/audio/`** là thư mục mới:
  - phần tạo âm (chuyển từ bản mẫu): các hàm `tone`, `noise`, `sweep`, `marimba`, `bell`, `woodTick`, sóng xung 25% và 12,5%, bộ đệm nhiễu;
  - ba bộ: tiếng và nhạc của `wood`, `bubble`, `chip`, kiểu hóa đầy đủ (tên sự kiện là một union type, bốn loại đòn dùng `AttackKind`);
  - bộ điều khiển dùng chung cho các scene: phát một tiếng theo bộ và cài đặt hiện tại, bắt đầu / ngưng / tiếp / tắt dần nhạc, hạ nhạc, áp cài đặt mới. Nó là một module sống ngoài scene (như `toast.ts`), nên nhạc chạy xuyên qua `scene.restart`.
- **AudioContext**: dùng của Phaser (`game.sound` là `WebAudioSoundManager` thì lấy `.context`), để có sẵn việc mở khóa âm thanh ở lần chạm đầu tiên. `game.sound` không phải Web Audio thì mọi lời gọi âm thanh không làm gì. Nối đầu ra của mình vào `destination` của Phaser hay thẳng vào `context.destination` đều được.
- **App xuống nền**: không trông vào việc `pauseOnBlur` của Phaser có chạy trên Android hay không. Bộ điều khiển tự ngưng nhạc (hoặc `suspend` context) khi trang bị ẩn, qua `Phaser.Core.Events.HIDDEN` / `VISIBLE` của game hoặc qua `onSuspend`, và tiếp tục khi trang hiện lại nếu nhạc đáng lẽ đang chạy.
- `GameScene` chỉ gọi bộ điều khiển ở những chỗ trong bảng sự kiện và bảng nhạc; không tự tạo node Web Audio.

## Kiểm tra và tiêu chí xong

- `npm test` qua. Thêm test cho:
  - đọc/ghi cài đặt âm thanh: mặc định, giá trị hỏng, `set` lạ;
  - mỗi bộ đủ mọi sự kiện, mỗi bản nhạc đủ 8 ô nhịp (kiểm tra cấu trúc dữ liệu, không cần Web Audio);
  - quy đổi chuỗi một mình: cặp cách nhau ≤ `COMBO_MS` thì tăng chuỗi, xa hơn thì về 1, bậc kẹp ở 7 (nếu tách thành hàm thuần).
- `npx tsc` sạch.
- Thử tay bằng `npm run dev` trên trình duyệt, rồi bằng APK trên tablet Android:
  - nghe từng sự kiện trong bảng (đấu online thử bằng `pvpBot()` trong DevTools);
  - nhạc không ngắt khi sang màn sau / chơi lại / đấu lại; ngưng khi tạm dừng; im khi app xuống nền; không phát dồn khi quay lại;
  - tắt hiệu ứng / nhạc ở màn chọn và bằng nút loa trong HUD, khởi động lại app thì cài đặt còn nguyên;
  - nghe trên loa tablet, mức hiệu ứng và nhạc cân nhau như trên bản mẫu.
- Cập nhật `CLAUDE.md` (tiếng Anh, như hiện tại): thư mục `src/audio/`, scene `Sound` và thứ tự scene, khóa thứ sáu của `storage.ts`, nút loa trong HUD, và quy tắc âm thanh không dùng rng của bàn. Cập nhật `README.md` (tiếng Việt) nếu nó liệt kê tính năng.

## Để người làm tự quyết

- Chia file trong `src/audio/` và tên hàm, kiểu.
- Bộ xếp lịch nhạc chạy bằng `setInterval` hay vòng lặp của game, miễn đúng các yêu cầu ở phần nhạc nền.
- Hình vẽ cụ thể của biểu tượng loa / loa gạch chéo, và hình dạng công tắc Bật / Tắt ở màn chọn âm thanh (theo bảng màu `C`).
- Tạm dừng: nhạc ngưng bằng cách tắt dần rồi phát lại, hay `suspend` context, hay cách khác, miễn nghe trơn tru.
