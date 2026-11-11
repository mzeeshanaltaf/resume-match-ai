import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { Strike } from "@/components/proof";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-4 py-4 sm:px-6 lg:px-8">
        <Wordmark />
      </header>
      <main className="flex flex-1 items-center px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-[clamp(6rem,22vw,13rem)] font-bold leading-[0.9] tracking-[-0.04em]">
            <Strike immediate duration={0.9} strokeWidth={0.7} className="px-[0.05em]">
              404
            </Strike>
          </p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            That page is not in this document.
          </h1>
          <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
            The link may be old or mistyped. Go back to the start, or to your
            dashboard if you are signed in.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/">Back to the home page</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
