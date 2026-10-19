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
npm run icons                                # re-render the app icon and favicons from resources/icon/*.svg
```

There is no linter configured.

In dev mode, `main.ts` exposes `window.game`. Use `game.scene.getScene('Game')` in DevTools to inspect the live board, score and timer. It also exposes `pvpBot(stepMs?)`, which starts an online match against a local bot with no network or Firebase (`src/pvp/bot.ts`), and `sound` (`playSfx`, `playHit`, `startMusic`, `stopMusic`, `updateSoundSettings`) for listening to the sound sets; tap the game once first to unlock audio. `?relay` in the page URL forces WebRTC through TURN.

Firebase config is read at build time from `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_PROJECT_ID` in `.env.local` (gitignored; template in `.env.example`, typed in `src/vite-env.d.ts`). Without them the game runs normally and simply doesn't upload scores. The Firebase project also needs the Anonymous sign-in provider enabled. `firestore.rules` is the matching Firestore security-rules file; it's pasted into the Firebase Console, not deployed by any script.

Online PvP additionally needs `VITE_FIREBASE_DATABASE_URL` (a Realtime Database, used as the lobby; `database.rules.json` is its rules file, also pasted by hand). Without it the menu has no "Đấu online" button. `VITE_METERED_DOMAIN` and `VITE_METERED_API_KEY` configure the Metered TURN server; without them WebRTC uses STUN only. The API key is a per-credential key that Metered intends for client code, not the account's Secret Key.

### Web (Cloudflare Pages)

`dist/` is a static site, so the same build is also hosted on the web (Cloudflare Pages: build command `npm run build`, output `dist`, the `VITE_*` variables set as build-time environment variables). Every `VITE_*` value ends up in the public bundle, so never give a real secret that prefix.

- `public/_headers` (copied into `dist/` by Vite) sets the security headers on Pages. Its Content-Security-Policy is still `-Report-Only`, to be switched to enforcing once the leaderboard and PvP (including over TURN) log no `[Report Only]` violations. Adding a new external origin (another Firebase service, a CDN) means adding it to the CSP. `npx wrangler pages dev dist` serves the build with these headers applied.
- **`docs/security.md`** (Vietnamese) is the security review of the web build: what was fixed, the manual steps after a rules change, and the remaining issues (fake scores, quota abuse, App Check, room cleanup, TURN credentials). Update it when one of those is addressed.

### Android

- `build-apk.bat` (a wrapper for `build-apk.ps1`) is the one-command Windows build. It accepts `-Release`, `-Install`, `-SdkPath`, `-JdkPath`, `-KeystorePath` and `-KeyAlias`. It finds the Android SDK and a Java 21–24 JDK automatically, because Gradle 8.14 rejects newer JDKs bundled with recent Android Studio builds.
  - On the first run it does `npx cap add android`; on later runs it does `npx cap sync android`. Every run sets `android:screenOrientation="userLandscape"` in `AndroidManifest.xml`, which locks landscape (either direction) and also updates older generated projects.
  - It also sets `android:appCategory="game"` on `<application>`. Android 16 ignores `screenOrientation` (and `setRequestedOrientation`) on displays with smallest width >= 600dp, such as the Galaxy Tab A11, for apps targeting API 36 (Capacitor 8's `targetSdkVersion`). Games are exempt. Don't swap it for the `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` opt-out, which stops working at API 37.
  - Every run also rewrites `MainActivity.java` (keeping its `package` line) so the system bars stay hidden in immersive mode: a swipe from the edge shows them only briefly over the game, and they are hidden again whenever the window regains focus. `SystemBars.hidden: true` in `capacitor.config.ts` hides them at startup; keep it, or the SystemBars plugin shows the bars again on load.
  - Capacitor's activity declares `configChanges="orientation|screenSize|..."`, so size changes (split screen, flipping between the two landscape directions) resize the WebView instead of recreating the activity.
  - Every run also copies `resources/android/res/` over `android/app/src/main/res/`, replacing Capacitor's default launcher icon (see "App icon" below).
  - Every run also copies the `version` from `package.json` into `android/app/build.gradle`. `versionName` becomes that version, and `versionCode` becomes `X*10000 + Y*100 + Z`, which must keep increasing for Google Play. The script fails unless the version is plain `X.Y.Z` with Y and Z below 100. Bump it with `npm version X.Y.Z --no-git-tag-version`, which updates `package.json` and `package-lock.json`.
  - It writes the APK to `apk-output/Pairfect-v<package.json version>-<debug|release>.apk`.
  - The release keystore defaults to `%USERPROFILE%\.android-keystores\pairfect-release.jks`, outside the repo.
- Manual flow: `npm run android:sync` (build + `cap sync`), then `npm run android:open`. This skips the script's steps, including the icon copy.
- **App icon.** The source is two SVG layers on the 108dp adaptive-icon canvas: `resources/icon/background.svg` (the game's teal, as a gradient) and `resources/icon/foreground.svg` (a 3×3 corner of a board, with a selected apple pair joined by a 2-turn path). Both use `viewBox="-25 -25 150 150"`, so the area a launcher shows is `0..100`. Keep the artwork inside a circle of radius ~46 around (50, 50), because launchers mask the icon to a circle, squircle or teardrop.
  - `npm run icons` (`scripts/icons.mjs`, rendered with the `@resvg/resvg-js` devDependency) writes everything derived from them, and the outputs are committed:
    - `resources/android/res/`: per-density mipmaps (`ic_launcher_background` / `_foreground` for the adaptive icon, plus pre-masked `ic_launcher` / `ic_launcher_round` for Android 7) and `mipmap-anydpi-v26/ic_launcher*.xml`.
    - `resources/play-store-icon.png` (512×512) for the Play Console.
    - `public/favicon.svg`, `public/favicon.ico` (16/32/48) and `public/apple-touch-icon.png` (180, opaque) for the web build. `index.html` links them with root-absolute paths, which Vite rewrites to `./` because of `base: './'`.
  - Rerun it after editing either SVG; nothing regenerates the outputs automatically.
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
  - `dropStone()` (the PvP stone attack) adds one stone to a random empty cell, keeping the same no-neighbour rule, or returns `null` when no cell qualifies.
- **Scenes** run in the order `Menu` → `Game` (plus `Menu` → `Leaderboard`, `Menu` → `TileArt` and `Menu` → `PvpLobby` → `Game`, each with a way back), and are registered in `main.ts`; the first in the list starts on launch. There is deliberately no stage select: every run starts at stage 1 (the old `LevelSelectScene` and its `pairfect-unlocked` progress were removed). Scenes switch with `this.scene.start(key, data)`. `Game` takes `SceneData` = `Partial<SavedGame> & { pvp?: PvpSession }`: the stage entry `{ level, score, hints, shuffles, retries }`, plus `play` when resuming a saved stage, or `pvp` for an online match (see `src/pvp/` below). It moves to the next level with `this.scene.restart(...)`.
  - Hints and shuffles carry over like score: the next level gets the unused ones plus `HINTS_PER_LEVEL` / `SHUFFLES_PER_LEVEL`. The only way to start a fresh run is the menu ("Chơi" / "Chơi mới"), which omits them, so the player gets the base 3.
  - When a match leaves no move, `autoShuffle` spends one of the player's Shuffles. With none left, the level is lost ("Hết nước đi!"), the same way as running out of time.
  - A run has `RETRIES_PER_RUN` (3) retries in total, carried to the next level like hints. Both the lose dialog's "Chơi lại" and the pause menu's "Chơi lại màn" spend one through `retryLevel()`, which restarts the scene with the data it was entered with (`entry`). So the stage replays with the score, hints and shuffles the player had on entering it. Points earned in the failed attempt are dropped, which also keeps the score under the `firestore.rules` cap. Both dialogs show the count (`retriesText()`) and hide the retry button once none are left, so the lose dialog then only offers "Về menu".
- **Saved run.** The current run is always saved (`saveGame`, key `pairfect-saved-game`), so the menu can offer "Tiếp tục – Màn N" and the run survives the app being killed. `SavedGame` is the stage entry plus an optional `play` (the board grid, score, hints, shuffles, time left, `matches`, and `lost` while the lose dialog is open).
  - `GameScene.saveProgress` runs on entering a stage, every `AUTOSAVE_MS` (1 s), on pause (which is also every trip to the background, so swiping the app away from recents is covered), on a loss (with `lost`), and on the pause menu's "Lưu và về menu". The autosave skips once `ended` is set, so it can't overwrite the win or loss save.
  - A win saves the next stage's entry with no `play` before showing its dialog, so the win dialog's "Màn tiếp theo" and "Lưu và về menu" both continue the run.
  - Resuming: `create()` loads `play.grid` with `Board.load` (which checks the shape, border, values and even type counts) instead of generating. If it doesn't fit the stage (levels changed in an update), the stage starts fresh from its entry. A save with `lost` reopens the lose dialog. Otherwise `checkBoard()` runs, in case the save landed just after a clear or a dead end.
  - `finishRun` (lose dialog → menu) is the only place a run ends: it clears the save and records the run. "Chơi mới" in the menu asks first when a save exists, since the new run overwrites it unrecorded.
  - The stored value is `{ savedAt, game }`, where `game: null` marks a finished run, not a deleted key. On Android, `native.initSaveBackup` keeps a second copy of every write in SharedPreferences (`@capacitor/preferences`), because the WebView can hold `localStorage` writes in memory for a few seconds before they reach disk. `main.ts` awaits it (top-level `await`) before creating the game: `restoreSavedGame` keeps whichever copy has the later `savedAt` in both places. The `game: null` marker is why a stale copy can't bring back a run that was already recorded. After that, `setSavedGameMirror` forwards every write to the backup.
- **`src/scenes/GameScene.ts`** holds all gameplay: rendering, input, tweens, the HUD, the timer, pause, and the win/lose dialogs. Tuning constants sit at the top of the file: hints and shuffles per level, and seconds added per match.
  - Points live in **`src/game/scoring.ts`** (`SCORE_PER_PAIR`, `POINTS_PER_SECOND_LEFT`), because `firestore.rules` caps a score at `stage * MAX_SCORE_PER_STAGE` (1700). `scoring.test.ts` checks that no level, including the loop and hard phase, can exceed `maxStageScore`, and that the rules use the same number. If a scoring or level change breaks that test, raise the cap in both `scoring.ts` and `firestore.rules`. The rules also cap `stage` at `MAX_ONLINE_STAGE` (999), checked by the same test; never lower it to a stage a real player could pass, or their best could never upload again.
  - Pausing sets `this.time.paused` and `this.tweens.paused` and shows a dialog in the same scene. Phaser keeps both flags when a scene restarts, so `create()` clears them with `setPaused(false)`. Any new way into or out of the scene must not leave them set.
  - The game also pauses (and so saves) itself when the app goes to the background (see `native.ts` below).
  - **PvP mode** (`this.match` set) reuses the same board code with these differences:
    - `this.board` is `match.me.board`, and every change to it goes through `match.play` / `match.shuffle` so it is sent to the opponent. Never call `Board.remove` / `shuffle` directly in PvP.
    - Incoming attacks change the board inside `Match`, and `match.onHit` → `showHit` redraws them. A stone drops a new stone sprite, a tilt goes through `moveSprites` (shared with `matchPair`), fog draws `drawFog` over the board until `fogUntil` (redrawn on relayout, removed when the result arrives), and a shuffle uses `syncTextures` / `breakStones`. `showHit` then runs `checkBoard`, since an attack can leave no move.
    - Every `moveSprites` tween uses the same delay and duration, so a sprite moved twice in a row ends at the last target.
    - `showCombo` toasts "Chuỗi N!" and the attack that was sent.
    - Tiles appear only when the synced countdown ends (`tickPvp`). The timer is derived from the match clock, with no time bonus.
    - There is no score, saving, pause or retry. `saveProgress` returns early, so a match never touches the saved solo run.
    - The II button and Back ask "Đầu hàng?", and the clock keeps running while that dialog is open. Going to the background doesn't pause either.
    - Auto-shuffle on a dead end is free. The HUD swaps the stage and score for pairs left and the opponent's name, pair count and mini-board (drawn from the shadow board).
    - `locked()` replaces `ended` as the input guard.
    - `showResult` (re)opens the result dialog with "Đấu lại" / "Về menu". It uses `ignoreTapsMs` because the result can arrive mid-tap.
    - A rematch restarts the scene with the same session.
- **`src/native.ts`** bridges the Android app (Capacitor `@capacitor/app`, plus `@capacitor/preferences` for the saved-run backup described above) to Phaser. `bindAppEvents` (called once in `main.ts`) re-emits the Back button and "app went to the background" as events on `game.events`; the background one also fires on Phaser's `HIDDEN` (page hidden), so it works in a browser tab too. Scenes subscribe with `onBack` / `onSuspend`, which unsubscribe on scene shutdown.
  - Registering a `backButton` listener disables Capacitor's default Back (leaving the app), so every scene must handle Back itself.
  - Back is routed per scene: with a dialog open it calls that dialog's `DialogOptions.back` (no `back` means Back does nothing, used for the win dialog so a stray press doesn't leave the stage). With no dialog, `Game` pauses (asks to surrender in PvP), `Leaderboard` and `TileArt` return to `Menu`, `PvpLobby` cancels the current step (or returns to `Menu` from its first screen), and `Menu` asks "Thoát game?" before `exitApp()`. `Game` and `Menu` track the open dialog as `{ opts, close }` for this. `Menu` asks `nameDialogBack()` first, so Back cancels a rename and does nothing on the required first-run name prompt.
- **`src/scenes/nameDialog.ts`** is the player-name prompt. It is plain HTML (`#name-dialog` in `index.html`), not Phaser, so the system keyboard can type Vietnamese. `askPlayerName(current)` is a singleton that resolves to the saved, cleaned name, or to `null` on cancel. With `current = null` it is the required first-run prompt, which `MenuScene.create` opens when `loadPlayerName()` is null; with a name it is a cancellable rename, opened from the name chip in the menu's top-left corner. After either, the menu calls `syncBest()` so the online row picks up the name. `askRoomCode()` reuses the same form for the PvP room code (uppercase, validated by `cleanCode`); a prompt of the other kind already open makes the call resolve to `null`.
  - It lives outside the scenes on purpose: the soft keyboard can resize the game, which restarts the menu, and the dialog must survive that.
  - Phaser hit-tests window-level touches even when they land outside the canvas, so the dialog stops propagation of touch, mouse and key events; otherwise a tap on it would also press the menu button underneath.
  - Its CSS sizes everything in `--u` (one logical game pixel, `min(100vh / 720, 100vw / 1100)`) so it matches `showDialog`. It sits in the top half of the screen because a landscape soft keyboard covers the bottom.
