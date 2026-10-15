# Các màn chơi và vòng lặp vô tận

Pairfect có **7 màn được thiết kế sẵn**. Sau màn 7, game tiếp tục vô tận trên bàn khó nhất (6 × 16, 30 loại): kiểu dồn ô lần lượt lặp lại theo thứ tự 7 màn, và mỗi vòng ít thời gian hơn cho tới mức sàn 90 giây.

Toàn bộ dữ liệu màn chơi nằm trong `LEVELS` ở [`src/game/levels.ts`](../src/game/levels.ts); vòng lặp nằm trong hàm `getLevel()` cùng file. Tài nguyên của mỗi màn (gợi ý, đảo bàn, cách tính điểm) là các hằng số đầu file [`src/scenes/GameScene.ts`](../src/scenes/GameScene.ts).

## Luật chung cho mọi màn

- **Nối ô.** Hai ô cùng loại được xóa khi có đường đi qua các ô trống nối chúng với **tối đa 2 lần rẽ**. Đường nối được đi qua vòng ô trống ngay bên ngoài bàn, nên các ô nằm ở mép thường dễ nối.
- **Thời gian.** Mỗi màn có giới hạn thời gian riêng. Mỗi cặp xóa được cộng **+1 giây**, nhưng đồng hồ không bao giờ vượt quá thời gian ban đầu của màn. Thanh thời gian chuyển sang đỏ khi còn từ 25% trở xuống.
- **Điểm.**
  - Mỗi cặp được **10 điểm**.
  - Qua màn được thưởng **2 điểm cho mỗi giây còn lại** (làm tròn lên).
  - Điểm được cộng dồn từ màn này sang màn sau trong cùng một lượt chơi.
- **Trợ giúp mỗi màn.**
  - **3 lần Gợi ý**, mỗi lần chỉ ra một cặp nối được.
  - **3 lần Đảo bàn**, mỗi lần xáo lại các ô còn lại vào đúng những vị trí đó.
  - Cả hai được đặt lại khi bắt đầu mỗi màn.
- **Tự động đảo bàn miễn phí.** Khi không còn cặp nào nối được, bàn tự xáo lại mà không trừ lượt Đảo bàn, kèm thông báo "Hết nước đi – tự động đảo bàn".
- **Cách chia loại hình.** Các cặp được chia lần lượt cho từng loại: loại 1, loại 2, … tới số loại của màn, rồi quay lại loại 1.
  - Khi số cặp đúng bằng hai lần số loại, mỗi loại có **4 ô**: 2 cặp, ghép kiểu nào cũng được.
  - Khi số loại nhiều hơn thế, các loại dư chỉ có **2 ô**, nên mỗi ô đó chỉ có đúng một ô để ghép. Đây là điều khiến màn 6 và 7 khó hơn.
- **Hình trên ô.** Có 40 loại hình, tạo từ 8 hình dạng × 5 màu. Màn càng dùng nhiều loại thì càng nhiều ô trùng hình dạng hoặc trùng màu với ô khác, nên càng khó phân biệt khi nhìn nhanh.

## Tổng quan các màn

| Màn | Tên (trong game) | Bàn | Số ô (số cặp) | Số loại | Số ô mỗi loại | Thời gian gốc | Thời gian gốc mỗi cặp |
|---|---|---|---|---|---|---|---|
| 1 | Cổ điển | 4 × 12 | 48 (24) | 12 | 4 ô | 3:00 | 7,5 giây |
| 2 | Dồn xuống | 5 × 12 | 60 (30) | 15 | 4 ô | 3:20 | 6,7 giây |
| 3 | Dồn trái | 5 × 16 | 80 (40) | 20 | 4 ô | 4:00 | 6,0 giây |
| 4 | Dồn lên | 6 × 16 | 96 (48) | 24 | 4 ô | 4:30 | 5,6 giây |
| 5 | Dồn phải | 6 × 16 | 96 (48) | 24 | 4 ô | 4:20 | 5,4 giây |
| 6 | Dồn vào giữa (ngang) | 6 × 16 | 96 (48) | 28 | loại 1–20: 4 ô, loại 21–28: 2 ô | 4:20 | 5,4 giây |
| 7 | Dồn vào giữa (dọc) | 6 × 16 | 96 (48) | 30 | loại 1–18: 4 ô, loại 19–30: 2 ô | 4:10 | 5,2 giây |

Kích thước bàn ghi theo hàng × cột. Bàn thấp và rộng vì game chỉ chơi màn ngang.

## Các kiểu dồn ô

