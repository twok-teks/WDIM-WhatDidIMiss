# Testing

## Automated checks

```sh
npm run check
npm run browser:install
npm run test:e2e
```

Use `npm.cmd` if PowerShell blocks `npm.ps1`. Browser installation is a one-time prerequisite. `check` fails at the first failing stage.

Individual commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`, `npm run build:firefox`. Use `npm run test:watch` for iteration.

### Unit/component coverage

Vitest, jsdom, and React Testing Library use injected storage/context sources. AI server tests run in Node against ephemeral loopback HTTP servers with fake models; unit tests make no Groq requests.

| File                     | Coverage                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/domain.test.ts`   | Timestamp flooring/unknowns, URL sanitization, boundary endpoints, future/foreign/invalid fact exclusion, verified predecessors, stale answers |
| `tests/services.test.ts` | Immutable bounded requests, no history/unfiltered knowledge, fail-closed sends, abort/error paths, adapters/identity, preferences              |
| `tests/video.test.ts`    | Selection, visibility, state/timing events, revision invalidation, fresh reads, removal/replacement, cleanup                                   |
| `tests/chat.test.tsx`    | ChatPanel via App, composer, status, empty/no-video, loading/error, theme, keyboard/IME, minimize/close, rewind cancellation, scrolling        |

`tests/discovery.test.ts` additionally covers recursive shadow discovery, hidden/PiP candidates, per-video rewind revisions, browser-assigned frame provenance, private/regular separation, pinned selection, stale catalogs, failed-read recovery, and worker generations. `tests/video-picker.test.tsx` checks grouped sources and refresh/selection controls.

jsdom cannot decode media, advance a real video clock, calculate actual layout, implement fullscreen top-layer rendering, load extension manifests, or enforce browser permissions. Tests stub video properties and geometry to prove decision logic, not browser behavior.

`tests/timeline.test.ts` covers mapped story time versus raw stream time, rejection of all retrieval for unverified clocks, consecutive confirmed ads, prerolls without a safe position, lost continuity, identity changes, rewinds during/after ads, provider blocking, collector request revisions, generic duration uncertainty, and source replacement. Confirmed-ad tests inject a test adapter; they do not establish real-site detection. Chat tests cover retained messages, canceled late replies, resumed sends, and ads first observed during fresh send/reply reads. Directory tests cover conversation selection holds, disappearance without fallback, release, and rapid ad transitions.

### Playwright smoke foundation

`npm run test:e2e` builds Chrome MV3 and loads that extension in a persistent headless Chromium context with a temporary profile. The fixture server starts automatically or reuses a local server on port 3000.

It checks real media metadata/play/pause/seek, Shadow DOM injection, timestamp propagation to mock replies, Enter/Shift+Enter, rewind clearing, minimize/close, persisted theme, host-style isolation, missing/replaced videos, narrow layout, and container fullscreen. Production must not expose Developer context.