- **`src/online.ts`** keeps one Firestore row per player, `highscores/<uid>` = `{ name, score, stage, updatedAt }`, in sync with the device's best. `firebase/app`, `firebase/auth` and `firebase/firestore/lite` are loaded with dynamic imports on the first send (or the first leaderboard read), so they stay out of the main bundle.
  - `uid` comes from Firebase Anonymous Auth. `initializeAuth` is used with IndexedDB persistence rather than `getAuth()`, which also loads the popup/redirect resolver. The session survives restarts, so the player keeps the same row.
  - `syncBest()` compares the wanted row (current name plus `loadLeaderboard()[0]`, if its score is above 0) with the last successful upload (`loadSyncedBest()`), and uploads only when they differ. It runs at launch and on the window `online` event (`initOnline` in `main.ts`), after every recorded run (`GameScene.finishRun`), and after the name is set or changed.
  - On any error (offline, auth or rules) it logs a warning and leaves the synced marker unchanged, so the next trigger retries. Re-uploading is idempotent.
  - Every actual upload attempt is reported to `onSyncResult` listeners as a `SyncResult`: `{ ok: false, best }`, or `{ ok: true, best, previous }`, where `previous` is the marker before this upload. A call that has nothing new to send reports nothing.
    - `main.ts` turns each result into a toast: "Đã gửi kỷ lục N điểm…", "Đã đổi tên…" (when only the name changed), or an error.
    - `online.ts` itself stays DOM-free so it can be tested in Node.
