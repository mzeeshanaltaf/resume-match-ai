"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, isAbortError } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";

const PdfViewer = dynamic(
  () => import("@/components/pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

export type PreviewTarget = {
  id: string;
  fileName: string;
  mimeType: string | null;
};

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Loads the original resume file through the API when opened (files are
 * private; there is no public URL). PDFs render inline; DOCX and TXT can only
 * be downloaded.
 */
export function ResumePreviewDialog({
  target,
  onClose,
}: {
  target: PreviewTarget | null;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    setLoading(true);
    api.resumes
      .file(target.id, controller.signal)
      .then((b) => setBlob(b))
      .catch((err) => {
        if (isAbortError(err)) return;
        toast.error(describeError(err, "Could not load this resume."));
        onClose();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      setBlob(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const isPdf = target?.mimeType === "application/pdf";

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold truncate">
            {target?.fileName ?? "Resume Preview"}
          </DialogTitle>
        </DialogHeader>
        {loading || !blob ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isPdf ? (
          <PdfViewer file={blob} fileName={target?.fileName} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Preview is only available for PDF files. Download the original to open it.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => target && saveBlob(blob, target.fileName)}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
