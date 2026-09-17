# WDIM

Build a video companion that answers about what the user has watched SO FAR.

**NO feature may expose information occurring after the user's current spoiler boundary.**

- Keep spoiler rules in `domain/spoilers`. Every provider request must carry a boundary created from a fresh playback snapshot. Unknown playback fails closed.
- Rewinding, changing media, or losing context invalidates conversations and pending responses. Never forward unrestricted chat history or knowledge to a provider.
- Future retrieval must exclude later facts BEFORE model invocation. A prompt is not a safety mechanism. Earlier related media requires verified release order and explicit permission.
- Keep DOM access in `services/video` and `services/adapters`; React consumes typed snapshots. Only implement the generic adapter until site-specific work is requested.
- Use WXT entrypoints and browser APIs through `wxt/browser`; storage belongs in `storage/`. No client API secrets, external AI calls, arbitrary page scraping, analytics, or saved conversations in this MVP.
- Collect only video timing/state, selection/PiP/fullscreen metadata, short video labels/page titles, sanitized page URL, and ephemeral media identity. Media identity is unverified; never imply a movie has been recognized.
- Keep all-frame collectors lightweight and the React UI top-frame only. Route through browser-authenticated tab/frame ports; separate regular/incognito catalogs. Explicit selection must not jump to another video. Query fresh context from the owning frame for sends/replies; invalidate stale context on disconnect, timeout, removal, or rewind. Refresh must respect site access.
- Use strict TypeScript, small modules, React hooks, npm, semantic CSS tokens, accessible controls, and compact dark-first UI. UI CSS stays in Shadow DOM; avoid rem units tied to host-page font sizes.
- Chrome/Edge are primary; keep Firefox MV3 builds working. Do not bypass fullscreen or browser security boundaries.
- Run `npm run check` after substantive changes. It runs lint, typecheck, unit/component tests, formatting, and both browser builds. Run `npm run test:e2e` for injection, video, storage, or UI lifecycle changes (install Chromium with `npm run browser:install`).
- Keep `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `docs/TESTING.md` aligned with actual scripts and behavior. Never claim a manual browser check was run unless it was.
