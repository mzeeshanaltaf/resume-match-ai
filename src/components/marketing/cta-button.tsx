"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof Button>;

interface CtaButtonProps {
  signedOutLabel: string;
  signedInLabel?: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  withArrow?: boolean;
}

export function CtaButton({
  signedOutLabel,
  signedInLabel = "Go to Dashboard",
  className,
  size,
  variant,
  withArrow = false,
}: CtaButtonProps) {
  const { data: session, isPending } = useSession();
  const signedIn = !!session?.user;

  const href = signedIn ? "/dashboard" : "/sign-up";
  const label = signedIn ? signedInLabel : signedOutLabel;

  return (
    <Button
      asChild
      size={size}
      variant={variant}
      className={className}
      aria-hidden={isPending}
    >
      <Link href={href}>
        {label}
        {withArrow && <ArrowRight className="h-4 w-4" />}
      </Link>
    </Button>
  );
}
