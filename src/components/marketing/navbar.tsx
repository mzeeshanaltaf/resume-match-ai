"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { useClientSession } from "@/lib/use-client-session";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function initials(nameOrEmail: string) {
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nameOrEmail.slice(0, 2).toUpperCase();
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useClientSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = pathname === "/";
  const anchor = (id: string) => (isHome ? `#${id}` : `/#${id}`);

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    router.push("/");
    router.refresh();
  }

  const user = session?.user;

  const links = [
    { label: "How it works", href: anchor("desks") },
    { label: "Sample report", href: anchor("report") },
    { label: "Credits", href: anchor("credits") },
    { label: "FAQ", href: anchor("faq") },
    { label: "Contact", href: "/contact" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4">
        <Wordmark />

        {/* Inline links from lg up; below that they live in the menu. */}
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              aria-current={href === pathname ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground underline-offset-[6px] decoration-2 transition-colors hover:text-foreground hover:underline",
                href === pathname && "text-foreground underline",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />

          {/* Account actions, large screens */}
          <div className="hidden items-center gap-2 lg:flex">
            {isPending ? null : user ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      aria-label="Account menu"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-secondary text-xs font-semibold text-foreground">
                          {initials(user.name || user.email || "U")}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="flex flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold">
                        {user.name || "Account"}
                      </span>
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {user.email}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="cursor-pointer">
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="cursor-pointer text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/sign-up">Get started</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="top"
              showCloseButton={false}
              className="gap-0 data-[state=closed]:duration-150 data-[state=open]:duration-200"
            >
              <div className="flex h-14 items-center justify-between border-b border-border px-4 sm:px-6">
                <SheetTitle asChild>
                  <span>
                    <Wordmark href={null} />
                  </span>
                </SheetTitle>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close menu">
                    <X className="h-5 w-5" />
                  </Button>
                </SheetClose>
              </div>
              <SheetDescription className="sr-only">
                Site navigation and account actions
              </SheetDescription>

              <nav aria-label="Menu" className="px-4 py-2 sm:px-6">
                <ul className="divide-y divide-border">
                  {links.map(({ label, href }) => (
                    <li key={label}>
                      <SheetClose asChild>
                        <Link
                          href={href}
                          className="flex min-h-12 items-center text-lg font-semibold"
                        >
                          {label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="flex flex-col gap-2 border-t border-border px-4 py-4 sm:px-6">
                {isPending ? null : user ? (
                  <>
                    <p className="truncate text-sm text-muted-foreground">
                      Signed in as {user.email}
                    </p>
                    <SheetClose asChild>
                      <Button asChild size="lg">
                        <Link href="/dashboard">Go to dashboard</Link>
                      </Button>
                    </SheetClose>
                    <Button variant="outline" size="lg" onClick={handleSignOut}>
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Button asChild size="lg">
                        <Link href="/sign-up">Get started free</Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild variant="outline" size="lg">
                        <Link href="/sign-in">Sign in</Link>
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
