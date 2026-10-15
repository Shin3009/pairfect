# Các màn chơi và vòng lặp vô tận

Pairfect có **7 màn được thiết kế sẵn**, bàn lớn dần tới tối đa 7 × 20. Sau màn 7, game tiếp tục vô tận trên bàn khó nhất (7 × 20, 40 loại): kiểu dồn ô lần lượt lặp lại theo thứ tự 7 màn, và mỗi vòng ít thời gian hơn cho tới mức sàn 140 giây (2:20). Từ màn 43, khi thời gian không giảm được nữa, game chuyển sang **giai đoạn khó** với các kiểu dồn mới và đá chắn đường.

Toàn bộ dữ liệu màn chơi nằm trong `LEVELS` ở [`src/game/levels.ts`](../src/game/levels.ts); vòng lặp nằm trong hàm `getLevel()` cùng file. Tài nguyên của mỗi màn (gợi ý, đảo bàn, cách tính điểm) là các hằng số đầu file [`src/scenes/GameScene.ts`](../src/scenes/GameScene.ts).

## Luật chung cho mọi màn

- **Nối ô.** Hai ô cùng loại được xóa khi có đường đi qua các ô trống nối chúng với **tối đa 2 lần rẽ**. Đường nối được đi qua vòng ô trống ngay bên ngoài bàn, nên các ô nằm ở mép thường dễ nối.
- **Thời gian.** Mỗi màn có giới hạn thời gian riêng. Mỗi cặp xóa được cộng **+1 giây**, nhưng đồng hồ không bao giờ vượt quá thời gian ban đầu của màn. Thanh thời gian chuyển sang đỏ khi còn từ 25% trở xuống.
- **Điểm.**
  - Mỗi cặp được **10 điểm**.
  - Qua màn được thưởng **2 điểm cho mỗi giây còn lại** (làm tròn lên).
  - Điểm được cộng dồn từ màn này sang màn sau trong cùng một lượt chơi.
- **Trợ giúp mỗi màn.**
  - **+3 lần Gợi ý**, mỗi lần chỉ ra một cặp nối được.
  - **+3 lần Đảo bàn**, mỗi lần xáo lại các ô còn lại vào đúng những vị trí đó.
  - Lượt chưa dùng được **cộng dồn** sang màn sau trong cùng một lượt chơi. Ví dụ qua màn 1 còn 2 Gợi ý và 2 Đảo bàn thì màn 2 có 2 + 3 = 5 Gợi ý và 5 Đảo bàn. Hộp thoại qua màn hiện số lượt mang sang.
  - Giống điểm, lượt cộng dồn mất khi bắt đầu lượt chơi mới: chơi từ menu, chơi lại sau khi hết giờ, hoặc chọn "Chơi lại màn" khi tạm dừng đều quay về 3 Gợi ý và 3 Đảo bàn.
- **Tự động đảo bàn tốn lượt.** Khi không còn cặp nào nối được, bàn tự xáo lại và **trừ 1 lượt Đảo bàn** của người chơi, kèm thông báo "Hết nước đi – tự dùng 1 lượt Đảo bàn". Nếu đã hết lượt Đảo bàn thì **thua màn** ngay ("Hết nước đi!"), giống như hết giờ.
- **Cách chia loại hình.** Các cặp được chia lần lượt cho từng loại: loại 1, loại 2, … tới số loại của màn, rồi quay lại loại 1.
  - Khi số cặp đúng bằng hai lần số loại, mỗi loại có **4 ô**: 2 cặp, ghép kiểu nào cũng được.
  - Khi số loại nhiều hơn thế, các loại dư chỉ có **2 ô**, nên mỗi ô đó chỉ có đúng một ô để ghép. Đây là điều khiến màn 6 và 7 khó hơn.
- **Hình trên ô.** Có 40 loại hình, tạo từ 8 hình dạng × 5 màu; màn 7 dùng đủ cả 40. Màn càng dùng nhiều loại thì càng nhiều ô trùng hình dạng hoặc trùng màu với ô khác, nên càng khó phân biệt khi nhìn nhanh.

## Tổng quan các màn

