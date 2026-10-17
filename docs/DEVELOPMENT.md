# Development and browser debugging

## Install and launch

From the repository root with Node.js 22.18+:

```sh
npm install
npm run browser:install
npm run dev
```

On this Windows PowerShell setup, replace `npm` with **`npm.cmd`** if execution policy blocks `npm.ps1`. No policy change is needed. Dependencies and Chromium are already installed in this workspace; the first command to try now is **`npm.cmd run dev`**.

Use `npm ci` for a clean lockfile install. The install hook runs `wxt prepare` to generate TypeScript configuration/types in the ignored `.wxt/` directory.

`scripts/dev.mjs` starts the fixture at **http://localhost:3000**, starts WXT (normally **http://localhost:3001**), and launches **Playwright's bundled Chromium/Chrome for Testing** through WXT's `web-ext` runner. The extension is automatically loaded from **.output/chrome-mv3-dev** in a separate temporary profile, not your normal Chrome profile.

The browser download is one-time. The fixture never fetches remote video. This browser choice avoids current branded Chrome/Edge restrictions on command-line extension loading. [Playwright documents the restriction](https://playwright.dev/docs/chrome-extensions).

WXT opens **http://localhost:3000**. Open that URL manually if necessary. Port 3000 must be free; do not also run `npm run fixture` while dev is running. Ctrl+C stops development. A new temporary profile resets preferences; reloading a page within the same profile preserves them.

### First interaction

1. Click **Play / pause**. Open **WDIM** at bottom right; it should say **Playing**.
2. Pause, then choose **Seek to 0:47**. The widget should show **0:47 / 1:30**.
3. Type `What happened?` and press Enter. The mock reports boundary **0:47**.
4. Shift+Enter adds a newline; Enter during IME composition does not send.
5. Minimize retains messages. **Close and clear chat** removes them.
6. Seek backward to **0:12**; the conversation clears.
7. Toggle theme, reload, and reopen to verify persistence.
8. Try **Container fullscreen**; native video fullscreen may hide the widget.

**More fixture controls** covers removal/reinsertion, a second video, hostile host CSS, and SPA URL changes. The fixture is not included in production extension output.

### Embedded and multiple players

Open **http://localhost:3000/players.html**. Add a cross-origin player, a closed-shadow player, or a srcdoc player. Open WDIM and choose a **Video** from the selector; entries are grouped by tab and show playback time, embedded status, and native PiP status where exposed. **Automatic · this tab** stays within the current tab. Choosing an individual video pins it even when another player starts.

Use **Open another video tab** to test cross-tab selection. Seek there, select it from the first tab, and verify WDIM shows that player's timestamp. **Refresh videos** asks loaded collectors across accessible tabs to scan again. Removing a pinned video disables its context rather than choosing another one.

After this update, reload the extension and refresh your existing movie tabs once. For third-party API players, site access must allow both the movie page and embedded player origin. Refresh cannot grant permission or inject into restricted pages; if a player is absent, check **chrome://extensions → WDIM → Details → Site access**, reload its page, and start playback.

## Edits, HMR, and reloads

This Shadow DOM content UI does **not** get state-preserving React Fast Refresh. WXT rebuilds and reinjects the content script. We verified a React edit: the launcher returned, the new caption appeared, and only one widget host remained.

| Change                                          | During development                                            | Manually loaded production build                                                  |
| ----------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| React component or hook                         | Rebuild/reinject; chat/open state resets                      | Rebuild, reload extension, refresh webpage                                        |
| Widget CSS                                      | Rebuild/reinject resources; reopen widget if needed           | Rebuild, reload extension, refresh webpage                                        |
| Adapter, video service, content entrypoint body | Rebuild/reinject; old timers/listeners clean up               | Rebuild, reload extension, refresh webpage                                        |
| Match patterns, permissions, WXT config         | May restart/reload extension; refresh existing tabs if needed | Rebuild, reload extension, refresh webpage; grant changed permissions if prompted |
| Fixture HTML/CSS/JS                             | Refresh webpage; fixture server has no HMR                    | Refresh webpage                                                                   |
| Background/service-worker file                  | Extension context reloads; globals reset; refresh stale tabs  | Rebuild/reload extension and refresh webpage                                      |
| Future popup/options React page                 | Vite/React HMR can apply while that document is open          | Rebuild/reload and reopen the page                                                |

Reinjection differs from refreshing the host page: the video can retain its position while chat resets. WXT's documentation distinguishes Shadow Root UI reinjection from iframe/page HMR. [WXT UI comparison](https://wxt.dev/guide/essentials/content-scripts#ui).

If an edit is missing, check terminal compile errors, wait for the reload message, reopen WDIM, then refresh the webpage. If still stale, reload the extension and refresh the page. Confirm the correct dev/production directory is loaded. Never edit generated `.output/` files.

## Normal Chrome profile: exact manual steps

1. Run `npm run build`.
2. Run `npm run fixture` and leave the server running.
3. Open **chrome://extensions**.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select this directory, which contains the generated manifest:

   ```text
   C:\Users\twok88\Education\Personal Projects\WDIM-WhatDidIMiss\.output\chrome-mv3
   ```

7. Confirm WDIM is enabled and has no errors.
8. Open or refresh **http://localhost:3000**.
9. The floating WDIM launcher confirms injection. Open chat and test seeking.

For a moved/second checkout, use **.output/chrome-mv3** under that repository root.

After editing, **build again → click Reload on WDIM's extension card → refresh the webpage**. Extension reload alone does not reliably rerun static content scripts in already-open documents. Refreshing creates a clean content context.

There is no toolbar action/popup in this MVP. Pinning is unnecessary; the in-page launcher is the interface. If Chrome offers a pin control, it does not add chat behavior to that icon. Check **Details → Site access** if injection is missing; you can restrict testing access to localhost.

For live development in normal Chrome, run **`npm run dev:manual`** and load **.output/chrome-mv3-dev**. Keep WXT running. Avoid enabling both dev and production copies on the same site.

## Where console output goes

An extension can contain several independent JavaScript programs. Each has its own execution context and DevTools.

### Content script and injected React

Open DevTools on the **fixture webpage** (F12 or Ctrl+Shift+I). Logs from components, hooks, adapters, video services, and the content entrypoint appear in that tab's console. Development logs `[WDIM] Content UI mounted...`. Enable Info messages and check console filters if it is hidden.

The Console context dropdown normally says **top**, meaning the webpage world. Choose WDIM's content-script context for extension APIs. Page scripts cannot see content-script globals; module-scoped variables are not on `window` either, so use source breakpoints.

In **Elements**, find **`<wdim-companion>`**, expand **#shadow-root (open)**, and inspect React markup/styles. This page-console expression can inspect the shared DOM:

```js
document.querySelector('wdim-companion')?.shadowRoot;
```

An open shadow root is inspectable, but the script still runs in an isolated JavaScript world. In **Sources**, look under content scripts/WDIM and use development source maps to set breakpoints.

Content errors may also appear under **chrome://extensions → WDIM → Errors**. After reload/update, “Extension context invalidated” generally calls for a webpage refresh.

In dev only, expand **Developer context** inside chat. It shows adapter, current time, duration, title, sanitized URL, video count, playback state, safety revision, selected video ID, selection mode, and discovery status. **Fail next mock reply** exercises the error state. Production does not enable those controls.

### Background/service worker

Production includes **`entrypoints/background.ts`**, which stores the live media registry and routes messages between the top-page UI and video collectors. It cannot directly read a page DOM.

Open **chrome://extensions → WDIM → Service worker / Inspect**. This is a separate console for worker code and runtime events, not React/content logs. MV3 workers can stop while idle; module globals are not persistent storage. Inspecting can alter worker lifetime.

The registry is intentionally temporary. After worker suspension, the UI clears its cached context, reconnects, and requests reports again. **Refresh videos** also triggers recovery. To debug an embedded player, choose its frame and WDIM isolated world in the webpage Console context dropdown; the collector runs there, while the React UI runs only in the top frame.

### Extension pages

Future popup/options pages have their own DevTools. Inspect the popup itself or its extension tab. A popup usually closes on focus loss. Inspecting a webpage or worker does not show logs from that separate document. No unused popup/options scaffolding exists in this milestone.

### Network

The default build has no AI requests. The AI build sends bounded caption/verified-evidence questions through the worker to `http://127.0.0.1:8787/v1/answer`; the gateway calls Groq and optionally performs the explicitly enabled Wikidata name lookup. Inspect the worker's Network panel for gateway requests. Keys stay in the ignored `server/.env`, never extension code. The fixture uses local media; WXT development adds localhost tooling. See [AI setup](AI.md) for configuration, limitations, and live validation.

## Microsoft Edge

Run `npm run build` and `npm run fixture`. Open **edge://extensions → Developer mode → Load unpacked** and select:

```text
C:\Users\twok88\Education\Personal Projects\WDIM-WhatDidIMiss\.output\chrome-mv3
```

Edge reuses the Chrome/Chromium MV3 build. Visit **http://localhost:3000**. After changes: rebuild, reload extension in Edge, refresh webpage. DevTools context separation is the same. Actual Edge interactions remain a manual checklist item.

## Firefox

Install Firefox locally, then run:

```sh
npm run dev:firefox
```

It starts the fixture and WXT with **`-b firefox --mv3`**. WXT discovers installed Firefox and loads **.output/firefox-mv3-dev** temporarily in a separate profile. The Chromium download is unnecessary for a Firefox-only workflow. Check site permissions if injection is missing.

For manual testing:

```sh
npm run build:firefox
npm run fixture
```

Open **about:debugging#/runtime/this-firefox → Load Temporary Add-on**, then select the **file**:

```text
C:\Users\twok88\Education\Personal Projects\WDIM-WhatDidIMiss\.output\firefox-mv3\manifest.json
```

Unlike Chrome, select the manifest file, not its directory. Temporary add-ons disappear when Firefox closes. Rebuild, choose **Reload**, then refresh the fixture. Tab DevTools inspect content scripts; add-on **Inspect** opens extension contexts.

Both targets explicitly use MV3 rather than WXT's Firefox MV2 default. The Firefox manifest declares a local ID and no off-device data collection, following [Mozilla's manifest guidance](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). No store publishing/signing is configured. The build is validated; actual Firefox interaction testing remains manual.

