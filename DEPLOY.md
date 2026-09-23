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

### Email on the free tier

Supabase's built-in SMTP is rate limited to a handful of messages an hour and is not
meant for production. For a demo in front of people, set a custom SMTP provider in
Authentication → Emails, or expect magic links to silently stop arriving.

## 3. Trigger.dev

Create a project at <https://cloud.trigger.dev>, then:

```bash
npx trigger.dev@latest login
npx trigger.dev@latest deploy
```

`trigger.config.ts` already declares what the render stage needs:

- `puppeteer()` puts Chrome at `/usr/bin/google-chrome-stable` and sets
  `PUPPETEER_EXECUTABLE_PATH`, which the render stage picks up — without it Remotion
  downloads a 93MB browser on every cold start.
- `ffmpeg()` provides the system binaries.
- `external` leaves `sharp` and Remotion's platform-specific compositor to the image's
  own install, so it resolves `linux-x64` rather than the `darwin-arm64` copy on a Mac.

Set the same environment variables as Vercel in the Trigger.dev dashboard, **plus** the
provider keys the pipeline needs:

```
ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID, CRAMMER_MODEL
ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
WIKIMEDIA_USER_AGENT, UNSPLASH_ACCESS_KEY, PEXELS_API_KEY
RESEND_API_KEY, CRAMMER_EMAIL_FROM      (optional — otherwise mail goes to the log)
```

Once `TRIGGER_SECRET_KEY` is set on Vercel, the web app triggers runs automatically —
`createJobQueue()` switches from the polling queue to Trigger.dev on its own.

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

## Demo notes

- The daily limit is **3 videos per user**. Raise `DAILY_VIDEO_LIMIT` in
  `packages/db/src/queries.ts` if a demo needs more.
- A run costs roughly **£2.70** and takes about **13 minutes**, so have one made in
  advance rather than generating live in front of an audience.
- `pnpm import:run out/<slug> someone@example.com` puts an existing CLI run into a
  user's library, which is the easy way to seed a demo account.
