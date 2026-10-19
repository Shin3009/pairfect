# Âm thanh đợt 2: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tiếng bấm nút, đếm ngược, báo hết giờ, đá vỡ, gửi đòn và nhạc menu cho cả ba bộ âm thanh.

**Architecture:** Mở rộng mô-đun `src/audio/` của đợt 1. Bảy tiếng mới và một bản nhạc menu cho mỗi bộ được thêm vào `sets.ts`. `MusicPlayer` phân biệt hai loại bản nhạc (`game` / `menu`). Luật báo giờ là một hàm thuần trong `rules.ts`. Tiếng bấm nút gắn ở một chỗ duy nhất là `tapZone`. Các scene chỉ gọi `startMusic(kind)`, `playSfx(name, step, delay)`.

**Tech Stack:** Phaser 4.2, TypeScript (strict), Vite, Vitest, Web Audio API.

**Spec:** `docs/superpowers/specs/2026-10-19-sound-extras-design.md` (đợt 2), dựa trên `docs/superpowers/specs/2026-10-19-sound-design.md` (đợt 1). Bản mẫu chuẩn: `docs/superpowers/specs/2026-10-19-sound-audition.html` (gọi tắt là **bản mẫu**).

## Global Constraints

- Tiếng và nhạc giống hệt bản mẫu (`STYLES[id].tap/count/go/warn/tick/crack/launch`, `MENU_MUSIC[id]`), giữ nguyên mọi tham số. Không đổi tiếng của đợt 1.
- Ngẫu nhiên trong âm thanh dùng `Math.random`, không bao giờ dùng rng của bàn; không sửa `Board`, `Match`, `levels`, `PROTOCOL`.
- Chú thích code và chữ cho người chơi viết bằng tiếng Việt; `CLAUDE.md` viết tiếng Anh, `README.md` tiếng Việt.
- Ngưỡng thanh giờ đỏ là `0.25` (`LOW_TIME_RATIO`), dùng chung cho cả màu thanh lẫn tiếng `warn`.
- Độ trễ của `crack` và `launch` sau tiếng chính: `0.12` giây.
- Sau mỗi task: `npm test` và `npx tsc` sạch.

## Review Focus

1. **Đổi kích thước màn hình trong lúc đếm ngược** (lúc đó `createHud` gọi lại `updateCountdown`): không được kêu lặp lại số đang hiện. Kiểm tra tay ở Task 5.
2. **Trận có kết quả ngay trong lúc đếm ngược** (đầu hàng, đối thủ rời đi): không còn tiếng `count` / `go`, không có nhạc. Kiểm tra tay ở Task 5.
3. **Tạm dừng trong 10 giây cuối:** tiếng tích dừng theo đồng hồ, Tiếp tục thì kêu tiếp mà không dồn. Có test `timeCues` "nhảy nhiều giây chỉ một tiếng" (Task 3), kiểm tra tay ở Task 5.
4. **Chuyển qua lại nhanh giữa các màn menu** (Menu → Bảng xếp hạng → Menu → Hình ô), rồi Menu → Âm thanh → Menu: nhạc menu chạy liền, đổi bản đúng lúc, không chồng hai bản. Test `MusicPlayer` "cùng bộ cùng loại không làm gì" (Task 2), kiểm tra tay ở Task 5.
5. **Nút không làm gì** (Gợi ý hết lượt, nút trong hộp thoại lúc còn `ignoreTapsMs`): không kêu. Kiểm tra tay ở Task 4.

---

### Task 1: Bảy tiếng mới và nhạc menu trong các bộ

**Files:**
- Modify: `src/audio/sets.ts`, `src/audio/sets.test.ts`
- Modify: `CLAUDE.md` (dòng 167: "see `src/audio/` below" → "above"), `docs/superpowers/specs/2026-10-19-sound-design.md` (dòng 96: tách "chơi lại màn / đấu lại" khỏi "sang màn tiếp theo", vì nhạc đã tắt lúc thua hay có kết quả, nên chơi lại / đấu lại là bắt đầu lại)
- Commit kèm: `docs/superpowers/specs/2026-10-19-sound-extras-design.md`, `docs/superpowers/specs/2026-10-19-sound-audition.html`, `docs/superpowers/plans/2026-10-19-sound-extras.md`