- **`src/pvp/`** is online PvP: a 1v1 race on the same board, where the first to clear wins and at time-up (`PVP_TIME`, 240 s) fewer pairs left wins. Players meet through a room code, connect over WebRTC, and relay through TURN when a direct path fails.
  - **Same board, no board on the wire.** Both sides build `Board`s with `seededRng(seed)` (`src/game/rng.ts`, mulberry32). Each device keeps its own board plus a shadow of the opponent's (`Match.me` / `Match.opp`, both `Side`s) and sends only numbered events (`match a b`, `shuffle auto|manual`). The receiver replays each event on the shadow through the same `Side` code.
    - An event that fails to replay (no path, wrong sequence number, auto-shuffle while a move exists, too many manual shuffles) ends the match as `cheat`.
    - This only works if every random choice on a board goes through the board's `rng`, and both devices run identical `Board` / `levels` / match rules. Bump `PROTOCOL` (`protocol.ts`) on any such change; rooms and `hello` reject a mismatch.
  - **Combo attacks** (`attacks.ts`) are derived from the event stream, never sent as separate messages.
    - `Side.match(a, b, t)` tracks the chain: a match within `COMBO_MS` (2 s) of the previous one extends it. Every `COMBO_STEP` (3rd) pair of a chain earns `attackFor(combo)`: stone → tilt → fog → shuffle, then repeating.
    - The victim computes the same attack when it replays the attacker's `match` event on its shadow. It applies the attack to its own board at once (`Match.takeHit` → `Side.hit` → `applyAttack`) and records it as its own `hit` event, so the attacker's shadow of the victim applies the same attack at the same point. All randomness (`Board.dropStone`, `Board.shuffle`) goes through the victim board's rng. The tilt direction cycles by hit count and skips the match's gravity.
    - The attacker keeps the attacks it earned (`Match.attacks`) and requires the victim's `hit` events to match them in order (no free shuffles).
    - An attack that arrives after the victim cleared or ran out of time is dropped, and no `hit` event is sent. The attacker's final clearing pair never hits.
  - **`match.ts`** is pure and tested. Event times are ms since the synced start. The host decides the result: both cleared → earlier wins; only the guest cleared → guest wins at once; only the host cleared → host wins after `GRACE_MS`; time up → after `GRACE_MS`, compare pairs left. It then sends `result`. The guest decides by itself only if no result arrives `RESULT_TIMEOUT_MS` later. Events later than `time + LATE_MS` are ignored.
  - **`session.ts`** (`PvpSession`) lives across scenes and rematches.
    - Both sides ping every second, which doubles as clock sync (`ClockSync`, lowest-RTT sample). Silence for `TIMEOUT_MS` (10 s) means the opponent left.
    - The guest says `hello` only after 3 clock samples. The host then sends `start { seed, at }` in host time, and the guest converts it to its own clock.
    - A rematch starts once both sides have sent `rematch`.
    - `attach(link)` takes any `PeerLink`, which is how tests and the dev bot use the in-memory `linkPair` (`loopback.ts`).
  - **`peer.ts`** wraps `RTCPeerConnection` with one negotiated, ordered data channel.
    - Signaling is non-trickle: it waits for ICE gathering to finish (3 s cap), then sends one SDP. Each description carries a round number `n`.
    - On `disconnected` / `failed` the host sends an ICE-restart offer with `n + 1`, and the guest answers any newer `n`.
    - `relayed()` reads `getStats` to tell whether the selected pair uses a TURN candidate.
  - **`signaling.ts`** is the lobby on Realtime Database: `pvpRooms/<code>` = `{ host, hostName, protocol, createdAt, guest?: { uid, name }, offer?, answer? }`.
    - The host's room is removed by `onDisconnect`, and the guest entry likewise. `leave()` calls `goOffline`, because the free plan limits concurrent connections.
    - It reuses `online.firebaseApp()` for anonymous auth. `firebase/database` is loaded with a dynamic import.
    - `database.rules.json` lets only the host write the room (and create it only if the code is free). The guest can only claim an empty `guest` slot, remove itself, and write `answer`. `createdAt` must equal the server time (`now`).
    - Reads are split per field because `offer` / `answer` carry the players' IP addresses: any signed-in user can read `hostName`, `protocol` and `guest`, but only the host and the current guest can read `offer` / `answer`, and nobody can read a whole room. So `joinRoom` reads those three fields one by one, never the room. Builds up to 0.2.0 read the whole room and so can't join under these rules.
  - **`turn.ts`** fetches `iceServers` from `https://<VITE_METERED_DOMAIN>/api/v1/turn/credentials?apiKey=…` (cached 10 min) and falls back to Google STUN on any error.
  - Room codes use `CODE_ALPHABET` (no I, O, 0, 1). The rules' `$code` regex must match it.
