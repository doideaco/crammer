import {
  getDatabase,
  globalSpendLimitPence,
  globalVideoLimit,
  remainingGlobalVideos,
  spentInWindowPence,
} from "@crammer/db";
import { currentUser } from "@/lib/auth";
import { PromptBox } from "@/components/PromptBox";

const STEPS = [
  ["Research", "Claude searches the web and pulls out checkable facts, each tied to a source."],
  ["Script", "A 700-word narration where every sentence cites the facts it rests on."],
  ["Fact check", "A second pass, with no memory of writing it, rewrites anything unsupported."],
  ["Pictures", "Licensed photography, maps and timelines — checked against what is being said."],
  ["Voice and render", "A voiceover, subtitles, and a 1080p video with its sources attached."],
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; signin?: string }>;
}) {
  const user = await currentUser();
  const { error } = await searchParams;
  const db = getDatabase();
  const [remaining, spent] = await Promise.all([
    remainingGlobalVideos(db),
    spentInWindowPence(db),
  ]);
  const limit = globalVideoLimit();
  const budgetPence = globalSpendLimitPence();
  // Either running out stops generation, so the form goes when the first one does.
  const canGenerate = remaining > 0 && spent < budgetPence;

  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col gap-6">
        <div className="rule" />
        <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-[var(--tracking-display)] sm:text-6xl">
          Understand anything in five minutes.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-ink-soft">
          Crammer turns one prompt into a narrated explainer video — real photography, animated
          maps, a timeline and a voiceover. Every claim traces to a source, and the sources ship
          with the video.
        </p>

        {error ? (
          <p role="alert" className="max-w-2xl rounded-sm border border-accent bg-accent-soft/30 px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}

        <div className="max-w-2xl rounded-sm border border-line bg-paper-soft/50 p-6">
          {canGenerate ? (
            <PromptBox signedIn={Boolean(user)} />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="kicker">Demo limit reached</span>
              <p className="text-ink-soft">
                {remaining > 0
                  ? `This demo has spent its £${(budgetPence / 100).toFixed(2)} budget.`
                  : `This instance is capped at ${limit} generated videos so a public demo cannot run up a bill.`}{" "}
                The finished ones are still there to watch.
              </p>
            </div>
          )}
        </div>
        {canGenerate ? (
          <p className="max-w-2xl text-xs text-ink-muted">
            Demo instance: {remaining} of {limit} generations left, £
            {((budgetPence - spent) / 100).toFixed(2)} of budget. Each one costs about £2.70 and
            takes around ten minutes.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-6">
        <div>
          <span className="kicker">How it works</span>
          <div className="mt-2 rule" />
        </div>
        <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([title, detail], i) => (
            <li key={title} className="flex flex-col gap-1 border-t-2 border-ink pt-3">
              <span className="font-mono text-sm text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-lg font-semibold">{title}</span>
              <span className="text-sm leading-relaxed text-ink-soft">{detail}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
