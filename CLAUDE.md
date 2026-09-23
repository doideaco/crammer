# Crammer — project conventions

Crammer turns one prompt into a ~5 minute narrated explainer video: real images with
pan/zoom, animated maps, timelines and labels, plus a voiceover. It is a narrated
slideshow with motion graphics, rendered deterministically by Remotion. **No generative
video models.**

## Principles (these are not negotiable)

1. **Video as code.** Every video is a `Storyboard` JSON rendered by Remotion.
2. **Accuracy is the product.** Every factual claim traces to a source. Sources ship with
   the video (`sources.md` + `EndCard`).
3. **Deterministic rendering.** The same storyboard JSON always renders the same video.
   All AI work happens *before* render. Never call an API from a Remotion component.
4. **Every stage is inspectable.** Each pipeline stage writes `out/<slug>/<stage>.json`.
5. **Licences tracked from day one.** Every image carries source, licence and attribution
   through to the end card.

## Repo layout

```
apps/cli/          M1 CLI: `pnpm crammer "topic"` -> out/<slug>/video.mp4
apps/web/          M2 Next.js app
packages/schema/   zod schemas + inferred types. THE single source of truth.
packages/providers/ LLM, TTS, image-search clients behind interfaces (+ mocks)
packages/pipeline/ research, script, fact-check, storyboard, images, voice, render
packages/video/    Remotion project: compositions + scene templates
jobs/              M2 stage runner, artefact store, worker, Trigger.dev tasks
packages/db/       M2 Drizzle schema, migrations, queries. All DB access lives here.
out/               CLI output (gitignored)
```

## Hard rules

- **All pipeline data goes through zod.** Every stage is
  `(input: In) => Promise<Out>` and parses its input and output with a schema from
  `@crammer/schema`. Never hand-roll a type that should live in the schema package.
- **Templates use theme tokens only.** Components in `packages/video/src/templates` must
  import from `../theme` — no hard-coded colours, font sizes, spacing or radii.
- **Prompts live in `packages/pipeline/src/prompts/*.ts`** as exported functions that
  return strings. Never inline a prompt at a call site.
- **Providers are interfaces.** `packages/providers` exports an interface plus a real and
  a mock implementation for each of LLM, TTS and image search. Pipeline stages depend on
  the interface only, so tests run with mocks and no network.
- **Stage artefacts are immutable.** `out/<slug>/<stage>.json` is what that stage
  produced and nothing later may overwrite it — that is what makes `--from` repeatable.
  The finished storyboard ships as `final.json`.
- **The cache lives outside `assetDir`.** `out/.cache/{images,audio}` is keyed by
  content hash. `assetDir` is Remotion's `publicDir` and is copied into every bundle, so
  it must hold only what the current storyboard references.
- **Asset paths are relative.** `ImageAsset.localPath` and `SceneAudio.path` are relative
  to the run's asset root (Remotion `publicDir`), e.g. `images/ab12.jpg`. Templates use
  `staticFile()`. Never put an absolute path in a storyboard.
- **Relative imports carry a `.js` extension** in `schema`, `providers`, `pipeline` and
  `cli` (NodeNext). `packages/video` uses bundler resolution and omits extensions.
- **All database access lives in `packages/db`.** Nothing else imports `drizzle-orm`.
  A stage or a page that needs a query gets a function added there, so there is one
  place to look for what touches which table.
- **Stages must not assume a shared filesystem.** Each is an independently retryable
  task that may run on a different machine, so intermediate JSON and binary assets go
  through the `ArtifactStore`, never a path agreed by convention.
- **The web app never uses the service role.** Requests use the anon key so RLS applies;
  the service role belongs to workers only.
- **Never commit keys.** Everything goes through `.env` / `.env.example`.

## Adding a scene template

1. Add the props schema to `packages/schema/src/templates.ts` and register it in the
   `Scene` discriminated union in `storyboard.ts`.
2. Add the component in `packages/video/src/templates/<Name>.tsx`, theme tokens only.
3. Register it in `packages/video/src/templates/index.ts`.
4. Add a fixture in `packages/video/src/fixtures/` so it shows in Remotion Studio.
5. Add a props-schema unit test in `packages/schema/src/__tests__/`.
6. Add the template's one-line description to `TEMPLATE_DESCRIPTIONS` so the storyboard
   prompt can choose it.

## Safety rules enforced in code

- No graphic images of casualties or violence — enforced in the vision check
  (`packages/pipeline/src/stages/images.ts`); prefer maps/places for conflict topics.
- Real-person images only from licensed sources, and only when the narration is about
  that person.
- Only permissive licences: CC0, public domain, CC BY, CC BY-SA, Unsplash, Pexels.
  Reject NC, ND and unknown.
- The research stage refuses topics requiring harmful instructional content.
- The fact-check stage must confirm major perspectives are represented on contested
  topics and that loaded language is avoided.

## Commands

```bash
pnpm build                        # turbo build all packages
pnpm test                         # vitest across packages
pnpm typecheck
pnpm crammer "The Houthis and the war in Yemen"
pnpm crammer "topic" --from storyboard        # resume from a saved stage
pnpm crammer "topic" --stop-after script      # halt for inspection
pnpm studio                       # Remotion Studio with fixtures

supabase start                    # local Postgres, auth, storage, Mailpit
pnpm db:migrate                   # apply migrations
pnpm db:generate                  # generate a migration after a schema change
pnpm sync:env                     # copy keys from .env into apps/web/.env.local
pnpm web                          # Next.js on :3000
pnpm worker                       # claim queued videos and run them
CRAMMER_MOCK=1 pnpm worker        # same, against mocks: no network, no cost
```

## Licence note

Remotion requires a paid company licence for companies above a small size.
Check https://remotion.dev/license before any commercial launch.

## TypeScript versions

The repo compiles with **TypeScript 7**, declared in each package's own
`devDependencies`. The **root** `typescript` is pinned to **6.0.3** because
`typescript-eslint` refuses to load against TS 7 and resolves `typescript` as a peer
from the root. The two live side by side: `tsc` inside a package resolves to 7, ESLint
at the root resolves to 6.

Remove the root pin once `typescript-eslint` supports TS 7
(<https://github.com/typescript-eslint/typescript-eslint/issues/10940>) — nothing else
depends on the split.
