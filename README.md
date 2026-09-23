# Crammer

Turns one prompt — "explain the Houthis and the war in Yemen" — into a ~5 minute
narrated explainer video: real images with pan/zoom, animated maps, timelines and
labels, and a voiceover.

It is a narrated slideshow with motion graphics, rendered deterministically by
Remotion. **No generative video models.** Every factual claim traces to a source, and
the sources ship with the video.

## Status

**Milestone 1 (CLI) is complete and verified end to end against live providers.**
`pnpm crammer "<topic>"` runs all seven stages and writes `out/<slug>/video.mp4`. The
web app (M2) and Lambda rendering (M3) are not built yet.

The reference run — "The Houthis and the war in Yemen" — produces a 5:29 video from 23
sources and 55 extracted facts, with every script sentence traced to a fact and every
image carrying its licence through to the end card.

**Image coverage depends on having all three search providers configured.** With only
Wikimedia Commons, generic scenes ("a container ship at sea") often find nothing usable
and the scene falls back to a typographic card. Unsplash and Pexels keys are free and
close most of that gap.

## Quick start

```bash
pnpm install
cp .env.example .env     # then fill in your keys
pnpm build
```

Run the whole thing against mock providers — no keys, no network, no cost:

```bash
pnpm crammer "The Houthis and the war in Yemen" --mock
```

Then for real:

```bash
pnpm crammer "The Houthis and the war in Yemen"
```

Output lands in `out/<slug>/`:

```
video.mp4          the finished 1920x1080 explainer
transcript.txt     the narration as plain text
sources.md         references, image credits and the fact-check report
storyboard.json    the JSON that produced the video
research.json …    one file per stage, for inspection and resuming
assets/            downloaded images and per-scene narration audio
```

## The pipeline

Seven stages, each a pure `(input) => Promise<output>` validated by zod on both sides.
Every stage writes `out/<slug>/<stage>.json`.

| # | Stage | What it does |
|---|---|---|
| 1 | `research` | Screens the topic, then Claude with server-side web search gathers 6–12 sources and extracts checkable facts, each tied to a source id. |
| 2 | `script` | Writes 650–750 words in a fixed six-part structure. Every sentence cites the fact ids it relies on. |
| 3 | `factcheck` | A separate Claude call with no memory of writing the script checks every sentence, then the stage applies the rewrites and re-checks. Too many surviving issues fails the run. |
| 4 | `storyboard` | Splits the narration into 10–25 second scenes, picks a template per scene and writes image search queries. A coverage check enforces that the scenes reproduce the script word for word. |
| 5 | `images` | Wikimedia Commons first, then Unsplash, then Pexels. Permissive licences only. Claude vision scores relevance and rejects graphic content. Nothing acceptable means the scene swaps to a non-photo template rather than showing the wrong picture. |
| 6 | `voice` | ElevenLabs "with timestamps", one call per scene. Word timings drive subtitles; scene lengths come from the real audio. |
| 7 | `render` | Remotion renders the `Explainer` composition at 1920×1080, 30fps. No AI runs here — the storyboard fully determines the output. |

### Resuming and inspecting

```bash
pnpm crammer "topic" --stop-after script     # halt for inspection
pnpm crammer "topic" --from storyboard       # resume from saved output
```

`--from images` and later need only `storyboard.json`; earlier artefacts are not read.
Editing `storyboard.json` by hand and re-running `--from images` is a supported workflow.

### Other flags

```
-l, --level <beginner|intermediate>   how much background to assume
-o, --out <dir>                       output root (default: ./out)
    --no-captions                     render without burn-in subtitles
    --mock                            mock providers: no network, no cost
    --scale <0.1-1>                   render smaller, for quick previews
    --crf <n>                         H.264 quality, lower is better (default 21)
    --concurrency <n>                 parallel render workers
-q, --quiet                           only print the final result
```

## Scene templates

Nine templates, each a React component plus a zod props schema:
`TitleCard`, `PhotoKenBurns`, `PhotoWithLabels`, `MapHighlight`, `WhosWho`, `Timeline`,
`BigStat`, `KeyPoints`, `EndCard`.

Preview every one of them with fixture data:

```bash
pnpm studio
```

Studio registers `Explainer` (a full demo storyboard) plus one `Template-<Name>`
composition per template. To preview a real run, pass its storyboard as props:

```bash
pnpm --filter @crammer/video exec remotion studio src/index.ts
```

Visual style is Swiss/minimal: Inter, an 8px grid, near-black on off-white with one
accent, no shadows or gradients. All tokens live in `packages/video/src/theme.ts`;
templates never hard-code values.

## Layout

```
apps/cli/            the M1 CLI
packages/schema/     zod schemas + inferred types — the single source of truth
packages/providers/  LLM, TTS and image-search clients behind interfaces, plus mocks
packages/pipeline/   the seven stages, prompts, and outputs
packages/video/      the Remotion project: compositions, templates, fixtures
```

`CLAUDE.md` holds the conventions in full.

## Development

```bash
pnpm build       # turbo build across packages
pnpm test        # vitest
pnpm typecheck
pnpm lint
```

The repo compiles with TypeScript 7; the root `typescript` is pinned to 6.0.3 only
because `typescript-eslint` does not yet load against 7. See `CLAUDE.md`.

Tests run entirely against mock providers, so `pnpm test` needs no keys and costs
nothing. The mocks parse their output with the real schemas, so a fixture that would not
survive production fails the test suite.

## Costs

Every run prints a per-stage table of tokens, TTS characters, requests and an estimated
cost. The rates live in `packages/providers/src/cost.ts` and are estimates — check
current provider pricing before relying on them.

A measured full run ("The Houthis and the war in Yemen", Claude Opus 5 + ElevenLabs,
September 2026) came to roughly **£2.70** and about 13 minutes wall-clock:

| stage | cost | notes |
|---|---|---|
| research | £1.46 | Dominates the bill — server-side web search pulled 109 pages through the context. |
| script | £0.27 | Three calls: draft plus two length passes. |
| factcheck | £0.23 | Three calls: check, revise, re-check. |
| storyboard | £0.13 | One call. |
| images | £0.09 | Wikimedia search plus a vision check per slot. |
| voice | £0.50 | 4,257 TTS characters across 17 scenes. |
| render | £0.00 | Local. ~3.5 minutes for 5:29 at 1080p. |

Research is the obvious thing to attack first if this needs to be cheaper — capping
`maxUses` on the web search tool trades breadth for money directly.

## Licences

- Images are only ever used under CC0, public domain, CC BY, CC BY-SA, the Unsplash
  Licence or the Pexels Licence. NC, ND and unknown licences are rejected, and every
  image's attribution flows through to the end card and `sources.md`.
- Wikimedia's API policy requires a descriptive `WIKIMEDIA_USER_AGENT` with contact
  details.
- **Remotion requires a paid company licence for companies above a small size.** Check
  <https://remotion.dev/license> before any commercial launch.

## Safety

- No graphic images of casualties or violence — enforced in the vision check, with maps
  and typographic cards preferred for conflict topics.
- Real-person images only from licensed sources, and only when the narration is about
  that person.
- Contested topics must present the main perspectives fairly; the fact checker reports
  on balance and loaded language.
- Topics that could only be explained by supplying harmful instructional content are
  refused at the research stage.
