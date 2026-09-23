# Deploying Crammer

Three pieces, because no single host runs all of it:

| Piece | Where | Why not elsewhere |
|---|---|---|
| Web app | Vercel | — |
| Postgres, auth, storage | Supabase | — |
| The pipeline worker | Trigger.dev | **Not Vercel.** Render alone takes ~3.5 minutes and the full pipeline ~13, driving headless Chrome and ffmpeg. Vercel Functions cap at 300s. |

That last row is the whole reason this is three services rather than one.

---

## 1. Supabase

Create a project at <https://supabase.com/dashboard>, then:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # applies packages/db/migrations
```

If `db push` does not pick up the Drizzle migrations, apply them directly:

```bash
DATABASE_URL="<your pooler connection string>" pnpm db:migrate
```

**Auth redirect URLs.** In Authentication → URL Configuration, set the site URL to your
Vercel domain and add `https://<your-domain>/auth/callback` to the redirect allow-list.
Supabase silently falls back to the site URL for any redirect not on that list, which
lands people on the homepage with no session — this is the single most likely thing to
break.

**Storage.** The buckets (`crammer-work`, `crammer-videos`) are created automatically by
the worker on first run.

Copy from Project Settings → API: the project URL, the anon key, and the service role
key. From Project Settings → Database: the connection string.

## 2. Vercel

```bash
vercel login
vercel link                # from the repo root
```

**Set the Root Directory to `apps/web`** in Project Settings. This is the one setting
that cannot live in the repo, and without it the build fails with "No Next.js version
detected" — Vercel looks for `next` in the root `package.json`, which in a monorepo does
not have it. Everything else is in `apps/web/vercel.json`.

Then add environment variables (Production and Preview):

```
DATABASE_URL                      your Supabase pooler connection string
SUPABASE_URL                      https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY         (server only — never expose this)
NEXT_PUBLIC_SUPABASE_URL          https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     the anon key
NEXT_PUBLIC_SITE_URL              https://<your-domain>
TRIGGER_SECRET_KEY                from Trigger.dev, step 3
```

The web app never touches the service role key in a request path — it is there only so
the auth callback can create a video row. Requests use the anon key so RLS applies.

```bash
vercel deploy --prod
```

Two things that are not obvious and will bite:

- **Turn off Deployment Protection.** New projects default to Vercel SSO, so every
  visitor is bounced to a Vercel login and the demo is unreachable. Project Settings →
  Deployment Protection → Vercel Authentication → Disabled. The app has its own
  magic-link auth; nothing is exposed by turning this off.
- **The pooler hostname is region-specific** and is not `db.<ref>.supabase.co` — that
  name has no IPv4 record. Copy the exact string from Project Settings → Database →
  Connection Pooling. For London it is `aws-0-eu-west-2.pooler.supabase.com`, and the
  user is `postgres.<project-ref>`.

### Email — do this before anyone else uses it

Supabase's built-in sender is rate limited to a handful of messages an hour and is
explicitly not for production. It fails silently: no error in the app, no error in
Supabase, the magic link simply never arrives. Nobody can sign in, and there is nothing
to look at.

Point it at a real provider:

```bash
SUPABASE_PROJECT_REF=<ref> RESEND_API_KEY=<key> CRAMMER_EMAIL_FROM="Crammer <no-reply@yourdomain.com>"   pnpm smtp:set
```

Resend's `onboarding@resend.dev` sender works without a verified domain, which is
enough for a demo. Send yourself a magic link afterwards and confirm it arrives —
this is the single most likely thing to be quietly broken.

**If a link is needed right now and email is not working**, one can be minted directly:

```bash
curl -s -X POST "https://<ref>.supabase.co/auth/v1/admin/generate_link"   -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"   -H "Content-Type: application/json"   -d '{"type":"magiclink","email":"you@example.com","redirect_to":"https://<domain>/auth/callback"}'
```

Note `redirect_to` is a top-level field; putting it under `options` is silently ignored
and you get a link back to the site root with no session.

## 3. Trigger.dev

At <https://cloud.trigger.dev>: create an **organisation**, then a **project** inside it.
Copy the project ref from the project's settings — it looks like `proj_abcdefghijkl`.

There is no API for creating either, so this part cannot be scripted.

```bash
npx trigger.dev@latest login
TRIGGER_PROJECT_REF=proj_… npx trigger.dev@latest deploy
```

Run the deploy with the repo's `.env` loaded — `set -a && . ./.env && set +a` — because
`syncEnvVars` in `trigger.config.ts` copies the provider keys into the Trigger.dev
environment as part of the deploy. It pushes an explicit list, not everything in scope.
Without that, every task fails on a missing `ANTHROPIC_API_KEY` and the keys have to be
pasted into the dashboard one at a time.

`trigger.config.ts` already declares what the render stage needs:

- `puppeteer()` puts Chrome at `/usr/bin/google-chrome-stable` and sets
  `PUPPETEER_EXECUTABLE_PATH`, which the render stage picks up — without it Remotion
  downloads a 93MB browser on every cold start.
- `ffmpeg()` provides the system binaries.
- `external` leaves `sharp` and Remotion's platform-specific compositor to the image's
  own install, so it resolves `linux-x64` rather than the `darwin-arm64` copy on a Mac.

Finally, take the secret key from the project's API keys page and give it to Vercel:

```bash
printf '%s' 'tr_prod_…' | vercel env add TRIGGER_SECRET_KEY production --force
vercel deploy --prod
```

With `TRIGGER_SECRET_KEY` set, `createJobQueue()` switches from the polling queue to
Trigger.dev on its own — no code change.

### The untested part

Remotion inside a Trigger.dev container is the one thing not verified locally. If the
render task fails, the likely causes in order:

1. **Wrong compositor binary.** Check the task log for `@remotion/compositor-` — it must
   resolve `linux-x64-gnu`, not `darwin-arm64`.
2. **Chrome not found.** Confirm `PUPPETEER_EXECUTABLE_PATH` is set in the task
   environment; the render stage logs which browser it is using.
3. **Out of memory.** 1080p rendering is memory-hungry. Raise the machine size on the
   render task, or lower `concurrency` in the render options.
4. **Timeout.** The render task allows 3600s; a 5-minute video took ~3.5 minutes
   locally, so there is headroom, but a bigger machine is the fix if not.

## Alternative: a worker on a VM

If Trigger.dev proves awkward, the polling worker is already proven — it made every
video in this repo. Run `pnpm worker` in any container with Chrome and ffmpeg, pointed
at the same `DATABASE_URL` and Supabase keys. Leave `TRIGGER_SECRET_KEY` unset and the
web app will queue rows for it instead.

## Cost controls

A clean run is about £2.70, dominated by research (£1.46). Set a billing limit on the
Trigger.dev account — it will not cap Anthropic or ElevenLabs charges, but it stops
runaway task execution.

In the app itself, deterministic failures are not retried and each video has a hard
spend ceiling (`CRAMMER_MAX_PENCE_PER_VIDEO`, default 600 pence). See the README for
what counts as deterministic and why.

## Demo notes

- The daily limit is **3 videos per user**. Raise `DAILY_VIDEO_LIMIT` in
  `packages/db/src/queries.ts` if a demo needs more.
- A run costs roughly **£2.70** and takes about **13 minutes**, so have one made in
  advance rather than generating live in front of an audience.
- `pnpm import:run out/<slug> someone@example.com` puts an existing CLI run into a
  user's library, which is the easy way to seed a demo account.
