'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import {
  Camera,
  FlipHorizontal2,
  ImageIcon,
  Loader2,
  RefreshCw,
  ScanLine,
  Smartphone,
} from 'lucide-react';
import {
  canvasToJpegFile,
  cropDocumentToCanvas,
  detectDocumentCorners,
  fileToCanvas,
  type Quad,
  type Size,
} from '@/lib/document-capture';

interface IdCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: (file: File) => void;
}

type Step = 'camera' | 'edit';

const HANDLE_SIZE = 28;

export function IdCaptureDialog({ open, onOpenChange, onCaptured }: IdCaptureDialogProps) {
  const [step, setStep] = React.useState<Step>('camera');
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [facingMode, setFacingMode] = React.useState<'environment' | 'user'>('environment');
  const [capturedCanvas, setCapturedCanvas] = React.useState<HTMLCanvasElement | null>(null);
  const [imageSize, setImageSize] = React.useState<Size | null>(null);
  const [corners, setCorners] = React.useState<Quad | null>(null);
  const [detecting, setDetecting] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [containerSize, setContainerSize] = React.useState<Size>({ w: 0, h: 0 });

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const dragIndexRef = React.useRef<number | null>(null);
  const captureInputRef = React.useRef<HTMLInputElement>(null);
  const browseInputRef = React.useRef<HTMLInputElement>(null);

  const stopStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = React.useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream();
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not supported on this device.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (error) {
        console.error('Camera access error:', error);
        setCameraError('Could not access the camera. Please allow camera access or choose a file instead.');
      }
    },
    [stopStream]
  );

  React.useEffect(() => {
    if (!open) return;
    setStep('camera');
    setCameraError(null);
    setCapturedCanvas(null);
    setImageSize(null);
    setCorners(null);
    setDetecting(false);
    setProcessing(false);
    setFacingMode('environment');
    void startCamera('environment');
  }, [open, startCamera]);

  React.useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  const runDetection = React.useCallback(async (canvas: HTMLCanvasElement) => {
    setDetecting(true);
    try {
      const quad = await detectDocumentCorners(canvas);
      if (quad) setCorners(quad);
    } catch (error) {
      console.error('Edge detection error:', error);
    } finally {
      setDetecting(false);
    }
  }, []);

  const beginEdit = React.useCallback(
    (canvas: HTMLCanvasElement) => {
      setCapturedCanvas(canvas);
      setImageSize({ w: canvas.width, h: canvas.height });
      setCorners([
        { x: 0, y: 0 },
        { x: canvas.width, y: 0 },
        { x: canvas.width, y: canvas.height },
        { x: 0, y: canvas.height },
      ]);
      setStep('edit');
      void runDetection(canvas);
    },
    [runDetection]
  );

  const handleCapture = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopStream();
    beginEdit(canvas);
  }, [beginEdit, stopStream]);

  const handleRetake = React.useCallback(() => {
    setCapturedCanvas(null);
    setImageSize(null);
    setCorners(null);
    setStep('camera');
    void startCamera(facingMode);
  }, [startCamera, facingMode]);

  const handleFallbackFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const canvas = await fileToCanvas(file);
        beginEdit(canvas);
      } catch (error) {
        console.error('File load error:', error);
        toast.error('Failed to load the selected image');
      } finally {
        e.target.value = '';
      }
    },
    [beginEdit]
  );

  const resetToFullImage = React.useCallback(() => {
    if (!imageSize) return;
    setCorners([
      { x: 0, y: 0 },
      { x: imageSize.w, y: 0 },
      { x: imageSize.w, y: imageSize.h },
      { x: 0, y: imageSize.h },
    ]);
  }, [imageSize]);

  const handleConfirm = React.useCallback(async () => {
    if (!capturedCanvas || !corners || processing) return;
    setProcessing(true);
    try {
      const cropped = cropDocumentToCanvas(capturedCanvas, corners);
      const file = await canvasToJpegFile(cropped, `id-captured-${Date.now()}.jpg`);
      onCaptured(file);
      onOpenChange(false);
    } catch (error) {
      console.error('Crop/compress error:', error);
      toast.error('Failed to process the image. Please retake the photo.');
    } finally {
      setProcessing(false);
    }
  }, [capturedCanvas, corners, processing, onCaptured, onOpenChange]);

  React.useLayoutEffect(() => {
    if (!open || step !== 'edit' || !boxRef.current) return;
    const update = () => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (rect) setContainerSize({ w: rect.width, h: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, [open, step]);

  const previewUrl = React.useMemo(
    () => (capturedCanvas ? capturedCanvas.toDataURL('image/jpeg', 0.9) : null),
    [capturedCanvas]
  );

  const scale = imageSize
    ? Math.min(containerSize.w / imageSize.w, containerSize.h / imageSize.h, 1)
    : 1;
  const dispW = imageSize ? Math.max(1, Math.round(imageSize.w * scale)) : 0;
  const dispH = imageSize ? Math.max(1, Math.round(imageSize.h * scale)) : 0;
  const displayCorners = corners ?? (imageSize ? fullImageQuad(imageSize) : null);

  const handleCornerPointerDown = (index: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragIndexRef.current = index;
  };

  const handleCornerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const index = dragIndexRef.current;
    if (index === null || !wrapperRef.current || !imageSize) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / scale, 0, imageSize.w);
    const y = clamp((e.clientY - rect.top) / scale, 0, imageSize.h);
    setCorners((prev) => {
      const base = prev ?? fullImageQuad(imageSize);
      return base.map((p, i) => (i === index ? { x, y } : p)) as Quad;
    });
  };

  const handleCornerPointerUp = React.useCallback(() => {
    dragIndexRef.current = null;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Capture ID Document
          </DialogTitle>
          <DialogDescription>
            Take a photo of the ID. Edges are detected automatically and can be adjusted before upload.
          </DialogDescription>
        </DialogHeader>

        {step === 'camera' ? (
          <div className="space-y-4 py-2">
            {!cameraError ? (
              <div className="relative flex items-center justify-center w-full h-[50vh] overflow-hidden rounded-lg border bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                />
                <div className="absolute inset-6 rounded-lg border-2 border-dashed border-white/50 pointer-events-none" />
                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/50 rounded-full px-3 py-1">
                  Align the ID inside the frame
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-[40vh] gap-4 rounded-lg border bg-muted/40 px-6 text-center">
                <p className="text-sm text-muted-foreground">{cameraError}</p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <Button type="button" onClick={() => captureInputRef.current?.click()}>
                    <Smartphone className="h-4 w-4 mr-2" />
                    Open device camera
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => browseInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Choose an image file
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {!cameraError && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setFacingMode((m) => {
                        const next = m === 'environment' ? 'user' : 'environment';
                        void startCamera(next);
                        return next;
                      })
                    }
                    title="Switch camera"
                  >
                    <FlipHorizontal2 className="h-4 w-4" />
                  </Button>
                )}
                {!cameraError && (
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleCapture}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Capture
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div
              ref={boxRef}
              className="relative flex items-center justify-center w-full h-[50vh] overflow-hidden rounded-lg border bg-muted"
            >
              {previewUrl ? (
                <div
                  ref={wrapperRef}
                  className="relative"
                  style={{ width: dispW, height: dispH }}
                  onPointerUp={handleCornerPointerUp}
                >
                  <img
                    src={previewUrl}
                    alt="Captured ID"
                    draggable={false}
                    className="h-full w-full select-none"
                    style={{ userSelect: 'none' }}
                  />
                  {displayCorners && (
                    <svg
                      viewBox={`0 0 ${imageSize?.w ?? 1} ${imageSize?.h ?? 1}`}
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    >
                      <polygon
                        points={displayCorners.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="rgba(16,185,129,0.15)"
                        stroke="#10b981"
                        strokeWidth={2}
                      />
                    </svg>
                  )}
                  {displayCorners?.map((p, i) => (
                    <div
                      key={i}
                      role="button"
                      aria-label={`Corner ${i + 1}`}
                      className="absolute rounded-full border-2 border-emerald-500 bg-white/90 shadow cursor-grab touch-none"
                      style={{
                        width: HANDLE_SIZE,
                        height: HANDLE_SIZE,
                        left: p.x * scale - HANDLE_SIZE / 2,
                        top: p.y * scale - HANDLE_SIZE / 2,
                      }}
                      onPointerDown={handleCornerPointerDown(i)}
                      onPointerMove={handleCornerPointerMove}
                      onPointerUp={handleCornerPointerUp}
                    />
                  ))}
                  {detecting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <div className="flex flex-col items-center gap-2 text-white">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="text-xs">Detecting edges...</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <LoadingSpinner />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleRetake}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Retake
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => capturedCanvas && runDetection(capturedCanvas)}
                disabled={!capturedCanvas || detecting}
              >
                <ScanLine className="h-4 w-4 mr-1" />
                Re-detect edges
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetToFullImage}>
                Use full image
              </Button>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirm}
                disabled={!capturedCanvas || !corners || detecting || processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ScanLine className="h-4 w-4 mr-1" />
                    Confirm & Crop
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFallbackFile}
        />
        <input
          ref={browseInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFallbackFile}
        />
      </DialogContent>
    </Dialog>
  );
}

function fullImageQuad(size: Size): Quad {
  return [
    { x: 0, y: 0 },
    { x: size.w, y: 0 },
    { x: size.w, y: size.h },
    { x: 0, y: size.h },
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
