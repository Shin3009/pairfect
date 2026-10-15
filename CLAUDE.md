# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Pairfect: Tile Connect is a tile-matching game with the same rules as Onet / Shisen-Sho. Two tiles of the same type connect when a path through empty cells has **at most 2 turns**, and that path may loop around outside the board edge. It is built with Phaser 4 + TypeScript + Vite and packaged for Android with Capacitor 8.

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
  - On the first run it does `npx cap add android` and patches `AndroidManifest.xml` to lock portrait orientation. On later runs it does `npx cap sync android`.
  - It writes the APK to `apk-output/Pairfect-v<package.json version>-<debug|release>.apk`.
  - The release keystore defaults to `%USERPROFILE%\.android-keystores\pairfect-release.jks`, outside the repo.
- Manual flow: `npm run android:sync` (build + `cap sync`), then `npm run android:open`.
- `android/`, `dist/` and `apk-output/` are generated and gitignored. Do not hand-edit `android/`; change `capacitor.config.ts` or the build script instead.
- `appId` in `capacitor.config.ts` is still the placeholder `com.example.pairfect`. It must change before the first real release because it is permanent on Google Play.

## Architecture

The code is split into a pure logic layer and a rendering layer:

- **`src/game/Board.ts`** holds all game rules and has no Phaser dependency, so it can be unit-tested directly.
  - Board generation guarantees every type appears an even number of times and that at least one move exists.
  - It also handles pathfinding, hint search (`findAnyMove`), shuffling, and gravity / compaction after a match.
- **Scenes** run in the order `Menu` → `Levels` (stage select, optional) → `Game`, and are registered in `main.ts`; the first in the list starts on launch. Scenes switch with `this.scene.start(key, data)`. `Game` takes `{ level, score }` (`SceneData`) and moves to the next level with `this.scene.restart(...)`.
- **`src/scenes/GameScene.ts`** holds all gameplay: rendering, input, tweens, the HUD, the timer, pause, and the win/lose dialogs. Tuning constants sit at the top of the file: hints and shuffles per level, score per pair, and time bonus.
  - Pausing sets `this.time.paused` and `this.tweens.paused` and shows a dialog in the same scene. Phaser keeps both flags when a scene restarts, so `create()` clears them with `setPaused(false)`. Any new way into or out of the scene must not leave them set.
- **`src/scenes/ui.ts`** holds shared UI: `GAME_W` / `GAME_H`, the color palette `C`, `textStyle`, `Button`, and `showDialog`. `showDialog` adds a full-screen interactive shade that blocks taps underneath, and returns a function that closes it.
- **`src/game/storage.ts`** reads and writes `localStorage`, ignoring storage errors. It stores the high score (`pairfect-best`) and the highest unlocked level index (`pairfect-unlocked`). Clearing level `i` unlocks `i + 1`, and the stage-select screen treats every index up to that value as open.
- **`src/game/levels.ts`** defines the `LEVELS` array: rows, cols, `types`, gravity mode and time for each level. `getLevel(i)` loops back through the levels after the last one, cutting 30 s each loop with a 90 s floor.
- **`src/game/tileArt.ts`** draws tile textures procedurally under the keys `tile-1` to `tile-40` (`MAX_TYPES`). Textures are global, and both `MenuScene` and `GameScene` call the idempotent `createTileTextures`. To use real art, load images under the same keys in `MenuScene.preload()` and remove both calls.

### Key invariants

- **Padded grid.** `Board.grid` is `(rows + 2) × (cols + 2)`. Real tiles live at rows `1..rows` and cols `1..cols`, and `0` means empty. The empty border is what lets paths wrap around the board edge without special cases. Every `Point` (`{ r, c }`) uses these padded coordinates, including in tests and in `GameScene.sprites`, which mirrors the grid shape.
- **Pathfinding.** Every path with at most 2 turns has the shape `a → p → q → b`, where the middle segment `p → q` lies on some full row or column. `findPath` tries every row and column, including the border ones, keeps the shortest clear path, and returns only its corner points.
- **Board ↔ sprite sync.** After a match, `Board.remove()` returns the `Move[]` produced by gravity. `GameScene.matchPair` uses that list to re-key `sprites` and tween each moved sprite. A shuffle never moves tiles: it only reassigns values among occupied cells, and `syncTextures` swaps the textures in place.
- **Level constraints.** `rows * cols` must be even (the `Board` constructor throws otherwise), and a level's `types` must not exceed `MAX_TYPES` (40).
- **Coordinate space.** The game renders at a fixed logical size of 720×1280 (`GAME_W` / `GAME_H`) with `Scale.FIT`. All scene layout math uses that coordinate space.
- **Relative base path.** `vite.config.ts` uses `base: './'` so the build works inside the Capacitor WebView. Keep it relative.

### Tests

`Board.test.ts` builds boards from string diagrams through `boardFrom(['12', '..'])`, where `.` is empty and digits are tile types. In those tests, coordinates are the padded ones, so the top-left tile is `P(1, 1)`. The tests also include an auto-play test that clears full boards under every gravity mode.