- **`src/audio/`** is sound: three selectable sets (`wood` "Gỗ & chuông", `bubble` "Bong bóng", `chip` "8-bit"), each with sound effects, attack sounds for PvP, and a looping background track. Everything is synthesized with Web Audio; there are no audio files.
  - The approved prototype `docs/superpowers/specs/2026-10-19-sound-audition.html` is the reference for every sound: `sets.ts` copies its numbers exactly. The design is `docs/superpowers/specs/2026-10-19-sound-design.md`.
  - `sets.ts` (data), `voices.ts` (instrument helpers), `rules.ts` (combo pitch, mute toggle) and `music.ts` (`MusicPlayer`) are pure and written against the `Voices` interface, so they are tested in Node with `src/test/fakeVoices.ts`. `synth.ts` implements `Voices` with Web Audio on Phaser's own `AudioContext`, so Phaser's first-tap unlock covers it.
  - `MusicPlayer` schedules 16th notes `LOOKAHEAD` (0.15 s) ahead, pumped every 40 ms. Playing the set that is already playing does nothing, so the music never restarts or doubles. A late pump (the page was hidden) skips the missed part instead of playing it in a burst.
  - `sound.ts` is the controller the scenes call. It lives outside the scenes (like `toast.ts`), so the music carries on through `scene.restart`. Music plays only while a scene wants it (`startMusic` / `stopMusic`) **and** the `music` setting is on. `playSfx` / `playHit` drop the sound while `sfx` is off or the context isn't `running` (still locked, or the page hidden), so nothing piles up and plays at once later.
  - On `HIDDEN` the controller suspends the context and on `VISIBLE` resumes it. Phaser's own `pauseOnBlur` is turned off so split screen doesn't mute the game; note that Phaser's sound manager resumes a suspended context on every frame while the window has focus, so the suspend only holds while the page is really hidden, which is what we want.
  - Sounds use `Math.random` for pitch jitter and shuffle ticks, **never** the board's rng: touching `Board.rng` would desync PvP boards.
