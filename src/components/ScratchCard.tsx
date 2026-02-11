"use client";

import {
  CSSProperties,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ScratchMode = "scratch" | "hover" | "click";

type ScratchCardProps = {
  bottomImage?: {
    src: string;
    alt?: string;
  };
  backgroundColor?: string;
  useImage?: boolean;
  topText?: string;
  hoverText?: string;
  clickText?: string;
  textColor?: string;
  topLayerColor?: string;
  brushSize?: number;
  scratchMode?: ScratchMode;
  borderRadius?: number;
  revealThreshold?: number;
  className?: string;
  style?: CSSProperties;
  resetSignal?: number;
  onRevealComplete?: () => void;
};

const defaultBottomImage = {
  src: "https://framerusercontent.com/images/GfGkADagM4KEibNcIiRUWlfrR0.jpg",
  alt: "Revealed content",
};

export default function ScratchCard({
  bottomImage = defaultBottomImage,
  backgroundColor = "#f2dfbf",
  useImage = true,
  topText = "Scratch to reveal",
  hoverText = "Hover to reveal",
  clickText = "Click to reveal",
  textColor = "#6f2a2f",
  topLayerColor = "#e3c99f",
  brushSize = 30,
  scratchMode = "scratch",
  borderRadius = 8,
  revealThreshold = 0.4,
  className,
  style,
  resetSignal,
  onRevealComplete,
}: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scratchCountRef = useRef(0);
  const revealTriggeredRef = useRef(false);

  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 200 });
  const [maskImageUrl, setMaskImageUrl] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isScratching, setIsScratching] = useState(false);
  const [lastPosition, setLastPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const updateMaskData = useCallback((canvas: HTMLCanvasElement) => {
    try {
      setMaskImageUrl(canvas.toDataURL());
      setIsInitialized(true);
    } catch {
      setMaskImageUrl("");
    }
  }, []);

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    canvas.width = Math.max(1, Math.round(canvasSize.width));
    canvas.height = Math.max(1, Math.round(canvasSize.height));

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = topLayerColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.1;
    for (let index = 0; index < 100; index += 1) {
      ctx.fillStyle = Math.random() > 0.5 ? "#000" : "#fff";
      ctx.fillRect(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        2,
        2,
      );
    }
    ctx.globalAlpha = 1;

    setIsRevealed(false);
    setIsHovering(false);
    setIsScratching(false);
    setLastPosition(null);
    scratchCountRef.current = 0;
    revealTriggeredRef.current = false;

    updateMaskData(canvas);
  }, [canvasSize.height, canvasSize.width, topLayerColor, updateMaskData]);

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      initializeCanvas();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [initializeCanvas, resetSignal]);

  const getCoordinates = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const maybeCompleteReveal = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas || revealTriggeredRef.current) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let clearedPixels = 0;
    for (let index = 3; index < imageData.length; index += 4) {
      if (imageData[index] === 0) {
        clearedPixels += 1;
      }
    }

    const totalPixels = canvas.width * canvas.height;
    const revealRatio = totalPixels === 0 ? 0 : clearedPixels / totalPixels;

    if (revealRatio >= revealThreshold) {
      revealTriggeredRef.current = true;
      onRevealComplete?.();
    }
  }, [onRevealComplete, revealThreshold]);

  const scratch = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return;
      }

      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (lastPosition) {
        ctx.beginPath();
        ctx.moveTo(lastPosition.x, lastPosition.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }

      setLastPosition({ x, y });

      scratchCountRef.current += 1;
      if (scratchCountRef.current % 7 === 0) {
        updateMaskData(canvas);
        maybeCompleteReveal();
      }
    },
    [brushSize, lastPosition, maybeCompleteReveal, updateMaskData],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();

      if (scratchMode === "click") {
        setIsRevealed((current) => {
          const next = !current;
          if (next && !revealTriggeredRef.current) {
            revealTriggeredRef.current = true;
            onRevealComplete?.();
          }
          return next;
        });
        return;
      }

      if (scratchMode !== "scratch") {
        return;
      }

      setIsScratching(true);
      event.currentTarget.setPointerCapture(event.pointerId);

      const coords = getCoordinates(event);
      if (coords) {
        scratch(coords.x, coords.y);
      }
    },
    [getCoordinates, onRevealComplete, scratch, scratchMode],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!isScratching || scratchMode !== "scratch") {
        return;
      }

      const coords = getCoordinates(event);
      if (coords) {
        scratch(coords.x, coords.y);
      }
    },
    [getCoordinates, isScratching, scratch, scratchMode],
  );

  const onPointerEnd = useCallback(() => {
    if (scratchMode !== "scratch") {
      return;
    }

    setIsScratching(false);
    setLastPosition(null);

    const canvas = canvasRef.current;
    if (canvas) {
      updateMaskData(canvas);
      maybeCompleteReveal();
    }
  }, [maybeCompleteReveal, scratchMode, updateMaskData]);

  const canvasOpacity = useMemo(() => {
    if (scratchMode === "hover") {
      return isHovering ? 0 : 1;
    }

    if (scratchMode === "click") {
      return isRevealed ? 0 : 1;
    }

    return 1;
  }, [isHovering, isRevealed, scratchMode]);

  const textOpacity = useMemo(() => {
    if (scratchMode === "scratch") {
      return isInitialized && maskImageUrl ? 1 : 0;
    }

    return canvasOpacity;
  }, [canvasOpacity, isInitialized, maskImageUrl, scratchMode]);

  const displayText =
    scratchMode === "hover"
      ? hoverText
      : scratchMode === "click"
        ? clickText
        : topText;

  return (
    <div
      className={className}
      style={{
        ...style,
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: `${borderRadius}px`,
        overflow: "hidden",
        userSelect: "none",
        touchAction: "none",
      }}
      onMouseEnter={() => {
        if (scratchMode === "hover") {
          setIsHovering(true);
        }
      }}
      onMouseLeave={() => {
        if (scratchMode === "hover") {
          setIsHovering(false);
        }
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: useImage ? "transparent" : backgroundColor,
          backgroundImage: useImage ? `url(${bottomImage.src})` : "none",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-label={bottomImage.alt}
      />

      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          opacity: canvasOpacity,
          cursor: scratchMode === "scratch" ? "crosshair" : "pointer",
          transition: scratchMode === "scratch" ? "none" : "opacity 0.3s ease",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: textColor,
          fontSize: "clamp(1.1rem, 3vw, 1.65rem)",
          fontFamily: "Cormorant Garamond, Times New Roman, serif",
          fontWeight: 600,
          textAlign: "center",
          padding: "0.75rem",
          pointerEvents: "none",
          zIndex: 2,
          opacity: textOpacity,
          transition: scratchMode === "scratch" ? "none" : "opacity 0.3s ease",
          maskImage:
            scratchMode === "scratch" && maskImageUrl
              ? `url(${maskImageUrl})`
              : "none",
          WebkitMaskImage:
            scratchMode === "scratch" && maskImageUrl
              ? `url(${maskImageUrl})`
              : "none",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      >
        {displayText}
      </div>
    </div>
  );
}
