# Âm thanh đợt 2: tiếng bổ sung và nhạc menu

Ngày: 2026-10-19. Trạng thái: chờ duyệt. Tiếp nối [`2026-10-19-sound-design.md`](2026-10-19-sound-design.md) (đợt 1, đã làm xong); mọi ràng buộc, điều phải tránh và cách tổ chức mã của đợt 1 vẫn giữ nguyên.

Bản mẫu đã duyệt: [`2026-10-19-sound-audition.html`](2026-10-19-sound-audition.html), bản đã cập nhật (các tiếng của đợt 1 không đổi, chỉ thêm). Như đợt 1, mã tạo âm trong đó là **nguồn chuẩn**: các hàm `tap`, `count`, `go`, `warn`, `tick`, `crack`, `launch` trong `STYLES`, và `MENU_MUSIC`. Chuyển sang TypeScript giữ nguyên tham số.

## Mục đích

Đợt 1 để lại sáu chỗ còn im lặng. Chủ dự án đã nghe thử và duyệt cả sáu:

1. tiếng các nút bấm;
2. tiếng đếm ngược đầu trận online;
3. tiếng báo sắp hết giờ;
4. tiếng đá vỡ;
5. tiếng gửi đòn khi đấu online;
6. nhạc nền ở menu.

## Mục tiêu

- Bảy tiếng mới cho cả ba bộ: bấm nút (`tap`), đếm 3-2-1 (`count`), "Bắt đầu!" (`go`), thanh giờ chuyển đỏ (`warn`), tích 10 giây cuối (`tick`, có bản gấp cho 3 giây cuối), đá vỡ (`crack`), gửi đòn (`launch`).
- Mỗi bộ có thêm một bản nhạc menu, chậm và thưa hơn nhạc trong màn chơi.
- Mọi tiếng mới theo công tắc Hiệu ứng, nhạc menu theo công tắc Nhạc nền, và nút loa trong HUD tắt được tất cả.

## Không làm

- Không chỉnh lại các tiếng của đợt 1.
- Không thêm tiếng cho hộp nhập tên và nhập mã phòng (hai hộp này là HTML, không phải nút Phaser).
- Không làm tiếng riêng cho từng loại đòn gửi đi: cả bốn loại dùng chung một tiếng.
- Không thêm thanh âm lượng.

## Điều phải tránh

Giữ nguyên các điều phải tránh của đợt 1, nhất là: **không dùng rng của bàn**, không có tiếng khi đã tắt, nhạc không giật, không phát lại từ đầu, không phát dồn. Thêm ba điều:

- **Nút kêu mà không làm gì.** Nút đang khóa (Gợi ý / Đảo bàn hết lượt) và nút trong hộp thoại đang trong `ignoreTapsMs` thì không có tiếng bấm. Như vậy người chơi không tưởng là mình đã bấm được.
- **Một lần bấm kêu hai tiếng.** Nút đã có tiếng riêng (Gợi ý, Đảo bàn, thẻ chọn bộ ở màn Âm thanh) thì không phát thêm tiếng bấm.
- **Tiếng tích kêu dai dẳng.** Chỉ 10 giây cuối mới có tiếng tích, không kêu suốt lúc thanh giờ đỏ. Tạm dừng thì đồng hồ dừng, nên tiếng tích cũng dừng.

## Đã quyết định

### Tiếng mới → lúc phát

| Tiếng | Lúc phát |
|---|---|
| `tap` | Chạm vào một nút Phaser có tác dụng: nút menu, nút trong hộp thoại, các thẻ (tên, Âm thanh, Hình ô, thẻ bộ hình ô, thẻ tab bảng xếp hạng, Ghi công), nút II. Ngoại lệ ở dưới. |
| `count` | Đấu online: mỗi lần số đếm ngược giữa màn hình đổi (3, 2, 1), kể cả số đầu tiên hiện ra. |
| `go` | Đấu online: lúc hết đếm ngược, các ô hiện ra và có chữ "Bắt đầu!". Không phát nếu trận đã có kết quả trong lúc đếm ngược. |
| `warn` | Thanh thời gian chuyển đỏ, tức lúc thời gian còn lại lần đầu xuống `≤ 25%` thời gian của màn (cùng ngưỡng đổi màu trong `drawTimeBar`). Mỗi màn / mỗi trận chỉ một lần. Vào màn (chơi tiếp từ bản lưu) khi đã dưới ngưỡng thì không phát. |
| `tick` | Mỗi khi số giây còn lại, làm tròn lên, giảm xuống một giá trị từ 10 đến 1. Bản gấp (`urgent`) cho 3, 2, 1. Thưởng thời gian làm số giây tăng lại thì không kêu; lúc giảm xuống lại thì kêu tiếp. Có cả khi chơi một mình lẫn đấu online. Không kêu khi đã kết thúc hay đang tạm dừng. |
| `crack` | Ngay sau tiếng đảo bàn (cách 0,12 s), khi lần đảo đó làm vỡ ít nhất một viên đá. Gồm cả lần đảo khi đấu online và đòn "bị đảo bàn" có làm vỡ đá. |
| `launch` | Đấu online: ngay sau tiếng nối cặp (cách 0,12 s) khi lần ăn cặp đó tung ra một đòn (`played.attack` khác null). |