- **`src/toast.ts`** shows `showToast(text, 'ok' | 'error')`, a small HTML pill (`#toast` in `index.html`) centered at the top of the screen.
  - It is HTML rather than Phaser so it shows over any scene and survives scene restarts.
  - It has `pointer-events: none`, so taps go through to the game, and a new toast replaces the current one.
  - It is sized in `--u`, like the name dialog. It needs `width: max-content`, because with `left: 50%` a fixed element otherwise shrinks to the right half of the screen and wraps early.
  - While a sync is running, further calls return at once; when the upload finishes, the loop rechecks and sends anything newer.
  - `fetchOnlineBoard(size)` reads the online leaderboard: it runs `syncBest()` first (so a pending best shows up), then fetches the top `size` rows. It orders only by `score`, because adding `stage` would need a composite index; ties are re-sorted on the client with `compareEntries`. Other players' names go through `cleanName`, and malformed rows are dropped.
    - It finds the player's own row only through an existing auth session; it never signs in just to read. If the player is outside the top, their rank is `getCount(score > theirs) + 1`, but never above `size + 1`.
    - It rejects after `LOAD_TIMEOUT_MS` (15 s). `onlineEnabled()` says whether the build has a Firebase config at all.
  - `firestore.rules` makes the collection world-readable. Only the owner (`request.auth.uid == uid`) can write their row; on update the score may not decrease; there are no deletes. Writes must have exactly those fields, an int `stage` in `[1, 999]`, an int `score` in `(0, stage * 1700]`, and `updatedAt == request.time`. An update must come more than 2 s after the row's last `updatedAt`, which the game only hits if the name changes while an upload is in flight (the next sync retries). The rules are checked against the Firestore and Realtime Database emulators by hand (`@firebase/rules-unit-testing`), not by `npm test`.