**Interfaces:**
- Produces (`src/audio/sets.ts`):
  - `SfxName` thêm `'tap' | 'count' | 'go' | 'warn' | 'tick' | 'crack' | 'launch'`.
  - `SFX_NAMES` theo thứ tự: `['select', 'deselect', 'match', 'wrong', 'hint', 'shuffle', 'clear', 'lose', 'tap', 'count', 'go', 'warn', 'tick', 'crack', 'launch']`.
  - `SoundSet` thêm `menuMusic: MusicDef`.
  - `sfx.tick(v, t, step)`: `step === 1` là bản gấp (`urgent` của bản mẫu), `0` là thường.
- Cách chuyển từ bản mẫu: như đợt 1 (`wave: pulse` → `type: 'pulse'`; `this.chords` / `this.bells` / `this.melody` / `this.arps` / `this.bass` thành hằng trong module; `tick(t, urgent)` → `tick(v, t, step)` với `urgent = step === 1`).

- [ ] **Step 1: Viết test hỏng** trong `sets.test.ts`:
  - `có đủ 15 tiếng`: `expect(SFX_NAMES).toEqual([... danh sách ở trên ...])`.
  - `tiếng tích gấp cũng hợp lệ`: với mọi bộ, `sfx.tick(v, T0, 1)` qua `expectValid`, không `duck`.
  - `nhạc menu đủ 8 ô nhịp và chỉ đi qua đầu ra nhạc`: như test nhạc hiện có nhưng với `SOUND_SETS[id].menuMusic`.
  - Các test sẵn có lặp qua `SFX_NAMES` tự phủ các tiếng mới (hợp lệ, chỉ `clear` / `lose` mới `duck`).

- [ ] **Step 2: Chạy test, thấy hỏng**

Run: `npx vitest run src/audio/sets.test.ts`
Expected: FAIL (`SFX_NAMES` thiếu tiếng, `menuMusic` undefined).

- [ ] **Step 3: Hiện thực** trong `sets.ts`: thêm bảy hàm vào `sfx` của mỗi bộ và `menuMusic` (chú thích ngắn như bản mẫu: sảnh chờ / hộp nhạc / màn hình tiêu đề).

- [ ] **Step 4: Chạy test, thấy qua**

Run: `npx vitest run src/audio` rồi `npx tsc`
Expected: PASS, tsc không lỗi.

- [ ] **Step 5: Sửa hai chỗ lệch trong tài liệu** (xem Files) và commit

```bash
git add src/audio/sets.ts src/audio/sets.test.ts CLAUDE.md docs/superpowers
git commit -m "Add the button, countdown, time, stone and attack sounds and the menu music to the sound sets"
```

---

### Task 2: Hai loại bản nhạc và độ trễ cho hiệu ứng

**Files:**
- Modify: `src/audio/music.ts`, `src/audio/music.test.ts`, `src/audio/sound.ts`

**Interfaces:**
- Consumes: `SoundSet.menuMusic` (Task 1).
- Produces:
  - `music.ts`: `type MusicKind = 'game' | 'menu'`; `interface Track { set: SoundSetId; kind: MusicKind }`; `MusicPlayer.play(track: Track | null)`; `MusicPlayer.current: Track | null`. Cùng `set` và cùng `kind` với bản đang phát thì không làm gì. `pump` lấy `music` hay `menuMusic` theo `kind`.
  - `sound.ts`: `startMusic(kind: MusicKind = 'game')` (scene muốn bản `kind`), `stopMusic()`, `playSfx(name: SfxName, step = 0, delay = 0)` (phát lúc `currentTime + 0.01 + delay`). Cờ "muốn có nhạc" thành `MusicKind | null`.