Mỗi màn có một kiểu dồn ô, quyết định các ô còn lại di chuyển thế nào sau khi xóa một cặp. Tên kiểu dồn hiện ngay dưới số màn trên thanh HUD.

| Kiểu | Điều xảy ra sau khi xóa một cặp |
|---|---|
| `none` (Cổ điển) | Không ô nào di chuyển. Ô bị xóa để lại chỗ trống. |
| `down` (Dồn xuống) | Trong mỗi cột, các ô rơi xuống dưới, lấp kín chỗ trống. |
| `up` (Dồn lên) | Trong mỗi cột, các ô dồn lên trên. |
| `left` (Dồn trái) | Trong mỗi hàng, các ô trượt về mép trái. |
| `right` (Dồn phải) | Trong mỗi hàng, các ô trượt về mép phải. |
| `center-h` (Dồn vào giữa – ngang) | Mỗi hàng được chia đôi: nửa trái trượt sang phải, nửa phải trượt sang trái, nên các ô dồn sát vào đường thẳng đứng ở giữa bàn. |
| `center-v` (Dồn vào giữa – dọc) | Mỗi cột được chia đôi: nửa trên trượt xuống, nửa dưới trượt lên, nên các ô dồn sát vào đường nằm ngang ở giữa bàn. |

Kiểu dồn làm bàn thay đổi sau mỗi lần ăn cặp. Đường nối bạn đang tính có thể biến mất, và đường mới mở ra ở phía các ô vừa rời đi.

## Từng màn

### Màn 1 – Cổ điển
Màn làm quen: bàn 4 × 12, 12 loại, không dồn ô, 3 phút. Chỉ có 4 hàng nên mọi ô đều nằm ở mép ngoài hoặc cách mép một ô. Đường vòng ra ngoài bàn thường có sẵn, và không ô nào di chuyển, nên bạn thoải mái tính trước.

### Màn 2 – Dồn xuống
Màn đầu tiên có dồn ô. Bàn lớn lên 5 × 12 với 15 loại. Sau mỗi lần ăn cặp, phần cột phía trên ô bị xóa rơi xuống, nên phía trên bàn trống ra trước. Những cặp đang bị chặn thường nối được qua khoảng trống phía trên.

### Màn 3 – Dồn trái
Bàn lớn hơn hẳn: 5 × 16 (80 ô) với 20 loại. Các ô trượt sang trái theo hàng, nên bên phải trống ra trước còn bên trái vẫn dày đặc. Có 4 phút, nhưng chỉ còn 6 giây cho mỗi cặp.

### Màn 4 – Dồn lên
Bàn kích thước đầy đủ: 6 × 16 (96 ô) với 24 loại. Các ô dồn lên trên, ngược với màn 2. Với 4:30, đây là màn có nhiều thời gian nhất, vì là lần đầu người chơi gặp bàn 96 ô.

### Màn 5 – Dồn phải
Cùng bàn và số loại như màn 4 nhưng ít hơn 10 giây. Các ô trượt sang phải, nên bên trái trống ra trước.

### Màn 6 – Dồn vào giữa (ngang)
Có 28 loại, trong đó 8 loại (21–28) chỉ có một cặp. Các ô dồn về đường thẳng đứng ở giữa bàn, nên mép trái và mép phải trống dần còn phần giữa luôn chật. Nên tìm trước những cặp chỉ có đúng một ô để ghép.

### Màn 7 – Dồn vào giữa (dọc)
Màn khó nhất trong các màn thiết kế sẵn: 30 loại, có 12 loại chỉ một cặp (19–30), và ít thời gian cho mỗi cặp nhất. Các ô dồn về đường nằm ngang ở giữa bàn, nên hàng trên cùng và hàng dưới cùng trống ra trước còn các hàng giữa vẫn dày đặc.

## Vòng lặp vô tận

Sau màn 7, game tiếp tục vô tận với màn 8, 9, … (HUD vẫn đếm tăng dần: "Màn 8", "Màn 9", …). Từ màn 8 trở đi:

- **Bàn và số loại giữ như màn 7:** bàn 6 × 16 (96 ô) với 30 loại, trong đó loại 1–18 có 4 ô, loại 19–30 chỉ có 2 ô.
- **Kiểu dồn lặp lại theo thứ tự 7 màn:** màn 8 Cổ điển, màn 9 Dồn xuống, màn 10 Dồn trái, màn 11 Dồn lên, màn 12 Dồn phải, màn 13 Dồn vào giữa (ngang), màn 14 Dồn vào giữa (dọc), màn 15 lại Cổ điển, …
- **Thời gian tính từ màn 7 (250 giây)**, giảm 30 giây mỗi vòng 7 màn, thấp nhất 90 giây. Mọi màn trong cùng một vòng có cùng thời gian.