- **`src/scenes/ui.ts`** holds shared UI: the sizing helpers (`GAME_H`, `GAME_MIN_W` / `GAME_MAX_W`, `sizeFor`, `onGameResize`), the color palette `C`, `textStyle`, `Button`, `IconButton`, and `showDialog`.
  - **`src/scenes/icons.ts`** draws button icons with the Canvas 2D API on a 24×24 grid, in white, under the keys `icon-<name>`. `iconTexture(scene, name)` creates a texture on first use, and `IconButton` tints it.
  - `showDialog` adds a full-screen interactive shade that blocks taps underneath, and returns a function that closes it.
  - It shrinks the body font (down to 14px) until the dialog fits the 720-high screen. `bodyAlign: 'left'` left-aligns long lists such as the tile set credits.
- **`src/game/storage.ts`** reads and writes `localStorage`, ignoring storage errors. It stores six keys:
  - the leaderboard (`pairfect-leaderboard`);
  - the player name (`pairfect-player-name`, a plain string), which always goes through `cleanName` (NFC, control and bidi characters removed, at most `NAME_MAX` = 20 characters);
  - the last row uploaded successfully (`pairfect-synced-best`, an `OnlineBest` `{ name, score, stage }`);
  - the chosen tile art set id (`pairfect-tile-art`, a plain string; validated by `tileArt.selectedTileArt`, not by storage);
  - the sound settings (`pairfect-sound`, `{ set, sfx, music }`, see `src/audio/` below). `loadSoundSettings` falls back to `DEFAULT_SOUND` field by field, and an unknown set becomes `wood`. It isn't mirrored to SharedPreferences, since losing it only resets the defaults;
  - the saved run (`pairfect-saved-game`, `{ savedAt, game: SavedGame | null }`; see "Saved run" above). `loadSavedGame` returns null for a malformed save, but keeps the stage entry and drops only `play` if just that part is malformed. The grid itself is checked later by `Board.load`.

  The high score (`loadBest`) is the leaderboard's top score; the old separate `pairfect-best` key is no longer read or written.
  - The local leaderboard keeps the top `LEADERBOARD_SIZE` (10) runs as `{ score, stage, date }`, where `stage` is 1-based like the HUD. Ties rank by higher stage, then the older run. `insertEntry` is the pure ranking step; `loadLeaderboard` drops malformed rows.
  - A run is recorded only when the player leaves a lose dialog (time out or no moves left) for the menu, by its "Về menu" button or Back (`GameScene.finishRun`), not when the level is lost, since the player may still retry. The lose dialog shows the rank the run would get (`rankFor`, which writes nothing). "Lưu và về menu" (pause menu, win dialog) keeps the run saved instead of ending it. A run abandoned by starting a new one from the menu ("Chơi mới") is never recorded, so it counts toward neither the leaderboard nor the high score. If the app is closed while the lose dialog is open, the saved `lost` state reopens that dialog on resume.
  - `LeaderboardScene` has two tabs, "Toàn cầu" (online, `fetchOnlineBoard`) and "Trên máy" (this local table), plus a "Quay lại" button back to `Menu`. A build without a Firebase config shows only the local table, with no tabs.
    - The last tab is remembered for the session. The online board is fetched again each time the screen is opened from the menu, and shows a loading, error (with "Thử lại") or empty state.
    - On a resize the scene sets `keepOnline` and restarts, keeping the loaded board (or the load in flight). It uses an instance flag, not scene data, because Phaser keeps the last `restart` data when a later `scene.start` passes none.
    - The player's own row has a gold outline. If they are outside the top 10, it is shown as an extra row at the bottom. A `loads` counter makes the scene ignore results from an older fetch.
- **`src/game/levels.ts`** defines the `LEVELS` array: `rows`, `cols` (wide, short boards that grow to a maximum of 8×20), `types`, gravity mode and time for each level. After the last level, `getLevel(i)` continues endlessly:
  - The board and `types` stay those of the last level.
  - The gravity cycles through the levels' gravities in order.
  - Time starts from the last level's time and drops `LOOP_TIME_STEP` (40 s) per pass of 7, with a floor of `LOOP_MIN_TIME` (160 s).
  - From `HARD_START` (stage 43, derived as the first pass that hits the time floor), gravity follows `HARD_GRAVITIES` and stones are added, growing per pass (`HARD_STONES_*`).
  - A level's `gravity` is a `GravityMode`: a Board `Gravity`, or `'rotate'`, which changes direction each match. Always resolve it with `gravityFor(mode, matchIndex)` before calling `Board.remove`. `GameScene` counts `matches` for this and shows the next direction as an arrow in the HUD.
  - `docs/stages.md` (Vietnamese) explains every stage, the loop and the hard phase. Keep it in sync when changing levels.