Detection tests also exercise cross-origin and nested sandboxed iframes, srcdoc/blob/data frames, real closed/open shadow roots, hidden playing videos, late shadow attachment with refresh, cross-tab pinning and closure, actual native PiP (including a hidden paused video inside a closed shadow root), service-worker stop/recovery via CDP, and navigation/history restoration. This is fixture coverage, not streaming-platform automation. Firefox does not support the same Playwright extension-loading workflow. [Playwright extension documentation](https://playwright.dev/docs/chrome-extensions).

Review these generated images for UX changes:

- `test-results/widget-dark.png`
- `test-results/widget-light.png`
- `test-results/widget-conversation.png`
- `test-results/widget-narrow.png`
- `test-results/widget-embedded.png`

These are review artifacts, not pixel assertions. Geometry tests do not replace visual inspection.

Ad-related browser tests exercise a second real playing video during an active conversation, removal of the held player, and explicit return to Automatic. A separate test switches the existing element to a locally generated live stream, changing its actual duration while retaining its source attribute, and checks that chat suspends while playback continues. This is generic lifecycle coverage, not automatic ad recognition or validation of a streaming site's timeline mapping.

## Manual integration checklist

Use **http://localhost:3000** and [DEVELOPMENT.md](DEVELOPMENT.md). Repeat browser-specific rows in the actual browser; do not check unperformed items.

### Installation and video

- [ ] Extension loads without errors.
- [ ] Bundled fixture video loads and has **1:30** duration.
- [ ] Video is detected; page title is labeled unverified.
- [ ] Play state and advancing timestamps are detected.
- [ ] Pause state and stable timestamps are detected.
- [ ] Seeking updates currentTime and the chat timestamp.
- [ ] Before a conversation starts, playing a second video selects the active video.
- [ ] During a conversation, a second playing video does not take over; the picker says **Kept for this conversation**.
- [ ] Minimize retains the player hold; close releases it; manual pins remain selected.
- [ ] Generic player time is labeled unverified and does not imply ad recognition.
- [ ] An unexplained duration change disables Send and clears chat without pausing the video; Refresh does not falsely restore certainty.
- [ ] Removing all videos gives **No active video detected**.
- [ ] Restoring/replacing a video resumes detection.
- [ ] Source/SPA URL changes clear the previous conversation.
- [ ] Unknown metadata blocks sending.
- [ ] Unknown/live duration is not presented as a fake finite value.

### Embedded and multiple players

Use **http://localhost:3000/players.html**.

- [ ] Cross-origin and srcdoc videos appear, with only one top-page widget.
- [ ] Open/closed shadow players appear, including dynamically added players.
- [ ] Hidden playing videos remain discoverable.
- [ ] Native PiP source remains listed even if its element becomes hidden.
- [ ] Refresh rescans all accessible tabs without resetting a valid selection.
- [ ] The selector groups videos by tab and identifies embedded players.
- [ ] Explicit selection remains pinned when another video starts.
- [ ] Automatic selection stays in the current tab.
- [ ] Seek/read/mock boundary refer to the selected player's frame.
- [ ] Removing a selected iframe or closing its tab clears context and chat.
- [ ] Worker restart clears stale context and discovery recovers.
- [ ] Denied site access is respected; a page reload after installation/update enables collectors.
- [ ] Verify the actual reported third-party movie/API player URLs when available.

### Chat and spoiler boundary

- [ ] Launcher opens chat.
- [ ] Minimize preserves conversation and returns focus.
- [ ] Close clears conversation; reopening shows empty state.
- [ ] A message sends, with loading then a labeled mock reply.
- [ ] Mock receives the timestamp from send time.
- [ ] Enter sends; Shift+Enter adds a newline.
- [ ] Empty/whitespace questions do not send.
- [ ] IME Enter does not submit prematurely.
- [ ] Rewind clears user and assistant messages.
- [ ] Rewind during a pending reply prevents it from appearing.
- [ ] Rewind then fast-forward cannot resurrect an invalidated reply.
- [ ] No-video state disables Send without inventing a boundary.
- [ ] Escape minimizes; keyboard focus is usable.
- [ ] Icon-only controls have labels and visible focus indicators.
- [ ] New messages scroll appropriately at the bottom.
- [ ] Scrolling upward is respected; new-message control works.
- [ ] Dev error simulation shows an error and the next send recovers.
- [ ] Production has no visible developer inspector.

### Appearance, isolation, persistence

- [ ] Dark mode is the initial default and remains comfortable.
- [ ] Light mode is intentionally styled and readable.
- [ ] Theme persists after webpage reload.
- [ ] Theme persists after extension reload in the same profile.
- [ ] Hostile fixture CSS does not alter widget styling.
- [ ] Widget CSS does not change the host page.
- [ ] Typing does not trigger ordinary bubbling video shortcuts.
- [ ] Widget fits a 1366×768 laptop viewport.
- [ ] Narrow windows and 200% zoom remain usable.
- [ ] Reduced-motion preference suppresses animation.
- [ ] Container fullscreen preserves widget/conversation.
- [ ] Exiting fullscreen returns the widget to the page.
- [ ] Native video fullscreen/PiP limitations are understood.

### Reloads and browsers

- [ ] Chrome build loads from **.output/chrome-mv3**.
- [ ] Extension reload followed by page refresh applies a rebuild.
- [ ] Page reload reinjects the loaded version.
- [ ] Dev React/content edits create no duplicate hosts/listeners.
- [ ] Content logs appear in the webpage DevTools.
- [ ] Worker logs appear in their separate console.
- [ ] Edge loads **.output/chrome-mv3** and core interactions work.
- [ ] Firefox loads **.output/firefox-mv3/manifest.json** and core interactions work where supported.
- [ ] Browser site-access settings are respected.
- [ ] Default build makes no AI requests; AI uses the loopback gateway and missing evidence refuses locally.

## Recorded milestone validation

Validated on Windows with Node 24: unit/component checks, production Chromium extension tests, and both MV3 builds. Dark/light/conversation/narrow screenshots were inspected. Development injection, the debug inspector, error simulation, React edit reinjection, and absence of duplicate hosts were exercised in real Chromium. The normal development browser launch was also checked.

The detection expansion passed 51 unit/component tests and 11 Chromium browser tests, including actual PiP and worker recovery. No specific failing third-party site URL was supplied, so those real sites remain unverified.

The ad/timeline foundation passed 70 unit/component tests, the full `npm run check` (including both MV3 builds), and 13 production Chromium tests. Conversation and narrow-layout screenshots were inspected. Confirmed ad transitions were validated with injected test adapters; real streaming-site ad recognition and manual Edge/Firefox interactions were not tested.

Actual Edge/Firefox interaction checklists remain manual. A passing build is not evidence those browser interactions were executed. The fixture does not guarantee behavior in native player fullscreen or arbitrary streaming sites.

## Limits of safety tests

The mock has no story knowledge. AI tests establish evidence exclusion, constrained output, immutable requests, and lifecycle protection. They cannot prove identity or reveal annotations correct, guarantee relevance of every model selection, or establish mapping for a changing live timeline.

`tests/grounded-ai.test.ts` checks synthetic facts immediately before/at/after a reveal, verifies future facts never enter model input, and exercises malformed/foreign/future results, injected instructions, incomplete outputs, sanitized failures, and aborts. `tests/ai-gateway.test.ts` covers actual HTTP origin/host restrictions, body limits, catalog validation, and rate limits. `tests/ai-transport.test.ts` covers extension sender authorization, incognito rejection, cancellation, and disconnects.

## AI integration validation

Run `npm run test:e2e:ai` with a fake model. It checks missing-evidence refusal, the verified-catalog contract over an actual extension port, and the real caption demo through the UI. The positive caption path covers observation, fresh selected-frame reads, transport, gateway filtering, model selection, and rendering. A rewind removes the answer. No production verification bypass is installed. `test-results/widget-caption-ai.png` is a review artifact.

With a Groq key, `npm run test:e2e:ai:live` repeats with the real model and future-event refusals on both paths: four potentially billable requests containing synthetic evidence only. It validates the fixture's fictional captions, not visual interpretation or real streaming titles. Stop any gateway on port 8787 first. Vendor availability/refusal behavior can change; domain checks remain mandatory.

`tests/captions.test.ts` covers exact platform matching, reader capabilities for all five platforms plus the fallback, visible active cues only, hidden text, multi-player ambiguity, stale captions after rewind, ad blocking, and caption exclusion from catalogs. `tests/caption-server.test.ts` covers pre-model future exclusion, provenance, malformed output, related-source permission/order/asset/topic checks, and mocked online lookup restrictions. These do not establish live subscription-platform coverage. Follow [PLATFORMS.md](PLATFORMS.md)'s manual release gate.

The caption expansion passed 146 unit/component/server tests, the full code check, 13 standard Chromium browser tests, the AI UI test with fake and live Groq models, and default/AI Chrome and Firefox builds. The caption-answer screenshot was inspected. A live Wikidata lookup for Khoai Lang Thang, anchored in a synthetic test caption, returned one eligible sourced fact. The live model answered the displayed envelope caption and refused the later reveal. Native Brave playback was reported working by the user before this expansion; subscription-platform caption behavior remains a manual validation gap.

On October 15, 2026, validation passed 116 unit/component/server tests, 13 standard Chromium browser tests, and the separate AI browser test with both fake and live Groq models. The live test answered from permitted evidence and refused the request for later events; the future fact was excluded from model input in both cases. The configured gateway also started successfully with an empty catalog. Default and AI Chrome/Firefox builds were checked; actual Edge/Firefox interactions and real streaming-site identity/ad mapping remain unverified.
