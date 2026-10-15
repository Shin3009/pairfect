# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Pairfect: Tile Connect is a tile-matching game with the same rules as Onet / Shisen-Sho. Two tiles of the same type connect when a path through empty cells has **at most 2 turns**, and that path may loop around outside the board edge. It is built with Phaser 4 + TypeScript + Vite and packaged for Android with Capacitor 8.

The game is **landscape-only** and aimed at tablets. Portrait support was removed on purpose; the last version that supported both orientations is commit `d66039d`.

The README, code comments and in-game UI strings are written in **Vietnamese**. Keep new comments and player-facing text in Vietnamese to match.

## Commands

```bash
npm run dev                                  # Vite dev server on :5173 (host: true, so it is reachable from a phone on the same LAN)
npm test                                     # vitest run (all tests)
npx vitest run src/game/Board.test.ts        # a single test file
npx vitest run -t "findPath"                 # tests whose name matches
npm run build                                # tsc (type-check only, noEmit) + vite build -> dist/
npx tsc                                      # type-check only
```

There is no linter configured.

In dev mode, `main.ts` exposes `window.game`. Use `game.scene.getScene('Game')` in DevTools to inspect the live board, score and timer.

### Android

- `build-apk.bat` (a wrapper for `build-apk.ps1`) is the one-command Windows build. It accepts `-Release`, `-Install`, `-SdkPath`, `-JdkPath`, `-KeystorePath` and `-KeyAlias`. It finds the Android SDK and a Java 21–24 JDK automatically, because Gradle 8.14 rejects newer JDKs bundled with recent Android Studio builds.
  - On the first run it does `npx cap add android`; on later runs it does `npx cap sync android`. Every run sets `android:screenOrientation="userLandscape"` in `AndroidManifest.xml`, which locks landscape (either direction) and also updates older generated projects.
  - Capacitor's activity declares `configChanges="orientation|screenSize|..."`, so size changes (split screen, flipping between the two landscape directions) resize the WebView instead of recreating the activity.
  - It writes the APK to `apk-output/Pairfect-v<package.json version>-<debug|release>.apk`.
  - The release keystore defaults to `%USERPROFILE%\.android-keystores\pairfect-release.jks`, outside the repo.
- Manual flow: `npm run android:sync` (build + `cap sync`), then `npm run android:open`.
- `android/`, `dist/` and `apk-output/` are generated and gitignored. Do not hand-edit `android/`; change `capacitor.config.ts` or the build script instead.
- `appId` in `capacitor.config.ts` is still the placeholder `com.example.pairfect`. It must change before the first real release because it is permanent on Google Play.

## Architecture

The code is split into a pure logic layer and a rendering layer:

- **`src/game/Board.ts`** holds all game rules and has no Phaser dependency, so it can be unit-tested directly.
  - Board generation guarantees every type appears an even number of times and that at least one move exists.
  - It also handles pathfinding, hint search (`findAnyMove`), shuffling, stones, and gravity / compaction after a match.
  - A `Gravity` is a list of one-direction compaction steps (`GRAVITY_STEPS`). The corner modes and `center` run two steps; `applyGravity` merges each tile's chained steps into a single `Move`.
- **Stones** (`STONE = -1` in the grid) are fixed blockers. Any grid value `<= 0` is "not a tile": stones can't be selected or matched, block paths, are never shuffled or moved, and split compaction into segments so tiles stop against them. `remaining()` / `isCleared()` count tiles only.
  - `generate` never places two stones within one cell of each other, including diagonally, so no cell can be walled in.
  - If a stuck board can't be fixed by reshuffling, `shuffle()` breaks random stones until a move exists and returns their positions. `GameScene.breakStones` animates them away.
- **Scenes** run in the order `Menu` → `Levels` (stage select, optional) → `Game`, and are registered in `main.ts`; the first in the list starts on launch. Scenes switch with `this.scene.start(key, data)`. `Game` takes `{ level, score, hints, shuffles }` (`SceneData`) and moves to the next level with `this.scene.restart(...)`.
  - Hints and shuffles carry over like score: the next level gets the unused ones plus `HINTS_PER_LEVEL` / `SHUFFLES_PER_LEVEL`. Every way of starting a fresh run (menu, stage select, retry) omits them, so the player gets the base 3.
  - When a match leaves no move, `autoShuffle` spends one of the player's Shuffles. With none left, the level is lost ("Hết nước đi!"), the same way as running out of time.
- **`src/scenes/GameScene.ts`** holds all gameplay: rendering, input, tweens, the HUD, the timer, pause, and the win/lose dialogs. Tuning constants sit at the top of the file: hints and shuffles per level, score per pair, and time bonus.
  - Pausing sets `this.time.paused` and `this.tweens.paused` and shows a dialog in the same scene. Phaser keeps both flags when a scene restarts, so `create()` clears them with `setPaused(false)`. Any new way into or out of the scene must not leave them set.
- **`src/scenes/ui.ts`** holds shared UI: the sizing helpers (`GAME_H`, `GAME_MIN_W` / `GAME_MAX_W`, `sizeFor`, `onGameResize`), the color palette `C`, `textStyle`, `Button`, and `showDialog`.
  - `showDialog` adds a full-screen interactive shade that blocks taps underneath, and returns a function that closes it.
  - It shrinks the body font until the dialog fits the 720-high screen.
