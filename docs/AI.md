# Optional grounded AI

Enabling outside context permits extra sources, but does not guarantee an answer. Background currently covers a narrow person-name/occupation lookup anchored in available captions. Earlier works require a separately configured reviewed catalog. Caption-path refusals explain missing name evidence, unavailable lookups, and missing or unmatched earlier-work sources; they never use unrestricted model knowledge to fill the gap.

The default extension uses a local mock. The AI build uses **Groq's `openai/gpt-oss-120b` with `service_tier: on_demand`**, accessed by a local Node gateway. This avoids bundling a local model runtime or requiring a GPU. It needs a **Groq API key**, not an OpenAI API key. The model selects evidence, writes a short answer from that selection, and reviews each sentence's support in a separate request. This is an inference workflow, not fine-tuning.

The AI build answers from **captions observed during playback**, without claiming movie recognition. Turn on the player's captions, let it play, and check the widget's excerpt count before asking. Past captions can also be recovered after seeking when the player exposes a currently showing native subtitle track. Unavailable tracks and silent visuals cannot be reconstructed. Recovery does not guarantee a full transcript; see Details for capability and limits. Answers use complete sentences; **Sources** under each answer reveals original captions or external evidence and timestamps. A caption's first-person speaker is not automatically the named person in a question. See [platform coverage](PLATFORMS.md).

On the local fixture, click **Enable caption demo**, play briefly, open WDIM, and ask **What is Mira holding?** These fictional captions are displayed over a landscape; they do not describe people visible in the animation.

## Setup

Use Node 22.18+ and run commands from the repository root. Substitute `npm.cmd` in PowerShell when needed.

1. Copy `server/.env.example` to `server/.env` only if the private file does not already exist. Put the key in `GROQ_API_KEY` in **`server/.env`**. The template must remain blank; the private file is git-ignored.
2. Run `npm run build:ai`. Load `.output/chrome-mv3` in Chrome/Edge as an unpacked extension, or reload it if already installed.
3. Copy the extension ID from `chrome://extensions` (or `edge://extensions`) into `WDIM_EXTENSION_ORIGINS=chrome-extension://YOUR_ID` in `server/.env`. Use comma-separated exact origins for multiple installations. No wildcard is allowed.
4. Run `npm run ai:server` in a separate terminal. It listens only on `http://127.0.0.1:8787`. Refresh open video pages after reloading the extension.

`npm run build:ai:firefox` creates the optional Firefox build. Its origin must use the actual installation UUID: `moz-extension://UUID`. Firefox interactions and its origin behavior still require a manual pass. The default `build`, `dev`, and `check` commands select mock mode; default builds overwrite the same output directories, so rebuild with `build:ai` afterward when testing AI mode.

The server key is never part of the extension build or browser storage. Do not paste it into chat, commit it, or put it in a `VITE_`/`WXT_` variable. Rotate any key that was exposed in a template, log, or shared output.

## Catalog and safety contract

Observed captions work without a catalog. `WDIM_KNOWLEDGE_FILE` optionally supplies a trusted story catalog for independently verified media/timelines; captions do not upgrade the generic clock to verified. Paths resolve from the process working directory. `server/knowledge.example.json` is synthetic schema data, not recognition of the landscape video.

Each asset supplies `mediaId`, `durationSeconds`, and facts containing `mediaId`, `revealedAtSeconds`, and `text`. Every fact must contain only information already revealed at its annotated timestamp. Schema checks cannot establish annotation truth. Do not import an unrestricted synopsis or mark a generic player verified to bypass the requirement.

For a verified request, the server excludes future and foreign facts before invoking Groq, takes up to 32 eligible facts, and accepts at most four selected IDs. The extension validates returned facts against the original boundary and rechecks fresh playback before displaying them. Unknown identity/timing, rewinds, changes of media, and stale replies fail closed. Confirmed ads suspend requests; automatic ad recognition is not implemented by the generic adapter.

