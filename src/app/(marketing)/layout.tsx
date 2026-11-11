import { reenieBeanie } from "@/lib/fonts";

/**
 * The marketing surfaces use the editor's handwriting for margin notes. The
 * grotesque and the serif come from the root layout (the dashboard needs them
 * too); Phase 6 loads the hand in the dashboard layout for report annotations.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={reenieBeanie.variable}>{children}</div>;
}
