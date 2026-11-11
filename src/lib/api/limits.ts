/**
 * Upload limits shown in the UI and checked in the browser before an upload.
 *
 * These mirror the backend defaults (`MAX_UPLOAD_BYTES`, `MAX_RESUME_PAGES`,
 * `MAX_SCREENING_RESUMES` in `backend/app/config.py`). The backend is the
 * authority and always re-checks; if a deployment changes its limits, change
 * them here too. (The API does not expose them; see handoff.md.)
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);
export const MAX_RESUME_PAGES = 5;
export const MAX_SCREENING_RESUMES = 20;
/** `MAX_JD_CHARS`: pasted posting text (and scraped pages are cut to the same length). */
export const MAX_JD_CHARS = 20_000;

export const RESUME_ACCEPT = ".pdf,.docx,.txt";
export const RESUME_FORMATS_LABEL = "PDF, DOCX or TXT";

const EXTENSIONS = [".pdf", ".docx", ".txt"];

/** Browser-side pre-check. Returns an error message, or null if the file may be uploaded. */
export function checkResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `Only ${RESUME_FORMATS_LABEL} files are supported.`;
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is over the ${MAX_UPLOAD_MB} MB limit.`;
  }
  return null;
}
