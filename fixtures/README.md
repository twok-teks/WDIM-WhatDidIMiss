# Local video fixture

**AI caption demo:** click **Enable caption demo** on the fixture. This adds a displayed native caption track with a fictional envelope story over the landscape animation; it does not claim the animation depicts those events. Play briefly, then ask **What is Mira holding?** The later reveal at 1:00 cannot enter the observed-caption window before it is displayed. Rewinding clears captured context and answers.

`sample.webm` is an original, generated 90-second silent animation (VP8, 960×540, 1 fps). It is bundled here so seeking and finite duration work offline. It contains simple landscape geometry, an elapsed-time label, and a progress line, not movie content. No external media host, license dependency, or runtime generator is involved. This directory is excluded from extension builds by WXT's normal entrypoint/public-directory rules.

Run `npm run fixture` and visit **http://localhost:3000**. `npm run dev` already starts this server. Only one process can own port 3000.

To regenerate the asset after installing dependencies and the browser:

```sh
npm run browser:install
node scripts/generate-fixture.mjs
```

The generator uses Playwright Chromium to draw canvas frames and Playwright's bundled FFmpeg to encode them. Normal development and testing do not regenerate the video. The server supports byte-range requests, which browsers need for reliable media seeking. It binds to loopback (127.0.0.1) and exposes an explicit fixture-file allowlist. Both localhost and 127.0.0.1 reach it, providing different origins without an external server.

**http://localhost:3000/players.html** is the detection lab. Add cross-origin, srcdoc, open/closed shadow-root, and hidden playing videos. The cross-origin player includes native PiP and seek controls. Open another video tab, then use WDIM's **Video** selector and **Refresh videos**. Removing a pinned player should show it as unavailable instead of switching to a different one. These are representative player structures; no third-party streaming-site compatibility is claimed.
