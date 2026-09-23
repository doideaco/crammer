import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col gap-4">
      <span className="kicker">Not found</span>
      <h1 className="text-3xl font-bold">This link does not work.</h1>
      <p className="max-w-xl text-ink-soft">
        It may have been revoked, or the video may not have finished. Share links only resolve
        for finished videos.
      </p>
      <Link href="/" className="text-accent underline">
        What is Crammer?
      </Link>
    </div>
  );
}