## Working on playback and ads

The generic adapter does not identify ads. The widget labels its time as unverified and holds the chosen player after the first question, including while minimized. Closing chat releases this conversation hold; an explicit manual selection remains pinned. Use the picker to choose Automatic or another player at any time.

An unexplained change from a known finite duration suspends tracking for that media identity. Refresh rescans but does not remove this uncertainty; a new source/page identity or page reload starts a new unverified session. Rewinds and source changes continue to clear chat. Playback itself is never paused or sought by WDIM.

`SiteAdapter.readPlayback` remains the integration point for independently verified story mapping. The generic identity/timing adapter stays unverified. Separately, `services/adapters/platform-captions.ts` implements caption capabilities for the five priority platforms and a fallback. Its ad signals suspend capture; they never certify a story timeline. See [PLATFORMS.md](PLATFORMS.md) for live validation gaps.

Developer context includes raw time, effective position, timeline phase/mapping/continuity, and separate request/conversation revisions. Confirmed ads cancel requests while retaining safe messages; unknown context invalidates both. See [ARCHITECTURE.md](ARCHITECTURE.md) for the contract and [TESTING.md](TESTING.md) for coverage.

## Command reference

The chat panel opens with **Details** collapsed. Expand it to change video source, refresh discovery, inspect caption coverage, or open **Related context**. The disclosure supports keyboard activation and scrolls internally on smaller screens. Playback time and actionable tracking problems stay visible while chatting.

