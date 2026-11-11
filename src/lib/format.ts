import type { ResumeOut } from "@/lib/api/types";

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "2 pages · 84 KB · added Nov 11, 2026" for a stored resume. */
export function resumeMeta(r: ResumeOut): string {
  const parts: string[] = [];
  if (r.num_pages) parts.push(plural(r.num_pages, "page"));
  if (r.file_size) parts.push(formatSize(r.file_size));
  if (r.created_at) parts.push(`added ${formatDate(r.created_at)}`);
  return parts.join(" · ");
}

/** Signed credit amount with a real minus sign: "+10", "−1". */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/** True when a phrase is short enough to wear a hand-drawn mark. */
export function isShort(text: string | null | undefined, max = 40): text is string {
  return !!text && text.length <= max;
}
