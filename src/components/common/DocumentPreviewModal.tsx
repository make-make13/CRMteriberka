import React, { useEffect, useRef, useState } from 'react';
import { X, FileText, Loader2, FileDown, Printer, Mail } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { installPdfjsRuntimeCompatibility } from '../../utils/pdfjsCompat';
// Worker pdf.js подключается через Vite ?worker — так он корректно бандлится и
// запускается и в dev, и в упакованном Electron (без проблем с путём/MIME при
// отдаче статики). Раньше worker грузился по new URL(..., import.meta.url),
// что в установленной версии давало 404 и срывало предпросмотр.
import PdfjsWorker from '../../utils/pdfjsWorkerCompat?worker';

installPdfjsRuntimeCompatibility();

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Один worker на всё приложение (переиспользуется между открытиями предпросмотра).
let pdfWorkerPort: Worker | null = null;

export type DocumentPreviewMode = 'print' | 'send';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfBlob?: Blob | null;
  fileName: string;
  isDarkMode: boolean;
  previewMode: DocumentPreviewMode;
  onEmail?: () => Promise<void> | void;
  isEmailing?: boolean;
  showEmailAction?: boolean;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  pdfBlob,
  fileName,
  isDarkMode,
  previewMode,
  onEmail,
  isEmailing = false,
  showEmailAction = true,
}: DocumentPreviewModalProps) {
  const pdfFrameRef = useRef<HTMLIFrameElement>(null);
  const pdfDocumentRef = useRef<any>(null);
  const pdfCanvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<number[]>([]);
  const [isPdfRendering, setIsPdfRendering] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !pdfBlob) {
      setPdfUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(pdfBlob);
    setPdfUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [isOpen, pdfBlob]);

  useEffect(() => {
    if (!isOpen || !pdfBlob) {
      pdfDocumentRef.current = null;
      pdfCanvasRefs.current = {};
      setPdfPages([]);
      setPdfRenderError(null);
      setIsPdfRendering(false);
      return;
    }

    let cancelled = false;

    const loadPdfPreview = async () => {
      setIsPdfRendering(true);
      setPdfRenderError(null);
      setPdfPages([]);
      pdfDocumentRef.current = null;
      pdfCanvasRefs.current = {};

      try {
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        if (!pdfWorkerPort) pdfWorkerPort = new PdfjsWorker();
        pdfjs.GlobalWorkerOptions.workerPort = pdfWorkerPort;

        const data = await pdfBlob.arrayBuffer();
        const pdfDocument = await pdfjs.getDocument({ data }).promise;

        if (cancelled) return;

        pdfDocumentRef.current = pdfDocument;
        setPdfPages(Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1));
      } catch (error) {
        if (cancelled) return;
        console.error('PDF preview render error:', error);
        setPdfRenderError('Не удалось отобразить предпросмотр PDF. Файл всё равно можно сохранить или отправить.');
        setIsPdfRendering(false);
      }
    };

    loadPdfPreview();

    return () => {
      cancelled = true;
    };
  }, [isOpen, pdfBlob]);

  useEffect(() => {
    if (!isOpen || !pdfBlob || !pdfDocumentRef.current || pdfPages.length === 0) return;

    let cancelled = false;
    const renderTasks: Array<{ cancel?: () => void }> = [];

    const renderPages = async () => {
      setIsPdfRendering(true);

      try {
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        for (const pageNumber of pdfPages) {
          if (cancelled) return;

          const canvas = pdfCanvasRefs.current[pageNumber];
          if (!canvas) continue;

          const page = await pdfDocumentRef.current.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.28 });
          const scaledViewport = page.getViewport({ scale: 1.28 * outputScale });
          const context = canvas.getContext('2d');

          if (!context) continue;

          canvas.width = Math.floor(scaledViewport.width);
          canvas.height = Math.floor(scaledViewport.height);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
          context.clearRect(0, 0, viewport.width, viewport.height);

          const renderTask = page.render({ canvasContext: context, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }

        if (!cancelled) {
          setIsPdfRendering(false);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('PDF page render error:', error);
        setPdfRenderError('Не удалось отобразить предпросмотр PDF. Файл всё равно можно сохранить или отправить.');
        setIsPdfRendering(false);
      }
    };

    renderPages();

    return () => {
      cancelled = true;
      renderTasks.forEach(task => task.cancel?.());
    };
  }, [isOpen, pdfBlob, pdfPages]);

  const handleDownloadPdf = async () => {
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    return;
  };

  const handlePrint = () => {
    if (pdfFrameRef.current?.contentWindow) {
      pdfFrameRef.current.contentWindow.focus();
      pdfFrameRef.current.contentWindow.print();
      return;
    }

    if (pdfUrl) {
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    window.print();
  };

  const primaryAction = previewMode === 'print'
    ? {
        label: 'Печать',
        icon: Printer,
        onClick: handlePrint,
        loading: false,
      }
    : {
        label: isEmailing ? 'Отправка...' : 'Отправить на email',
        icon: Mail,
        onClick: () => onEmail?.(),
        loading: isEmailing,
      };

  const secondaryAction = previewMode === 'print'
    ? {
        label: isEmailing ? 'Отправка...' : 'Email',
        icon: Mail,
        onClick: () => onEmail?.(),
        loading: isEmailing,
      }
    : {
        label: 'Печать',
        icon: Printer,
        onClick: handlePrint,
        loading: false,
      };

  if (!isOpen) return null;

  const PrimaryIcon = primaryAction.icon;
  const SecondaryIcon = secondaryAction.icon;

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #preview-modal-content { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div id="preview-modal-content" className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className={cn(
          "w-full max-w-5xl h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border",
          isDarkMode ? "bg-[#111111] border-white/10" : "bg-white border-gray-200",
        )}>
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                <FileText size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">Предпросмотр документа</h3>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{fileName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={primaryAction.onClick}
                disabled={primaryAction.loading}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all disabled:opacity-60",
                  isDarkMode ? "bg-orange-500 text-black hover:bg-orange-600" : "bg-orange-500 text-white hover:bg-orange-600",
                )}
              >
                {primaryAction.loading ? <Loader2 size={14} className="animate-spin" /> : <PrimaryIcon size={14} />}
                {primaryAction.label}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={!pdfBlob}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all disabled:opacity-60",
                  isDarkMode ? "bg-white/5 hover:bg-white/10 text-white" : "bg-gray-100 hover:bg-gray-200 text-black",
                )}
              >
                <FileDown size={14} />
                Сохранить PDF
              </button>
              {showEmailAction && (
                <button
                  onClick={secondaryAction.onClick}
                  disabled={secondaryAction.loading}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all disabled:opacity-60",
                    isDarkMode ? "bg-white/5 hover:bg-white/10 text-white" : "bg-gray-100 hover:bg-gray-200 text-black",
                  )}
                >
                  {secondaryAction.loading ? <Loader2 size={14} className="animate-spin" /> : <SecondaryIcon size={14} />}
                  {secondaryAction.label}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/5 text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-gray-900/50 relative custom-scrollbar">
            {(isEmailing || isPdfRendering) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/20 backdrop-blur-sm z-10">
                <Loader2 className="animate-spin text-orange-500" size={32} />
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  {isEmailing ? 'Отправка документа...' : 'Отрисовка предпросмотра...'}
                </p>
              </div>
            )}

            {pdfUrl ? (
              <div className="min-h-full p-4 sm:p-6 flex flex-col items-center gap-5">
                <iframe
                  ref={pdfFrameRef}
                  title="PDF preview"
                  src={pdfUrl}
                  className="absolute w-px h-px opacity-0 pointer-events-none"
                  aria-hidden="true"
                />

                {pdfRenderError && (
                  <div className="max-w-xl rounded-2xl border border-orange-500/30 bg-orange-500/10 px-5 py-4 text-sm text-orange-100">
                    {pdfRenderError}
                  </div>
                )}

                {pdfPages.map(pageNumber => (
                  <div
                    key={pageNumber}
                    className="rounded-xl overflow-hidden bg-white shadow-2xl shadow-black/40"
                  >
                    <canvas
                      ref={(node) => {
                        pdfCanvasRefs.current[pageNumber] = node;
                      }}
                      className="block max-w-full"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
