"use client";

import { useActionState } from "react";
import { createVideoAction, type FormState } from "@/app/actions";

const LEVELS = [
  { value: "beginner", label: "Beginner", hint: "Assumes no background at all." },
  { value: "intermediate", label: "Intermediate", hint: "For someone who follows the news." },
] as const;

/**
 * The prompt box.
 *
 * When nobody is signed in it also asks for an email and sends a magic link, keeping
 * the topic — one form, one intention, rather than bouncing through a sign-in page and
 * making them type it again.
 */
export function PromptBox({
  signedIn,
  defaultTopic = "",
  parentVideoId,
  compact = false,
}: {
  signedIn: boolean;
  defaultTopic?: string;
  parentVideoId?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createVideoAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      {parentVideoId ? <input type="hidden" name="parentVideoId" value={parentVideoId} /> : null}

      <label className="flex flex-col gap-2">
        <span className="kicker">{compact ? "Go deeper" : "What should we explain?"}</span>
        <textarea
          name="topic"
          required
          rows={compact ? 2 : 3}
          defaultValue={defaultTopic}
          placeholder="The Houthis and the war in Yemen"
          className="w-full resize-none rounded-sm border border-line bg-white px-4 py-3 text-lg leading-snug outline-none placeholder:text-ink-muted/60 focus:border-accent"
        />
      </label>

      {compact ? null : (
        <fieldset className="flex flex-col gap-2">
          <legend className="kicker mb-2">How much do you already know?</legend>
          <div className="flex flex-wrap gap-3">
            {LEVELS.map((level, i) => (
              <label
                key={level.value}
                className="flex cursor-pointer items-start gap-2 rounded-sm border border-line bg-white px-4 py-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft/30"
              >
                <input
                  type="radio"
                  name="level"
                  value={level.value}
                  defaultChecked={i === 0}
                  className="mt-1 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="block font-semibold">{level.label}</span>
                  <span className="block text-ink-muted">{level.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {signedIn ? null : (
        <label className="flex flex-col gap-2">
          <span className="kicker">Your email</span>
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-sm border border-line bg-white px-4 py-3 outline-none placeholder:text-ink-muted/60 focus:border-accent"
          />
          <span className="text-xs text-ink-muted">
            We will send a sign-in link and email you when the video is ready. No password.
          </span>
        </label>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-ink px-6 py-3 font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Starting…" : signedIn ? "Make the video" : "Send me a link"}
        </button>
        <span className="text-xs text-ink-muted">Takes about ten minutes.</span>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-sm border border-accent bg-accent-soft/30 px-4 py-3 text-sm">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="rounded-sm border border-line bg-white px-4 py-3 text-sm">
          {state.notice}
        </p>
      ) : null}
    </form>
  );
}