| Màn | Tên (trong game) | Bàn | Số ô (số cặp) | Số loại | Số ô mỗi loại | Thời gian gốc | Thời gian gốc mỗi cặp |
|---|---|---|---|---|---|---|---|
| 1 | Cổ điển | 4 × 12 | 48 (24) | 12 | 4 ô | 3:00 | 7,5 giây |
| 2 | Dồn xuống | 5 × 12 | 60 (30) | 15 | 4 ô | 3:20 | 6,7 giây |
| 3 | Dồn trái | 5 × 16 | 80 (40) | 20 | 4 ô | 4:00 | 6,0 giây |
| 4 | Dồn lên | 6 × 16 | 96 (48) | 24 | 4 ô | 4:30 | 5,6 giây |
| 5 | Dồn phải | 6 × 18 | 108 (54) | 27 | 4 ô | 4:50 | 5,4 giây |
| 6 | Dồn vào giữa (ngang) | 7 × 18 | 126 (63) | 34 | loại 1–29: 4 ô, loại 30–34: 2 ô | 5:30 | 5,2 giây |
| 7 | Dồn vào giữa (dọc) | 7 × 20 | 140 (70) | 40 | loại 1–30: 4 ô, loại 31–40: 2 ô | 6:00 | 5,1 giây |

Kích thước bàn ghi theo hàng × cột. Bàn thấp và rộng vì game chỉ chơi màn ngang; lớn nhất là 7 × 20.

## Các kiểu dồn ô

Mỗi màn có một kiểu dồn ô, quyết định các ô còn lại di chuyển thế nào sau khi xóa một cặp. Tên kiểu dồn hiện ngay sau số màn trên thanh HUD.

| Kiểu | Điều xảy ra sau khi xóa một cặp |
|---|---|
| `none` (Cổ điển) | Không ô nào di chuyển. Ô bị xóa để lại chỗ trống. |
| `down` (Dồn xuống) | Trong mỗi cột, các ô rơi xuống dưới, lấp kín chỗ trống. |
| `up` (Dồn lên) | Trong mỗi cột, các ô dồn lên trên. |
| `left` (Dồn trái) | Trong mỗi hàng, các ô trượt về mép trái. |
| `right` (Dồn phải) | Trong mỗi hàng, các ô trượt về mép phải. |
| `center-h` (Dồn vào giữa – ngang) | Mỗi hàng được chia đôi: nửa trái trượt sang phải, nửa phải trượt sang trái, nên các ô dồn sát vào đường thẳng đứng ở giữa bàn. |
| `center-v` (Dồn vào giữa – dọc) | Mỗi cột được chia đôi: nửa trên trượt xuống, nửa dưới trượt lên, nên các ô dồn sát vào đường nằm ngang ở giữa bàn. |

Kiểu dồn làm bàn thay đổi sau mỗi lần ăn cặp. Đường nối bạn đang tính có thể biến mất, và đường mới mở ra ở phía các ô vừa rời đi. Giai đoạn khó có thêm các kiểu dồn khác (xem phần cuối).

## Từng màn

### Màn 1 – Cổ điển
Màn làm quen: bàn 4 × 12, 12 loại, không dồn ô, 3 phút. Chỉ có 4 hàng nên mọi ô đều nằm ở mép ngoài hoặc cách mép một ô. Đường vòng ra ngoài bàn thường có sẵn, và không ô nào di chuyển, nên bạn thoải mái tính trước.

### Màn 2 – Dồn xuống
Màn đầu tiên có dồn ô. Bàn lớn lên 5 × 12 với 15 loại. Sau mỗi lần ăn cặp, phần cột phía trên ô bị xóa rơi xuống, nên phía trên bàn trống ra trước. Những cặp đang bị chặn thường nối được qua khoảng trống phía trên.

### Màn 3 – Dồn trái
Bàn lớn hơn hẳn: 5 × 16 (80 ô) với 20 loại. Các ô trượt sang trái theo hàng, nên bên phải trống ra trước còn bên trái vẫn dày đặc. Có 4 phút, nhưng chỉ còn 6 giây cho mỗi cặp.

### Màn 4 – Dồn lên
Bàn 6 × 16 (96 ô) với 24 loại. Các ô dồn lên trên, ngược với màn 2. Thời gian 4:30, khoảng 5,6 giây mỗi cặp.

### Màn 5 – Dồn phải
Bàn rộng thêm thành 6 × 18 (108 ô) với 27 loại, mỗi loại vẫn đủ 4 ô. Các ô trượt sang phải, nên bên trái trống ra trước.

### Màn 6 – Dồn vào giữa (ngang)
Bàn cao thêm một hàng: 7 × 18 (126 ô) với 34 loại, trong đó 5 loại (30–34) chỉ có một cặp. Các ô dồn về đường thẳng đứng ở giữa bàn, nên mép trái và mép phải trống dần còn phần giữa luôn chật. Nên tìm trước những cặp chỉ có đúng một ô để ghép.