Cách `getLevel()` tính màn số *N* (từ 8 trở đi):

```
index           = N - 1
kiểu dồn        = LEVELS[index % 7].gravity
số vòng đã qua  = floor(index / 7)     // 1 ở vòng 2 (màn 8–14), 2 ở vòng 3 (màn 15–21), ...
thời gian       = max(90, 250 - 30 × số vòng đã qua)
```

### Thời gian mỗi vòng

| Vòng | Màn | Thời gian mỗi màn | Thời gian mỗi cặp (chưa tính thưởng) |
|---|---|---|---|
| 1 | 1–7 | theo từng màn (xem bảng tổng quan) | 7,5 → 5,2 giây |
| 2 | 8–14 | 220 giây (3:40) | 4,6 giây |
| 3 | 15–21 | 190 giây (3:10) | 4,0 giây |
| 4 | 22–28 | 160 giây (2:40) | 3,3 giây |
| 5 | 29–35 | 130 giây (2:10) | 2,7 giây |
| 6 | 36–42 | 100 giây (1:40) | 2,1 giây |
| 7 trở đi | từ 43 | 90 giây (1:30) | 1,9 giây |

- Màn 8 nối tiếp màn 7 mà không có bước nhảy độ khó: cùng bàn, cùng số loại, chỉ ít hơn 30 giây và đổi kiểu dồn.
- Từ **màn 43 trở đi**, mọi màn đều 90 giây và độ khó không tăng nữa. Lượt chơi tiếp tục chừng nào người chơi còn theo kịp.
- Vẫn được +1 giây mỗi cặp, miễn là đồng hồ còn dưới mức ban đầu. Ở mức sàn 90 giây, ăn cặp đều tay ngay từ đầu cho tổng cộng tối đa 90 + 48 = 138 giây, khoảng 2,9 giây mỗi cặp.

## Tiến độ, mở khóa và chơi lại

- **Mở khóa.** Qua một màn sẽ mở khóa màn thiết kế sẵn tiếp theo trong màn hình "Chọn màn". Tiến độ được lưu trong `localStorage` với khóa `pairfect-unlocked`. Qua màn 7 thì cả 7 màn đều mở.
- **Chọn màn luôn bắt đầu lượt chơi mới.** Màn được chọn chạy ở vòng 1 (đủ thời gian) với 0 điểm. Các vòng sau (từ màn 8) chỉ đến được bằng cách chơi tiếp qua nút "Màn tiếp theo".
- **Hết giờ.** Nút "Chơi lại" bắt đầu lại **đúng số màn đó**, giữ nguyên vòng và thời gian đã giảm, với điểm về 0. Chơi lại từ menu tạm dừng cũng vậy.
- **Kỷ lục.** Điểm cao nhất ("Kỷ lục") được lưu với khóa `pairfect-best` khi qua màn, khi hết giờ, hoặc khi rời màn từ menu tạm dừng.

## Chỉnh sửa các màn

- Sửa mảng `LEVELS` trong `src/game/levels.ts`. Mỗi màn có `rows`, `cols`, `types`, `gravity` và `time`.
- Điều kiện mỗi màn phải thỏa:
  - `rows × cols` phải là số chẵn.
  - Bàn nên rộng hơn cao (`cols > rows`).
  - `types` tối đa là 40.
  - Để mọi loại đều có 4 ô, đặt `types = rows × cols / 4`. Số loại vượt quá con số đó sẽ thành loại chỉ có một cặp.
- `npm test` kiểm tra các điều kiện này, kiểm tra quy tắc vòng lặp, và tự chơi hết mọi màn cùng một vòng lặp (`src/game/levels.test.ts`).
- Vòng lặp luôn lấy bàn, số loại và thời gian của **màn cuối cùng** trong `LEVELS`; thêm hay đổi màn cuối sẽ đổi luôn vòng lặp. Mức giảm mỗi vòng và mức sàn là hai hằng số `LOOP_TIME_STEP` (30 giây) và `LOOP_MIN_TIME` (90 giây) trong `src/game/levels.ts`.
- Để đổi số lượt gợi ý, số lượt đảo bàn, điểm mỗi cặp hoặc thời gian thưởng, sửa các hằng số đầu file `src/scenes/GameScene.ts`.