In the AI build, **Details → Caption debug** opens a local snapshot of the selected video's available captions. **Refresh captions** reads the owning frame again; it does not call AI. Search ignores accents, and older/newer buttons page through 32 excerpts at a time. Each row distinguishes an observed timestamp from a recovered cue's end time. Closing the disclosure, Details, or chat releases the debug snapshot. Rewinds, selection changes, and unavailable context hide old text. This is the local evidence buffer, not a full transcript or the exact question-specific evidence sent to AI.

Related-context checkboxes authorize sources; they do not guarantee coverage. Background currently supports direct or polite “Who is [full name]?” / “Tell me about [full name]” questions about a person named in available captions. Page titles do not establish identity. Earlier works need entries in `WDIM_RELATED_CONTEXT_FILE` with the matching asset, mentioned topic, and reviewed release order. A refusal now explains missing names, lookup failures, and absent or unmatched earlier-work sources. Do not remove caption anchoring to bypass these messages.

For past-caption recovery, enable the fixture's caption demo, then seek to 0:47 and ask what Mira held earlier. The first completed native cue is available even after the displayed-caption buffer resets. Rewind to 0:12: the conversation clears and cues ending later than 0:12 are excluded from recovery. Details reports the player's available recovery capability. This test does not establish YouTube or subscription-player transcript availability.

For the opt-in AI build, use `npm run build:ai` or `npm run build:ai:firefox`; run the gateway with `npm run ai:server`. `npm run test:e2e:ai` uses a fake model; `npm run test:e2e:ai:live` exercises four logical questions with synthetic evidence, normally eight potentially billable Groq calls across selection, writing and review. Both rebuild Chrome AI output. Default builds overwrite the same directories with mock mode. Restart the gateway after server changes, reload the extension, and refresh the video tab. Natural answers have a collapsed **Sources** disclosure; source timestamps describe evidence availability, not independently verified story timing.

On the fixture, click **Enable caption demo**, play briefly, then ask **What is Mira holding?** On external sites, enable captions and check the excerpt count. A persistent zero count means that caption surface is unavailable; do not disable boundary validation. Use a normally launched browser with the unpacked build for interactive YouTube testing: the automated Playwright session produced playback errors on the reported machine, while a native Brave launch worked.

After rebuilding an unpacked extension, use **Reload** on its card in `brave://extensions` or `chrome://extensions`, then reload the video tabs. Restarting the browser alone can retain a cached background worker while loading newer content scripts from disk. If WDIM repeatedly shows **Reconnecting to video discovery…**, reload the extension first. The local Brave profile reproduced this with a cached v2 worker and v3 page scripts; reloading the extension and restarting restored discovery. This does not require clearing browsing data or changing DNS.

| Command                 | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `npm run dev`           | Fixture + WXT + isolated Chromium           |
| `npm run dev:manual`    | Fixture + WXT without launching a browser   |
| `npm run dev:firefox`   | Fixture + WXT + installed Firefox           |
| `npm run fixture`       | Local test page only                        |
| `npm run build`         | Production `.output/chrome-mv3`             |
| `npm run build:firefox` | Production `.output/firefox-mv3`            |
| `npm run check`         | Lint, types, tests, formatting, both builds |
| `npm run test:e2e`      | Production extension browser tests          |
| `npm run test:watch`    | Interactive Vitest                          |
| `npm run format`        | Apply Prettier                              |

The `image-size` override selects a patched 2.0.x release for the dev runner's transitive add-on linter. It is not bundled in the extension. Remove the override once upstream no longer needs it.