Future/foreign facts are removed before any model request. Drafts are limited to four claims of at most 500 characters, with valid citation indexes into the selected facts. A claim cannot mix current captions with background or earlier-work evidence. A separate review checks each claim against its cited facts and the question; failed or incomplete support withholds the answer. Reasoning, invented URLs, tools, and chat history never render. The same model performs writing and review in independent requests; this is not an independent oracle. Schema/citation checks are deterministic, but semantic review is probabilistic and can miss hallucinations or incorrect attribution. It cannot guarantee that a paraphrase is entailed or repair incorrect source facts.

Successful answers normally require three Groq requests (select, write, review); an early refusal requires only selection. Each request has a 12-second limit, within a 40-second gateway budget, with outer cancellation at 42/45 seconds. Rewind, ads, context loss, and disconnect still cancel the entire workflow. A legacy selection-only gateway displays a fixed explanation and expandable evidence, never unreviewed generated prose.

## Privacy and validation

The gateway receives the question, fresh boundary, platform asset ID when available, context options, and up to 64 selected-session caption excerpts (16,000 characters total). Groq receives eligible evidence and the question/boundary. Caption timestamps mean **when text was observed**, or the conservative **cue end** for recovered native subtitles, not verified story time. Local recovery retains at most 6,000 cues / 256,000 characters; question-based lexical retrieval selects the bounded provider payload. Page titles, browsing URLs, and chat history are not forwarded. Caption buffers are bounded and memory-only; rewind, media/context loss, and observed ad/seek suspension clear them. Catalog broadcasts contain counts/status only; authenticated fresh reads return the selected video's excerpts. Incognito AI requests are rejected.

The gateway keeps no request logs or saved conversations; only transient rate-limit counters are retained. Groq retention is separate; review [Groq data handling](https://console.groq.com/docs/your-data) and account settings before sending sensitive content.

## Related context

Open **Details → Related context** to find these options. Both default off and stay session-local:

- **Sourced background:** “Who is Khoai Lang Thang?” can look up that name on Wikidata only if it occurs in captured captions. A unique exact label/alias and a human entity are required. Only a small allowlist of creative occupations is returned; article prose, filmographies, cast roles, plots, and fictional identities are excluded. A name match is explicitly not proof of the person shown. Only the name goes to Wikidata, never the transcript or viewing URL. Ambiguous/missing matches and network errors add no facts.
- **Earlier works:** permits reviewed source entries tied to the current platform asset, with a topic already mentioned and strictly earlier release order in the same verified series. These may spoil those earlier works, as the checkbox states. Sequels, equal/unknown orders, unrelated works, and unrequested topics are excluded.

Set `WDIM_RELATED_CONTEXT_FILE` to an operator-reviewed JSON file with `{ "version": 1, "entries": [...] }`. Each entry has `assetId` (for example `youtube:VIDEO_ID`), `topic`, `kind` (`background` or `earlier-work`), `text`, `label`, `url` (HTTPS), `series`, `currentRelease`, and `sourceRelease`. The final three are null for general background; earlier works require a reviewed same-series relationship and finite numeric orders with `sourceRelease < currentRelease`. The operator must verify the asset association and limit text to non-story background or the earlier work, without later-work commentary. Schema validation cannot prove editorial truth. This catalog contains reviewed facts derived from cited online sources, not arbitrary URL fetching.

Outside facts are separately labeled. Online metadata and curated relationships can be wrong. General web/plot search is unavailable because arbitrary synopses have no trustworthy reveal-time annotations. Broader research requires verifiable source boundaries, not an LLM's assurance that its prose is safe.

The gateway's Origin/Host checks and loopback binding support trusted local development. It is not designed for public hosting or untrusted local clients. Do not expose it through a tunnel or change its bind address without designing authentication and deployment controls.

```sh
npm run test:e2e:ai
npm run test:e2e:ai:live
```

The first command uses a fake model; the second exercises four logical questions with synthetic evidence, normally eight potentially billable Groq requests (two supported answers through all three stages and two early refusals). Both exercise the caption-to-chat UI, collapsed sources, and verified-catalog gateway contract. Stop a running gateway on port 8787 first. See [TESTING.md](TESTING.md) for coverage and limits.

Model configuration follows Groq's [service tiers](https://console.groq.com/docs/service-tiers) and [structured outputs](https://console.groq.com/docs/structured-outputs). Structured JSON constrains format; application checks and trusted evidence constrain what can be shown.