### Màn 7 – Dồn vào giữa (dọc)
Màn khó nhất trong các màn thiết kế sẵn: bàn lớn nhất 7 × 20 (140 ô), dùng đủ 40 loại hình, 10 loại (31–40) chỉ có một cặp, và ít thời gian cho mỗi cặp nhất. Các ô dồn về đường nằm ngang ở giữa bàn, nên hàng trên cùng và hàng dưới cùng trống ra trước còn các hàng giữa vẫn dày đặc.

## Vòng lặp vô tận

Sau màn 7, game tiếp tục vô tận với màn 8, 9, … (HUD vẫn đếm tăng dần: "Màn 8", "Màn 9", …). Từ màn 8 trở đi:

- **Bàn và số loại giữ như màn 7:** bàn 7 × 20 (140 ô) với 40 loại, trong đó loại 1–30 có 4 ô, loại 31–40 chỉ có 2 ô.
- **Kiểu dồn lặp lại theo thứ tự 7 màn:** màn 8 Cổ điển, màn 9 Dồn xuống, màn 10 Dồn trái, màn 11 Dồn lên, màn 12 Dồn phải, màn 13 Dồn vào giữa (ngang), màn 14 Dồn vào giữa (dọc), màn 15 lại Cổ điển, … (cho tới màn 42; từ màn 43 xem giai đoạn khó).
- **Thời gian tính từ màn 7 (360 giây)**, giảm 40 giây mỗi vòng 7 màn, thấp nhất 140 giây. Mọi màn trong cùng một vòng có cùng thời gian.

Cách `getLevel()` tính màn số *N* (từ 8 trở đi):

```
index           = N - 1
kiểu dồn        = LEVELS[index % 7].gravity
số vòng đã qua  = floor(index / 7)     // 1 ở vòng 2 (màn 8–14), 2 ở vòng 3 (màn 15–21), ...
thời gian       = max(140, 360 - 40 × số vòng đã qua)
```

### Thời gian mỗi vòng

| Vòng | Màn | Thời gian mỗi màn | Thời gian mỗi cặp (chưa tính thưởng) |
|---|---|---|---|
| 1 | 1–7 | theo từng màn (xem bảng tổng quan) | 7,5 → 5,1 giây |
| 2 | 8–14 | 320 giây (5:20) | 4,6 giây |
| 3 | 15–21 | 280 giây (4:40) | 4,0 giây |
| 4 | 22–28 | 240 giây (4:00) | 3,4 giây |
| 5 | 29–35 | 200 giây (3:20) | 2,9 giây |
| 6 | 36–42 | 160 giây (2:40) | 2,3 giây |
| 7 trở đi | từ 43 | 140 giây (2:20) | khoảng 2,1 giây (bàn có đá nên ít cặp hơn) |

- Màn 8 nối tiếp màn 7 mà không có bước nhảy độ khó: cùng bàn, cùng số loại, chỉ ít hơn 40 giây và đổi kiểu dồn.
- Từ **màn 43 trở đi**, mọi màn đều 140 giây. Độ khó tiếp tục tăng nhờ giai đoạn khó (xem phần dưới).
- Vẫn được +1 giây mỗi cặp, miễn là đồng hồ còn dưới mức ban đầu. Ở mức sàn 140 giây, ăn cặp đều tay ngay từ đầu cho tổng cộng tối đa khoảng 140 giây cộng số cặp (ví dụ 140 + 68 = 208 giây), tức khoảng 3 giây mỗi cặp.

## Giai đoạn khó (từ màn 43)

Từ màn 43, thời gian đã chạm mức sàn 140 giây nên không giảm được nữa. Độ khó tiếp tục tăng bằng hai thứ mới: **kiểu dồn mới** và **đá chắn đường**. Bàn vẫn 7 × 20 với 40 loại.

### Kiểu dồn mới

Mỗi vòng 7 màn dùng lần lượt các kiểu sau, rồi lặp lại (màn 50 quay về Dồn góc dưới trái):

| Màn (vòng đầu) | Kiểu dồn | Điều xảy ra sau khi xóa một cặp |
|---|---|---|
| 43 | Dồn góc dưới trái | Các ô rơi xuống, rồi trượt sang trái: dồn về góc dưới bên trái. |
| 44 | Xoay vòng | Hướng dồn đổi sau mỗi lần ăn cặp theo thứ tự ↓ ← ↑ →. Mũi tên cạnh tên kiểu dồn trên HUD cho biết hướng của lần ăn cặp tới. |
| 45 | Dồn góc trên phải | Dồn lên, rồi sang phải. |
| 46 | Dồn vào tâm | Dồn về đường nằm ngang ở giữa, rồi về đường thẳng đứng ở giữa: các ô co cụm về tâm bàn. |
| 47 | Dồn góc dưới phải | Rơi xuống, rồi sang phải. |
| 48 | Xoay vòng | Như màn 44. |
| 49 | Dồn góc trên trái | Dồn lên, rồi sang trái. |

