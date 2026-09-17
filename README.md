# WDIM · What did I miss?

A browser video companion for questions about **what you have watched so far**.

This first milestone detects an HTML5 video, tracks playback, and passes a timestamp-bound snapshot to a local mock chat provider. There are no AI API calls, secrets, accounts, or backend services.

## The defining rule

**NO feature may expose information occurring after the user's current spoiler boundary.**

Every provider request carries an immutable `SpoilerBoundary` and an `AllowedContextWindow`. Unknown timing blocks sending. Rewinding, losing the video, or changing media clears the conversation and invalidates pending responses. Predecessor-media context is denied by default and requires explicit approval plus verified release order.

Future retrieval must remove later facts **before** they reach a model. These contracts establish the boundary; they are not a claim that a prompt makes an unrestricted LLM spoiler-proof.

## Current MVP

- HTML5 video discovery across accessible tabs and nested frames, including cross-origin embeds, open/closed shadow trees, and hidden playing/PiP videos.
- Video picker grouped by tab, explicit selection that stays pinned, and **Refresh videos** to rescan.
- Playback state, duration, seeking, and current time queried directly from the selected player's frame.
- Compact floating launcher and chat panel in an isolated Shadow DOM.
- Dark by default, intentional light theme, and locally persisted preference.
- Keyboard composer, mock replies, loading/error/no-video states, and respectful scrolling.
- Minimize preserves conversation; close clears it. Rewinding starts a fresh conversation.
- Container fullscreen support where the browser permits it.
- Development-only context inspector and simulated provider error.
- Bundled 90-second video fixture with no external media dependency.
- Unit/component tests and real Chromium extension smoke tests.
- Chrome/Edge MV3 build and separate Firefox MV3 build.

## Start locally

Requires Node.js 22+ and npm. Node 24 was used for validation.

```sh
npm install
npm run browser:install
npm run dev
```

**Windows PowerShell:** if `npm.ps1` is blocked, substitute `npm.cmd`. No execution-policy change is needed. Dependencies and the browser are already installed in this workspace, so start with **`npm.cmd run dev`**.

Development starts **http://localhost:3000** and opens Playwright's bundled Chromium/Chrome for Testing with the extension installed in a separate temporary profile. This avoids current branded Chrome/Edge command-line loading restrictions. See [Playwright's extension guidance](https://playwright.dev/docs/chrome-extensions).

1. Click **Play / pause**, then **Seek to 0:47**.
2. Open **WDIM** at the bottom right.
3. Type a question and press Enter. The mock should name **0:47**.
4. Seek back to **0:12**. The old conversation disappears.
5. Try the theme switcher, minimize, close, and **Container fullscreen**.

For player detection, visit **http://localhost:3000/players.html**. Add embedded/shadow players, open another video tab, then choose a source in WDIM. **Automatic** follows the current tab; an explicit selection stays pinned. **Refresh videos** requests another scan across accessible tabs.

Do not also start `npm run fixture` while `npm run dev` owns port 3000. Theme storage survives page reloads; a fresh temporary browser profile starts with defaults.

## Load into normal Chrome

```sh
npm run build
npm run fixture
```

Open **chrome://extensions**, enable **Developer mode**, click **Load unpacked**, and select:

```text
C:\Users\twok88\Education\Personal Projects\WDIM-WhatDidIMiss\.output\chrome-mv3
```

Visit **http://localhost:3000**. After rebuilding, click the extension's **Reload** button, then refresh the fixture tab. There is no toolbar popup; the launcher lives on the webpage.

Edge uses **edge://extensions** and the same **.output/chrome-mv3** directory. Firefox uses `npm run dev:firefox` or `npm run build:firefox`. See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for installation, reload behavior, and DevTools contexts.

## Architecture and stack

```text
Each frame: HTML5 videos → GenericHtml5Adapter → VideoContextProvider
                                                     ↓
                          Background media registry across tabs
                                                     ↓
                          Selected video → fresh frame query → Chat UI
                                                     ↓
                                SpoilerBoundary + AllowedContextWindow
                                                     ↓
                                    ChatService → MockAIProvider
```

WXT, React, strict TypeScript, Manifest V3, modern CSS, Vitest, React Testing Library, ESLint, Prettier, and Playwright. React and React DOM are the only direct application runtime dependencies.

| Location                                | Responsibility                                       |
| --------------------------------------- | ---------------------------------------------------- |
| `entrypoints/collector.content.ts`      | Lightweight video collection in each eligible frame  |
| `entrypoints/background.ts`             | In-memory registry and frame message routing         |
| `entrypoints/content/`                  | Injection, Shadow DOM, cleanup, fullscreen placement |
| `services/video/`, `services/adapters/` | Video selection and playback snapshots               |
| `domain/media/`, `domain/spoilers/`     | Identity, formatting, boundaries, allowed knowledge  |
| `services/chat/`                        | Bounded request construction and local mock          |
| `components/`, `hooks/`, `styles/`      | Widget, themes, conversation lifecycle               |
| `storage/`                              | Theme preference only                                |
| `fixtures/`, `scripts/`                 | Offline page/media and development commands          |
| `tests/`                                | Unit, component, and real extension tests            |

[ARCHITECTURE.md](docs/ARCHITECTURE.md) explains invariants, privacy, and future retrieval. [AGENTS.md](AGENTS.md) carries the rules forward for future coding work.

## Verification

```sh
npm run check
npm run test:e2e
```

`check` runs lint, types, unit/component tests, formatting, and Chrome/Firefox production builds. `test:e2e` rebuilds Chrome, starts/reuses the local fixture, and loads the actual extension in headless Chromium. Review screenshots appear in `test-results/`.

See [TESTING.md](docs/TESTING.md) for test scope and the manual checklist.

## Limitations

The adapter knows the page title, not the movie. Automatic selection may choose an ad; use the video picker to pin the intended player. Embedded HTML5 players are supported where the browser permits content-script injection. Site access must cover the embedding page and player origin; reload existing pages after updating the extension. Refresh rescans loaded collectors and cannot override permissions.

Chrome's internal media controls also include media sessions and Cast routes; they are not a complete public extension discovery API. Remote-only Cast sessions, restricted pages, denied frames, and players with no accessible HTML video cannot be guaranteed. PiP video timing can be tracked, but the widget stays on the webpage; native video/iframe fullscreen and PiP windows cannot host its overlay. DRM internals and movie recognition remain outside this milestone. See [detection coverage](docs/ARCHITECTURE.md#video-detection-and-adapters).

The mock has no story knowledge. There is no conversation persistence, movie database, ingestion pipeline, backend, or production spoiler guarantee. Only theme is stored. Broad site access supports generic pages and can be restricted through browser settings.

Automated Chromium interactions and both builds are validated. Actual Edge/Firefox interactions still need the documented manual pass.

## Next milestone

First verify detection on the actual third-party player URLs; representative local embeds are covered, but no specific failing site URL was supplied. Then add a tiny hand-authored story fixture and verified media mapping. Exercise retrieval exclusion immediately before/at/after each reveal, including rewind and predecessor rules, before introducing a backend or real LLM. Site adapters can follow once identity and timing contracts are established.