- [ ] **Step 1: Sửa và thêm test** trong `music.test.ts`. Các test cũ đổi sang track (`{ set: 'wood', kind: 'game' }`, ...). Thêm:
  - `cùng bộ cùng loại chỉ tạo một đầu ra`: `play(W)` hai lần với `W = { set: 'wood', kind: 'menu' }` → 1 đầu ra; `current` bằng `W` (`toEqual`).
  - `đổi loại thì tắt dần bản cũ`: `play({ set: 'wood', kind: 'menu' })` rồi `play({ set: 'wood', kind: 'game' })` → đầu ra đầu `fadeOut` 1 lần, 2 đầu ra, `current.kind` là `'game'`.
  - `bản menu phát nhạc menu`: spy `SOUND_SETS.chip.menuMusic.play`; `play({ set: 'chip', kind: 'menu' })` → spy được gọi, `SOUND_SETS.chip.music.play` (spy) không được gọi.

- [ ] **Step 2: Chạy test, thấy hỏng**

Run: `npx vitest run src/audio/music.test.ts`
Expected: FAIL (`play` còn nhận `SoundSetId`, `menuMusic` chưa được dùng).

- [ ] **Step 3: Hiện thực** `music.ts`, rồi `sound.ts` theo Interfaces. Lời gọi `startMusic()` hiện có trong `GameScene` / `SoundScene` vẫn đúng nhờ mặc định `'game'`.

- [ ] **Step 4: Chạy toàn bộ**

Run: `npm test` rồi `npx tsc`
Expected: tất cả PASS, tsc không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/audio
git commit -m "Let the music player play a set's menu track, and let sound effects start after a delay"
```

---

### Task 3: Luật báo giờ

**Files:**
- Modify: `src/audio/rules.ts`, `src/audio/rules.test.ts`

**Interfaces:**
- Produces (`src/audio/rules.ts`):
  - `const LOW_TIME_RATIO = 0.25`. Thời gian còn lại `≤` tỉ lệ này của thời gian màn thì thanh giờ đỏ và có tiếng `warn`.
  - `interface TimeCue { warn: boolean; tick: 'normal' | 'urgent' | null }`
  - `function timeCues(prev: number, left: number, total: number, warned: boolean): TimeCue`
    - `warn`: `!warned && prev > total * LOW_TIME_RATIO && left <= total * LOW_TIME_RATIO`.
    - `tick`: với `s = ceil(left)`, có tiếng khi `s < ceil(prev)` và `1 <= s <= 10`; `'urgent'` khi `s <= 3`, ngoài ra `'normal'`.

- [ ] **Step 1: Viết test hỏng** (`describe('báo giờ')`, `total = 240`, ngưỡng 60):
  - `timeCues(60.05, 59.95, 240, false).warn` là `true`; `timeCues(60.05, 60, 240, false).warn` là `true`; `timeCues(59, 58.9, 240, false).warn` là `false`; `timeCues(60.05, 59.95, 240, true).warn` là `false`.
  - `timeCues(10.05, 9.95, 240, true).tick` là `'normal'`; `(3.05, 2.95)` là `'urgent'`; `(11.05, 10.95)` là `null`; `(0.05, -0.05)` là `null`; `(9.5, 9.4)` là `null`.
  - Thưởng giờ: `(5.2, 6.2)` là `null`, rồi `(6.05, 5.95)` là `'normal'`.
  - Nhảy nhiều giây (máy bận): `(9.05, 6.95)` là `'normal'` (một tiếng, không ba).

- [ ] **Step 2: Chạy test, thấy hỏng**

Run: `npx vitest run src/audio/rules.test.ts`
Expected: FAIL (`timeCues` không được export).

- [ ] **Step 3: Hiện thực** theo Interfaces.

- [ ] **Step 4: Chạy test, thấy qua**

Run: `npx vitest run src/audio` rồi `npx tsc`
Expected: PASS, tsc không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/audio/rules.ts src/audio/rules.test.ts
git commit -m "Add the rule for the low-time warning and the last-ten-seconds ticks"
```

---

### Task 4: Tiếng bấm nút

**Files:**
- Modify: `src/scenes/ui.ts`, `src/scenes/GameScene.ts` (nút Gợi ý / Đảo bàn), `src/scenes/SoundScene.ts`
- Modify: `CLAUDE.md` (mục `ui.ts` / `tapZone`, mục SoundScene), `README.md` nếu nhắc tới

