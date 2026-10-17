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

Displayed captions remain bounded to 64 observations and 16,000 characters per video. In addition, after `seeked` and on a fresh selected-frame read, WDIM can recover past subtitles from one browser-exposed, currently showing native TextTrack. Cue start/end metadata is checked before text is read; only cues ending at or before the fresh player boundary qualify. Straddling and future cue text is not read by recovery. Native recovery inspects at most 10,000 cue timings and retains up to 6,000 completed cues / 256,000 characters in memory. Reused track objects after a media-identity change are excluded until replaced. Multiple showing tracks, hidden/disabled tracks, loading, ads, seeking, or clock mismatch fail closed.

An exposed track may itself be partial or loaded in segments. WDIM reports recovered/partial/unavailable capability, never guaranteed whole-video coverage. This native capability applies on any of the five platforms only when the actual player exposes such a track; the platform DOM readers still capture displayed text only. In particular, the YouTube DOM reader does not download or reconstruct a transcript. A single timestamped caption still may not identify its speaker.

Before a provider request, `domain/spoilers/caption-retrieval.ts` filters by the boundary, ranks matching question terms with nearby context, and caps the request at 64 excerpts / 16,000 characters. This can recover old relevant cues but is lexical retrieval, not exhaustive or cross-language semantic search. Broad recaps may omit parts. Sources show observation time for displayed captions and cue-end availability for recovered subtitles. Nothing is saved to disk.

Rewind, media/context loss, seeking, observed ad markers, and uncertain clock/duration clear the relevant buffer and invalidate stale work. Unchanged stale caption text after a seek is suppressed until it updates. WDIM never pauses/seeks the player, skips ads, enables captions, or intercepts its network requests.

Ad markers are supplemental suspension signals; their absence does not certify an ad-free story timeline. This path uses displayed text or eligible past subtitle cues. It cannot reconstruct unavailable subtitles or silent visuals, identify a person visually, or guarantee the source captions are correct or spoiler-free. DOM observations do not certify story-time alignment.

In caption-only AI mode, a duration discontinuity starts a new ephemeral, unverified session once finite raw timing is available. Old captions/conversations are discarded and unchanged stale text is suppressed. This permits observing new captions after an ad/content transition without claiming continuity or story mapping. The default mock's conservative duration-uncertainty latch and all verified-story retrieval requirements remain unchanged.

## Source basis

- Display observation uses [TextTrack.activeCues](https://developer.mozilla.org/en-US/docs/Web/API/TextTrack/activeCues). Recovery uses [TextTrack.cues](https://developer.mozilla.org/en-US/docs/Web/API/TextTrack/cues) timing metadata and reads only eligible completed cue text.
- YouTube's [caption download endpoint](https://developers.google.com/youtube/v3/docs/captions/download) requires edit permission; it is not a general viewer transcript service for WDIM.
- Scoped YouTube/Netflix/Prime/Disney selectors are corroborated by a subtitle tool's [documented selectors](https://github.com/ChenYCL/chrome-extension-udemy-translate/blob/main/README.md); Disney lines also appear in the author's [caption reader example](https://github.com/johnlindquist/kit/discussions/695). These sources do not establish current live compatibility.
- Related names use the [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API). Article summaries and plots never enter the model.

## Manual release gate

Use authorized accounts to check each actual player: captions on/off, language changes, episode navigation, seek/rewind, ads, PiP/fullscreen, and source replacement. Verify counts match displayed captions and future/hidden text never reaches provider input. Leave unsupported account/region/player variants labeled unavailable. Local fixture tests are not a substitute for this pass.
