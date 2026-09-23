import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col gap-4">
      <span className="kicker">Not found</span>
      <h1 className="text-3xl font-bold">There is no video here.</h1>
      <p className="text-ink-soft">It may have been deleted, or it belongs to someone else.</p>
      <Link href="/videos" className="text-accent underline">
        Your videos
      </Link>
    </div>
  );
}