**Interfaces:**
- Consumes: `playSfx` (Task 2).
- Produces (`src/scenes/ui.ts`):
  - `tapZone(scene, x, y, w, h, depth, onTap: () => boolean | void, sound = true)`: gọi `onTap()` trước. Sau đó, nếu `sound` là `true` và `onTap()` không trả về `false`, thì phát `playSfx('tap')`. Phát **sau** `onTap`, để các nút tắt / bật tiếng phát theo cài đặt mới.
  - `Button`: `onClick: () => boolean | void`, chuyển thẳng cho `tapZone`. Trong `showDialog`, lời gọi `() => Date.now() >= armedAt && a.onClick()` đã trả về `false` khi lần chạm bị bỏ qua.
  - `IconButton(scene, x, y, size, icon, onClick, depth = 1, sound = true)`: nút đang khóa trả về `false` (`() => this.enabled && onClick()`).

- [ ] **Step 1: Sửa `ui.ts`** theo Interfaces.

- [ ] **Step 2: Bỏ tiếng bấm ở nút có tiếng riêng.**
  - `GameScene.createHud`: Gợi ý và Đảo bàn tạo với `depth 1, sound false`.
  - `SoundScene`: thẻ chọn bộ dùng `tapZone(..., () => this.choose(id), false)`.
  - `SoundScene.flip`: bỏ `playSfx('select')`, vì `tapZone` đã phát `tap` sau khi đổi.
  - Nút loa giữ mặc định (`tap` phát sau `toggleMute`).

- [ ] **Step 3: Chạy toàn bộ**

Run: `npm test` rồi `npx tsc`
Expected: tất cả PASS, tsc không lỗi.

- [ ] **Step 4: Kiểm tra tay** (`npm run dev`, DevTools hook `SOUND_SETS[set].sfx.tap` qua `import('/src/audio/sets.ts')` để ghi lại):
  - Có `tap`: nút menu, thẻ tên / Âm thanh / Hình ô, tab bảng xếp hạng, Quay lại, nút trong hộp thoại, II, thẻ hình ô, Ghi công, nút sảnh online.
  - Không có `tap`: Gợi ý / Đảo bàn (chỉ tiếng riêng), Gợi ý khi hết lượt (im hẳn), thẻ bộ ở màn Âm thanh (chỉ mẫu), nút trong hộp kết quả online lúc vừa hiện (`ignoreTapsMs`) (Review Focus 5).
  - Nút loa: tắt thì im, bật lại thì một `tap`. Công tắc Hiệu ứng tương tự.

- [ ] **Step 5: Cập nhật tài liệu** (`CLAUDE.md`):
  - `tapZone` phát `tap` sau `onTap`, trừ khi `sound` là `false` hoặc `onTap` trả về `false`;
  - `IconButton` khóa và `ignoreTapsMs` không kêu;
  - Gợi ý / Đảo bàn / thẻ bộ âm thanh tắt tiếng bấm.

- [ ] **Step 6: Commit**

```bash
git add src/scenes CLAUDE.md README.md
git commit -m "Play a tap sound on every button that does something"
```

---

### Task 5: Nhạc menu, đếm ngược, báo giờ, đá vỡ, gửi đòn

