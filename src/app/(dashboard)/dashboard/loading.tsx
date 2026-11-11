import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="space-y-px">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-6 border-b border-border py-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
