"use client";

import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;

interface PdfViewerProps {
  base64: string;
  fileName?: string;
}

export function PdfViewer({ base64, fileName = "document.pdf" }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [zoom, setZoom] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure width once; disconnect immediately to avoid infinite resize loop
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) {
        setContainerWidth(w);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleDownload() {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pageWidth = containerWidth > 0 ? Math.round(containerWidth * zoom) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {/* Page navigation */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {numPages > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Page {pageNumber} of {numPages}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Zoom + Download */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 ml-1"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      {/* Zero-height sentinel — only for measuring width, never expands */}
      <div ref={containerRef} className="w-full h-0" aria-hidden />

      {/* Scroll container pinned to containerWidth to clip zoomed content */}
      <div
        className="overflow-auto max-h-[60vh] border border-border rounded bg-muted/20"
        style={{ width: containerWidth > 0 ? containerWidth : "100%" }}
      >
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <Document
          file={`data:application/pdf;base64,${base64}`}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setLoading(false);
          }}
          onLoadError={() => setLoading(false)}
          loading={null}
        >
          {pageWidth > 0 && (
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              renderAnnotationLayer={false}
              renderTextLayer={true}
            />
          )}
        </Document>
      </div>
    </div>
  );
}