Kiểu dồn hai hướng làm các ô di chuyển nhiều hơn sau mỗi lần ăn cặp, nên khó tính trước đường nối. Kiểu Xoay vòng thì đoán trước được nhưng phải để ý hướng thay đổi liên tục.

### Đá chắn đường

- Đá là khối xám có vết nứt. Không chọn được, không xóa được và không bao giờ di chuyển.
- Đá chặn đường nối giống như một ô hình. Khi dồn, các ô dừng lại sát đá như dừng ở mép bàn.
- Hai viên đá không bao giờ kề nhau (kể cả chéo), nên không ô nào bị đá vây kín bốn phía.
- Số đá tăng dần: 4 viên ở màn 43–49, mỗi vòng 7 màn thêm 2 viên, tối đa 10 viên từ màn 64. Đá chiếm chỗ nên bàn còn 136, 134, 132 rồi 130 ô hình. Vì vẫn 40 loại, số loại chỉ có một cặp tăng từ 12 lên 15.
- **Đá vỡ:** đá có thể làm bàn bế tắc mà đảo bàn cũng không gỡ được (thường khi chỉ còn vài ô). Khi đó từng viên đá ngẫu nhiên vỡ cho tới khi có nước đi, kèm thông báo "Hết nước đi – đá vỡ để mở đường". Nhờ vậy bàn có đá luôn chơi hết được.

## Tiến độ và chơi lại

- **Luôn bắt đầu từ màn 1.** Không có màn hình chọn màn. Nút "Chơi" ở menu luôn bắt đầu lượt chơi mới từ màn 1 với 0 điểm. Các màn sau chỉ đến được bằng cách chơi tiếp qua nút "Màn tiếp theo".
- **Hết giờ.** Nút "Chơi lại" bắt đầu lại **đúng số màn đó**, giữ nguyên vòng và thời gian đã giảm, với điểm về 0. Chơi lại từ menu tạm dừng cũng vậy.
- **Kỷ lục.** Điểm cao nhất ("Kỷ lục") được lưu với khóa `pairfect-best` khi qua màn, khi hết giờ, hoặc khi rời màn từ menu tạm dừng.

## Chỉnh sửa các màn

- Sửa mảng `LEVELS` trong `src/game/levels.ts`. Mỗi màn có `rows`, `cols`, `types`, `gravity`, `time` và tùy chọn `stones`.
- Điều kiện mỗi màn phải thỏa:
  - `rows × cols` phải là số chẵn.
  - Bàn nên rộng hơn cao (`cols > rows`), tối đa 7 × 20 để ô không quá nhỏ trên tablet.
  - `types` tối đa là 40.
  - Để mọi loại đều có 4 ô, đặt `types = rows × cols / 4`. Số loại vượt quá con số đó sẽ thành loại chỉ có một cặp.
- `npm test` kiểm tra các điều kiện này, kiểm tra quy tắc vòng lặp và giai đoạn khó, và tự chơi hết mọi màn, một vòng lặp cùng hai vòng của giai đoạn khó (`src/game/levels.test.ts`).
- Vòng lặp luôn lấy bàn, số loại và thời gian của **màn cuối cùng** trong `LEVELS`; thêm hay đổi màn cuối sẽ đổi luôn vòng lặp. Mức giảm mỗi vòng và mức sàn là hai hằng số `LOOP_TIME_STEP` (40 giây) và `LOOP_MIN_TIME` (140 giây) trong `src/game/levels.ts`.
- Giai đoạn khó chỉnh trong `src/game/levels.ts`: thứ tự kiểu dồn `HARD_GRAVITIES`, số đá `HARD_STONES_START` / `HARD_STONES_STEP` / `HARD_STONES_MAX`. Màn bắt đầu (`HARD_START`) được tính tự động là vòng đầu tiên có thời gian chạm mức sàn, nên đổi thời gian màn cuối, mức giảm hay mức sàn có thể làm màn bắt đầu thay đổi. Một màn bất kỳ trong `LEVELS` cũng có thể có đá qua trường `stones` (số chẵn).
- Để đổi số lượt gợi ý, số lượt đảo bàn cộng thêm mỗi màn (`HINTS_PER_LEVEL`, `SHUFFLES_PER_LEVEL`), điểm mỗi cặp hoặc thời gian thưởng, sửa các hằng số đầu file `src/scenes/GameScene.ts`.