**Ngoại lệ của `tap`:**
- Gợi ý và Đảo bàn không có tiếng bấm, vì đã có tiếng riêng.
- Thẻ chọn bộ ở màn Âm thanh không có tiếng bấm, vì đã phát mẫu.
- Nút loa trên HUD và hai công tắc ở màn Âm thanh phát `tap` **sau** khi đổi cài đặt. Vì vậy tắt hiệu ứng thì không nghe tiếng, bật lại thì nghe một tiếng xác nhận.

Ở màn Âm thanh, công tắc Hiệu ứng trước đây phát `select` làm mẫu khi bật; giờ đổi thành `tap` cho thống nhất.

### Bậc và độ trễ

`playSfx` có thêm tham số độ trễ (giây, theo đồng hồ âm thanh), dùng cho `crack` và `launch`. `tick` dùng tham số bậc đã có: `0` là thường, `1` là gấp.

### Nhạc menu

- Mỗi bộ có `menuMusic`, lấy đúng `MENU_MUSIC[id]` trong bản mẫu: Gỗ & chuông 72 bpm, Bong bóng 96 bpm, 8-bit 100 bpm, đều 8 ô nhịp.
- Bộ phát nhạc phân biệt hai loại bản nhạc: `game` và `menu`. "Đang phát đúng bản" giờ nghĩa là đúng cả bộ lẫn loại. Đổi loại thì tắt dần bản cũ, tăng dần bản mới, như khi đổi bộ.

**Màn nào phát gì:**

| Màn | Nhạc |
|---|---|
| Menu, Bảng xếp hạng, Hình ô, Sảnh đấu online | Nhạc **menu**. Chuyển qua lại giữa các màn này thì nhạc chạy tiếp, không ngắt. |
| Âm thanh | Nhạc **trong màn chơi** của bộ đang chọn, như đợt 1, để nghe thử. |
| Chơi một mình | Nhạc **trong màn chơi**, như đợt 1. Từ menu vào thì nhạc menu tắt dần, nhạc trong màn tăng dần. |
| Đấu online | **Im** trong lúc đếm ngược, để nghe rõ tiếng đếm. Nhạc trong màn bắt đầu lúc "Bắt đầu!", như đợt 1. Vào từ sảnh thì nhạc menu tắt dần ngay lúc vào màn chơi. |
| Về menu từ màn chơi | Nhạc menu (thay cho việc tắt nhạc như đợt 1). |

- Lần đầu mở app, nhạc menu chỉ nghe được sau lần chạm đầu tiên (luật tự phát tiếng của trình duyệt / Android). Không cần làm gì thêm: bộ phát nhạc đã xếp lịch theo đồng hồ âm thanh, nên đồng hồ chạy là nhạc chạy.

## Kiểm tra và tiêu chí xong

- `npm test` qua, có thêm test cho:
  - đủ bảy tiếng mới ở mỗi bộ (chạy qua `SFX_NAMES` như đợt 1), cả `tick` bậc 0 và 1;
  - `menuMusic` đủ 8 ô nhịp và chỉ đi qua đầu ra nhạc;
  - bộ phát nhạc: cùng bộ cùng loại thì không làm gì, đổi loại thì tắt dần bản cũ;
  - luật thời gian (hàm thuần): đúng lúc nào có `warn`, lúc nào có `tick` thường / gấp, kể cả khi thời gian tăng lại nhờ thưởng và khi vào màn đã dưới ngưỡng.
- `npx tsc` sạch.
- Thử tay trên trình duyệt:
  - tiếng bấm ở mọi màn, không kêu ở nút khóa hay nút có tiếng riêng;
  - đếm ngược với `pvpBot()`;
  - `warn` và `tick` (chỉnh `timeLeft` trong DevTools);
  - đá vỡ (giai đoạn khó, từ màn 43, hoặc dựng bàn có đá trong DevTools);
  - gửi đòn với `pvpBot()` (để mình ăn chuỗi);
  - nhạc menu chạy liền giữa các màn menu và đổi đúng khi vào / ra màn chơi.
- Thử trên tablet Android: như đợt 1, cộng thêm nhạc menu sau lần chạm đầu.
- Cập nhật `CLAUDE.md` và `README.md` (tiếng bấm gắn ở `tapZone`, nhạc menu, luật thời gian). Sửa luôn hai chỗ lệch nhỏ còn lại từ đợt 1: chữ "below" trong `CLAUDE.md` và dòng "chơi lại màn → chạy tiếp" trong bản thiết kế đợt 1.

## Để người làm tự quyết

- Cách `tapZone` biết một lần chạm "có tác dụng" (ví dụ hàm xử lý trả về `false` thì không kêu, hoặc một tham số riêng).
- Tên hàm luật thời gian và chỗ đặt (gợi ý: `src/audio/rules.ts`).
- Cách nhớ số đếm ngược vừa phát.