- **`src/game/storage.ts`** reads and writes `localStorage`, ignoring storage errors. It stores the high score (`pairfect-best`) and the highest unlocked level index (`pairfect-unlocked`). Clearing level `i` unlocks `i + 1`, and the stage-select screen treats every index up to that value as open.
- **`src/game/levels.ts`** defines the `LEVELS` array: `rows`, `cols` (wide, short boards that grow to a maximum of 7×20), `types`, gravity mode and time for each level. After the last level, `getLevel(i)` continues endlessly:
  - The board and `types` stay those of the last level.
  - The gravity cycles through the levels' gravities in order.
  - Time starts from the last level's time and drops `LOOP_TIME_STEP` (40 s) per pass of 7, with a floor of `LOOP_MIN_TIME` (140 s).
  - From `HARD_START` (stage 43, derived as the first pass that hits the time floor), gravity follows `HARD_GRAVITIES` and stones are added, growing per pass (`HARD_STONES_*`).
  - A level's `gravity` is a `GravityMode`: a Board `Gravity`, or `'rotate'`, which changes direction each match. Always resolve it with `gravityFor(mode, matchIndex)` before calling `Board.remove`. `GameScene` counts `matches` for this and shows the next direction as an arrow in the HUD.
  - `docs/stages.md` (Vietnamese) explains every stage, the loop and the hard phase. Keep it in sync when changing levels.
- **`src/game/tileArt.ts`** draws textures procedurally under the keys `tile-1` to `tile-40` (`MAX_TYPES`) plus `stone`. Use `textureFor(gridValue)` to get the key. Textures are global, and both `MenuScene` and `GameScene` call the idempotent `createTileTextures`. To use real art, load images under the same keys in `MenuScene.preload()` and remove both calls.

### Key invariants

- **Padded grid.** `Board.grid` is `(rows + 2) × (cols + 2)`. Real tiles live at rows `1..rows` and cols `1..cols`, and `0` means empty. The empty border is what lets paths wrap around the board edge without special cases. Every `Point` (`{ r, c }`) uses these padded coordinates, including in tests and in `GameScene.sprites`, which mirrors the grid shape.
  - On screen the border ring is drawn only `RING` (0.4) of a cell wide, so tiles use nearly the full screen width.
  - Always convert between grid and screen positions with `GameScene.cellCenter` and the inverse in `onPointer`. Never use `origin + c * cell`.
- **Pathfinding.** Every path with at most 2 turns has the shape `a → p → q → b`, where the middle segment `p → q` lies on some full row or column. `findPath` tries every row and column, including the border ones, keeps the shortest clear path, and returns only its corner points.
- **Board ↔ sprite sync.** After a match, `Board.remove()` returns the `Move[]` produced by gravity. `GameScene.matchPair` uses that list to re-key `sprites` and tween each moved sprite. A shuffle never moves tiles: it only reassigns values among occupied cells, and `syncTextures` swaps the textures in place.
- **Level constraints.** `rows * cols` must be even (the `Board` constructor throws otherwise), boards should be wider than tall and at most 7×20 (beyond that, tiles get too small on a 4:3 tablet), and a level's `types` must not exceed `MAX_TYPES` (40). `levels.test.ts` checks this and auto-plays every level to a clear.
- **Game size.** The logical height is fixed at 720. The width follows the viewport aspect ratio, clamped to 1100–1600, so the canvas fills the screen width; it's scaled with `Scale.FIT`.
  - `main.ts` recomputes the size via `sizeFor` on window resize (debounced) and calls `game.scale.setGameSize` when it changes.
  - Scenes lay out X positions relative to `this.scale.width`, because the width varies. Y positions can assume 720.
  - Each scene registers `onGameResize` in `create()`. Menu and stage select simply restart.
  - The game HUD is a thin one-row top bar (`HUD_H` = 80), because height is what limits tile size. It's laid out left to right as stage, gravity, Hint, Shuffle, Pause, time bar, score.
    - Positions come from measured text widths, and the time bar fills the leftover width.
    - The score has a fixed slot (`SCORE_W`) on the right, so the bar doesn't move as the score grows.
    - The rotate-gravity arrow is a separate text object, so it can update without shifting the buttons.
    - The high score is deliberately not shown in the HUD (a leaderboard is planned); the menu still shows it.
  - `GameScene.relayout()` keeps all state. It snaps sprites to their final positions and textures, rebuilds the HUD (every HUD object goes through `keep()` into `this.hud`), and reopens the current dialog (always open dialogs through `openDialog`).
- **Portrait viewports.** These only happen in a browser, since Android is locked to landscape. `index.html` covers the game with a CSS "rotate your device" overlay (`@media (orientation: portrait)`), and the game keeps running underneath at the 1100 minimum width.
- **Relative base path.** `vite.config.ts` uses `base: './'` so the build works inside the Capacitor WebView. Keep it relative.

### Tests

`Board.test.ts` builds boards from string diagrams through `boardFrom(['12', '#.'])`, where `.` is empty, `#` is a stone, and digits are tile types. In those tests, coordinates are the padded ones, so the top-left tile is `P(1, 1)`.

Both test files auto-play full boards to a clear, under every gravity mode, with stones, and through the hard phase. Those tests use random boards, so rerun the suite a few times after changing generation, gravity or stones.