**Files:**
- Modify: `src/scenes/GameScene.ts`, `src/scenes/MenuScene.ts`, `src/scenes/LeaderboardScene.ts`, `src/scenes/TileArtScene.ts`, `src/scenes/PvpLobbyScene.ts`, `src/scenes/SoundScene.ts`
- Modify: `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: `startMusic(kind)`, `stopMusic`, `playSfx(name, step, delay)` (Task 2); `timeCues`, `LOW_TIME_RATIO` (Task 3).

Nhạc theo màn:

| Chỗ | Lời gọi |
|---|---|
| `MenuScene.create` | `startMusic('menu')` (thay `stopMusic()`) |
| `LeaderboardScene.create`, `TileArtScene.create`, `PvpLobbyScene.create` | `startMusic('menu')` |
| `SoundScene.create` | `startMusic('game')` |
| `GameScene.create`, đấu online | `stopMusic()` (im trong lúc đếm ngược) |
| `GameScene.create`, một mình | `startMusic('game')` (như hiện tại) |

Tiếng trong `GameScene`:

| Chỗ | Lời gọi |
|---|---|
| `updateCountdown`: số hiện ra khác `lastCount`, và `!match.outcome` | `playSfx('count')`, rồi lưu `lastCount` (`init` đặt `null`) |
| `tickPvp`: lúc `started` vừa thành `true`, và `!m.outcome` | `playSfx('go')`, rồi `startMusic('game')` |
| `tick` (một mình, sau khi trừ giờ) và `tickPvp` (sau khi đã `started`, chưa `ended`, chưa có kết quả) | `timeCues(prev, timeLeft, cfg.time, warned)`: `warn` → `warned = true`, `playSfx('warn')`; `tick` → `playSfx('tick', urgent ? 1 : 0)` |
| `create` (một mình, sau `restore`) | `warned = timeLeft <= cfg.time * LOW_TIME_RATIO` (vào màn đã dưới ngưỡng thì không báo); đấu online thì `false` |
| `drawTimeBar` | dùng `LOW_TIME_RATIO` thay cho `0.25` |
| `shuffleBoard`, sau `playSfx('shuffle')`, nếu `broken.length > 0` | `playSfx('crack', 0, 0.12)` |
| `showHit`, `case 'shuffle'`, nếu `e.broken.length > 0` | `playSfx('crack', 0, 0.12)` |
| `matchPair`, đấu online, sau `playSfx('match', …)`, nếu `played.attack` khác null | `playSfx('launch', 0, 0.12)` |

- [ ] **Step 1: Trường mới** `lastCount: number | null`, `warned: boolean`; đặt lại trong `init`.

- [ ] **Step 2: Gắn các lời gọi** theo hai bảng.

- [ ] **Step 3: Chạy toàn bộ**

Run: `npm test` rồi `npx tsc`
Expected: tất cả PASS, tsc không lỗi.

- [ ] **Step 4: Kiểm tra tay trên trình duyệt** (hook `sfx` và `MusicPlayer.prototype.play` như đợt 1):
  - Menu → Bảng xếp hạng → Menu → Hình ô → Menu: nhạc menu chỉ bắt đầu một lần. Menu → Âm thanh: đổi sang nhạc trong màn. Quay lại: về nhạc menu (Review Focus 4).
  - Vào màn chơi: đổi sang nhạc trong màn. Thua → Về menu: nhạc menu.
  - Đặt `timeLeft` (DevTools) ngay trên ngưỡng đỏ → một `warn`. Đặt `timeLeft = 12` → các tiếng `tick` từ 10, gấp ở 3-2-1. Tạm dừng giữa chừng → không kêu; Tiếp tục → kêu tiếp, không dồn (Review Focus 3).
  - Đá vỡ: gọi `shuffleBoard(false)` trên một bàn có đá (màn ≥ 43, hoặc đặt đá vào `board.grid` rồi `syncTextures`) → `shuffle` rồi `crack`.
  - `pvpBot(800)`: im trong lúc đếm ngược; `count` cho mỗi số; `go` và nhạc lúc "Bắt đầu!". Đổi kích thước cửa sổ khi đang đếm → không kêu lặp (Review Focus 1). Ăn chuỗi đủ 3 cặp trong 2 giây → `match` rồi `launch`. Đầu hàng khi đang đếm → không `count` / `go`, không nhạc (Review Focus 2).

- [ ] **Step 4b: Kiểm tra trên tablet Android** (chủ dự án làm, vì cần máy thật): nhạc menu sau lần chạm đầu; tiếng bấm nút; đếm ngược; mức to nhỏ trên loa máy.

- [ ] **Step 5: Cập nhật tài liệu** (`CLAUDE.md`, `README.md`):
  - nhạc menu ở các màn menu, nhạc trong màn ở Âm thanh và màn chơi, im trong lúc đếm ngược;
  - `count` / `go`, `warn` / `tick` (`timeCues`, `LOW_TIME_RATIO`), `crack`, `launch`.

- [ ] **Step 6: Commit**

```bash
git add src/scenes CLAUDE.md README.md
git commit -m "Play menu music, countdown beeps, low-time ticks, stone cracks and attack launches"
```
