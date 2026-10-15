# Caption and platform coverage

WDIM shares a spoiler policy and caption pipeline across five priority platforms and generic HTML5 players. Exact hostname matching prevents lookalike-domain identification. A platform asset ID can associate reviewed sources; it is not movie recognition or proof of story timing.

| Platform    | Caption input implemented                                                   | Validation / limits                                                                                                        |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| YouTube     | Displayed TextTracks; visible caption segments in the selected player       | Reader fixtures and ad-marker blocking tested. No full transcript downloads. Live player/account variants need validation. |
| Netflix     | Displayed TextTracks; visible timed text in the selected watch player       | Reader fixtures tested. No private API or DRM access. Live account validation pending.                                     |
| Hulu        | Displayed TextTracks; compatible Video.js captions                          | Capability fallback; no validated proprietary Hulu DOM reader. Other renderers remain unavailable.                         |
| Disney+     | Displayed TextTracks; visible subtitle lines in supported player containers | Reader fixtures tested. Shadow/custom-element variants may be unavailable. Live account validation pending.                |
| Prime Video | Displayed TextTracks; visible SDK player captions                           | Reader fixtures tested. Ambiguous multi-player containers fail closed. Live account validation pending.                    |
| Other sites | Displayed TextTracks; visible Video.js captions                             | Requires browser site access and readable captions. No access-control/ad bypasses.                                         |

DOM selectors are best-effort compatibility rules, not stable platform APIs. Missing captions never authorize reading the whole page. Multiple videos in a caption container disable that DOM path. No arbitrary body text, comments, recommendations, hidden transcripts, pixels, audio, cookies, or DRM data are collected.

## Timing and missing information

Only displayed active cues or visible caption surfaces are read. Full cue lists containing future transcript text are never traversed. Excerpts are timestamped when observed and filtered against fresh playback before each model call. Capture and requests are bounded to the latest 64 observations and 16,000 characters per connected video. The UI shows the oldest retained observation; it is not a full viewing transcript. Captions/conversations are never saved to disk.

Rewind, media/context loss, seeking, observed ad markers, and uncertain clock/duration clear the relevant buffer and invalidate stale work. Unchanged stale caption text after a seek is suppressed until it updates. WDIM never pauses/seeks the player, skips ads, enables captions, or intercepts its network requests.

Ad markers are supplemental suspension signals; their absence does not certify an ad-free story timeline. This path answers only from text already displayed. It cannot reconstruct skipped scenes, identify a person visually, or guarantee the source captions are correct or spoiler-free. DOM observations do not certify story-time alignment.

In caption-only AI mode, a duration discontinuity starts a new ephemeral, unverified session once finite raw timing is available. Old captions/conversations are discarded and unchanged stale text is suppressed. This permits observing new captions after an ad/content transition without claiming continuity or story mapping. The default mock's conservative duration-uncertainty latch and all verified-story retrieval requirements remain unchanged.

## Source basis

- Native access uses [TextTrack.activeCues](https://developer.mozilla.org/en-US/docs/Web/API/TextTrack/activeCues), not the complete cue list.
- YouTube's [caption download endpoint](https://developers.google.com/youtube/v3/docs/captions/download) requires edit permission; it is not a general viewer transcript service for WDIM.
- Scoped YouTube/Netflix/Prime/Disney selectors are corroborated by a subtitle tool's [documented selectors](https://github.com/ChenYCL/chrome-extension-udemy-translate/blob/main/README.md); Disney lines also appear in the author's [caption reader example](https://github.com/johnlindquist/kit/discussions/695). These sources do not establish current live compatibility.
- Related names use the [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API). Article summaries and plots never enter the model.

## Manual release gate

Use authorized accounts to check each actual player: captions on/off, language changes, episode navigation, seek/rewind, ads, PiP/fullscreen, and source replacement. Verify counts match displayed captions and future/hidden text never reaches provider input. Leave unsupported account/region/player variants labeled unavailable. Local fixture tests are not a substitute for this pass.