- **`src/game/tileArt.ts`** draws the tile textures. The player picks a tile art set (`TILE_ARTS`; the first is the default) in `TileArtScene`, opened from the "Hình ô" chip in the menu's top-right corner.
  - Every set has its own Canvas 2D textures, keyed `tile-<set id>-<type>` for types 1..`MAX_TYPES` (40) and drawn on first use by `artTexture`, which the picker also uses for its previews. `stone` is shared by all sets. Taller tiles (see the padded-grid invariant below) get their own textures with a `-h<height>` suffix, which `ensureTileTextures(scene, h)` draws; `artTexture` shifts the face down so it stays centered on the taller plate (the shift is applied before `ctx.save()`, so image sets that draw after loading are shifted too).
  - `createTileTextures(scene)` locks in the selected set and draws its 40 textures. Both `MenuScene` and `GameScene` call it in `create()`, and `tileKey` / `textureFor(gridValue)` resolve against that set. A set chosen mid-run would only take effect at the next scene start, which is why the picker is reachable from the menu only.
  - Built-in sets: `fruits` (fruit and animal emoji from the system emoji font, so they look different per platform: Noto on Android, Fluent on Windows, Samsung's own on Samsung devices) and `shapes` (the original 8 shapes × 5 colors). Emoji and images are scaled to fit `FACE_BOX` by their measured bounds.
  - Levels use types `1..types` (see `Board.generate`), so `EMOJI` is ordered most-distinct first: level 1 gets the 11 easiest to tell apart (level 2 adds the 12th). Keep to Unicode 8 or older so Android 7 (minSdk 24) has every glyph, and avoid adding a tile that shares color and outline with an existing one (e.g. peach next to apple/orange, crab next to octopus).
  - **Image sets** are found at build time with `import.meta.glob`: each folder `src/assets/tiles/<name>/` holding at least 40 `png/webp/jpg/jpeg/svg` files becomes a set named after the folder (id `pack-<name>`); smaller folders are skipped with a console warning. `imagePacks.ts` (pure, tested) groups and orders the files by name with numeric collation, so the first file is type 1. Images load lazily with `new Image()` (not the Phaser loader), are trimmed of transparent margins (so sprites with wide padding still fill the tile), and get drawn into the texture when ready; until then the tile shows only its plate. Images smaller than `FACE_BOX` (pixel-art sprites) are first enlarged by an integer factor with nearest-neighbour sampling (`pixelUpscale`), so they stay crisp instead of blurring.
  - An optional `credits.txt` next to the images (read with a `?raw` glob) becomes `TileArt.credits`. `TileArtScene` then shows a "Ghi công" button on that card, which opens the text in a `showDialog`.
  - A saved set id that no longer exists (folder removed) falls back to the default set.
  - Two image sets ship with the game:
    - `Quái vật`: 40 original creatures drawn for this project as SVG files in one style (dark outline, flat colors, bead eyes). Like `EMOJI`, they are ordered so the first 12 each have a different main color, and they deliberately don't resemble Pokémon or Mario characters.
    - `Tuxemon`: 40 front sprites (64×64 pixel art) from Tuxemon Set 1 on OpenGameArt, licensed CC BY-SA 4.0. Its `credits.txt` names the author of each sprite and must be updated whenever a sprite is swapped. The set licenses vary by monster (some are CC BY 4.0 or CC BY-SA 3.0); the chosen ones are all covered by CC BY-SA 4.0, and the two CC BY-SA 3.0 monsters (Aardorn, Aardart) were left out.
  - Image sets are bundled into `dist/` and the APK, so only add art the project has the rights to ship (the README says the same, in Vietnamese). Franchise art such as Pokémon would get the app removed from Google Play.

### Key invariants

- **Padded grid.** `Board.grid` is `(rows + 2) × (cols + 2)`. Real tiles live at rows `1..rows` and cols `1..cols`, and `0` means empty. The empty border is what lets paths wrap around the board edge without special cases. Every `Point` (`{ r, c }`) uses these padded coordinates, including in tests and in `GameScene.sprites`, which mirrors the grid shape.
  - On screen the border ring is drawn only `RING` (0.4) of a cell wide, so tiles use nearly the full screen width.
  - Cells have separate `cellW` / `cellH` (and `ringX` / `ringY`). Boards are wide and short, so on a less elongated screen (5:3 / 16:10 tablets such as the Galaxy Tab A11, 1340×800) square tiles hit the left and right edges with empty space above and below. When there is spare height, tiles grow taller than wide, up to `MAX_TILE_ASPECT` (1.25). They use textures `textureHeight(aspect)` tall (rounded down in steps of 8, so only a few sizes are ever drawn); the face stays square and only the plate grows. Sprites always scale uniformly by `tileScale()`, and every `textureFor` call in `GameScene` passes `this.texH`. On 20:9 phones the tiles stay square.
  - Always convert between grid and screen positions with `GameScene.cellCenter` and the inverse in `onPointer`. Never use `origin + c * cellW`.
- **Pathfinding.** Every path with at most 2 turns has the shape `a → p → q → b`, where the middle segment `p → q` lies on some full row or column. `findPath` tries every row and column, including the border ones, keeps the shortest clear path, and returns only its corner points.
- **Board ↔ sprite sync.** After a match, `Board.remove()` returns the `Move[]` produced by gravity. `GameScene.matchPair` uses that list to re-key `sprites` and tween each moved sprite. A shuffle never moves tiles: it only reassigns values among occupied cells, and `syncTextures` swaps the textures in place.
- **Level constraints.** `rows * cols` must be even (the `Board` constructor throws otherwise), boards should be wider than tall and at most 8×20 (beyond that, tiles get too small on a 4:3 tablet), and a level's `types` must not exceed `MAX_TYPES` (40). `levels.test.ts` checks this, checks that levels 1–5 give every type 4 tiles (`types = pairs / 2`), and auto-plays every level to a clear.
  - Boards have about 2.4 columns per row (4×11, 5×12, 6×14, 6×16, 7×16, 7×18, 8×20). With tiles up to 1.25× taller than wide, that fills over 90% of a 5:3 tablet (Galaxy Tab A11) and 78–91% of a 20:9 phone. A flatter board such as 7×20 leaves wide empty bands above and below on a tablet. No test checks this, so recheck the fill when changing board sizes.
- **Game size.** The logical height is fixed at 720. The width follows the viewport aspect ratio, clamped to 1100–1600, so the canvas fills the screen width; it's scaled with `Scale.FIT`.
  - `main.ts` sizes the game from the `#game` container, not the window. `index.html` insets that container by `env(safe-area-inset-*)`, so on full-screen phones the HUD stays clear of a display cutout (punch-hole camera) while the background fills the rest. A `ResizeObserver` on the container recomputes the size via `sizeFor` (debounced) and calls `game.scale.setGameSize` when it changes.
  - Scenes lay out X positions relative to `this.scale.width`, because the width varies. Y positions can assume 720.
  - Each scene registers `onGameResize` in `create()`. The menu simply restarts.
  - The game HUD is a thin one-row top bar (`HUD_H` = 80), because height is what limits tile size. It's laid out left to right as stage, gravity, Hint, Shuffle, Pause, time bar, score.
    - Positions come from measured text widths, and the time bar fills the leftover width.
    - The score has a fixed slot (`SCORE_W`) on the right, so the bar doesn't move as the score grows. In PvP that slot is `OPP_W` and holds the opponent's name, pairs left and mini-board, and the stage label shows the player's own pairs left.
    - The rotate-gravity arrow is a separate text object, so it can update without shifting the buttons.
    - Hint (light bulb) and Shuffle (crossed arrows) are square `IconButton`s, the same `HUD_BTN` size as Pause. The remaining count sits in a badge on the top-right corner that overhangs the button, so leave a wider gap after each one. `IconButton.setCount` redraws the badge and the enabled state.
    - The high score is deliberately not shown in the HUD; the menu shows it, next to the "Bảng xếp hạng" button.
  - `GameScene.relayout()` keeps all state. It snaps sprites to their final positions and textures, rebuilds the HUD (every HUD object goes through `keep()` into `this.hud`), and reopens the current dialog (always open dialogs through `openDialog`).
- **Portrait viewports.** These only happen in a browser, since Android is locked to landscape. `index.html` covers the game with a CSS "rotate your device" overlay (`@media (orientation: portrait)`), and the game keeps running underneath at the 1100 minimum width.
- **Relative base path.** `vite.config.ts` uses `base: './'` so the build works inside the Capacitor WebView. Keep it relative.

### Tests

`Board.test.ts` builds boards from string diagrams through `boardFrom(['12', '#.'])`, where `.` is empty, `#` is a stone, and digits are tile types. In those tests, coordinates are the padded ones, so the top-left tile is `P(1, 1)`.

`storage.test.ts` and `online.test.ts` stub `localStorage` with `vi.stubGlobal(fakeStorage())` (`src/test/fakeStorage.ts`), because tests run in Node. `online.test.ts` also mocks `firebase/app`, `firebase/auth` and `firebase/firestore/lite` with `vi.mock`, and sets the Firebase config with `vi.stubEnv`. That works because `online.ts` reads `import.meta.env` at call time.

`Board.test.ts` and `levels.test.ts` auto-play full boards to a clear, under every gravity mode, with stones, and through the hard phase. Those tests use random boards, so rerun the suite a few times after changing generation, gravity or stones.

`match.test.ts` wires two `Match`es through a message queue and a test-controlled clock (`duel()`), and checks that the shadow board stays identical to the real one under every PvP gravity. That includes a randomized duel where both sides attack and messages arrive in delayed batches. Compare shadows only while neither side has an outcome: a finished match ignores further events. `session.test.ts` connects two `PvpSession`s with `linkPair` and fake timers, with the guest's clock 7 s off. `peer.ts`, `signaling.ts` and `turn.ts` have no unit tests (WebRTC / Realtime Database / fetch). Check them in the browser: two tabs, `?relay`, or a phone on mobile data.
