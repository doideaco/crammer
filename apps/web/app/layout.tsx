import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { signOutAction } from "./actions";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Crammer — five minute explainers",
  description:
    "Turn one prompt into a five minute narrated explainer video, with every claim traced to a source.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Crammer
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              {user ? (
                <>
                  <Link href="/videos" className="hover:text-accent">
                    Your videos
                  </Link>
                  <span className="hidden text-ink-muted sm:inline">{user.email}</span>
                  <form action={signOutAction}>
                    <button type="submit" className="text-ink-muted hover:text-accent">
                      Sign out
                    </button>
                  </form>
                </>
              ) : null}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>

        <footer className="mx-auto max-w-5xl px-6 pb-12 pt-6 text-xs text-ink-muted">
          Every claim in a Crammer video traces to a source, and the sources ship with the
          video.
        </footer>
      </body>
    </html>
  );
}
