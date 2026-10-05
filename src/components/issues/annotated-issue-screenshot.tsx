"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { ScreenshotAnnotation } from "@/lib/issues/screenshot-annotation";
import { cn } from "@/lib/utils";

type ImageBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Measure the actual painted image area inside an `object-contain` `<img>`,
 * excluding letterboxing so overlays stay aligned with the screenshot.
 */
export function getContainedImageBox(image: HTMLImageElement): ImageBox | null {
  const { clientWidth, clientHeight, naturalWidth, naturalHeight } = image;
  if (
    clientWidth <= 0 ||
    clientHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  const containerRatio = clientWidth / clientHeight;
  const imageRatio = naturalWidth / naturalHeight;

  if (containerRatio > imageRatio) {
    const height = clientHeight;
    const width = height * imageRatio;
    return {
      left: (clientWidth - width) / 2,
      top: 0,
      width,
      height,
    };
  }

  const width = clientWidth;
  const height = width / imageRatio;
  return {
    left: 0,
    top: (clientHeight - height) / 2,
    width,
    height,
  };
}

export function AnnotatedIssueScreenshot({
  src,
  alt,
  issueNumber,
  annotation,
  className,
  imageClassName,
  onError,
  imgKey,
}: {
  src: string;
  alt: string;
  issueNumber: number;
  annotation: ScreenshotAnnotation | null;
  className?: string;
  imageClassName?: string;
  onError?: () => void;
  imgKey?: number | string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<ImageBox | null>(null);

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    function measure() {
      if (!imageRef.current) return;
      setBox(getContainedImageBox(imageRef.current));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    image.addEventListener("load", measure);
    return () => {
      observer.disconnect();
      image.removeEventListener("load", measure);
    };
  }, [src, imgKey]);

  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      {/* Protected binary route; next/image optimization is not needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={imgKey}
        ref={imageRef}
        src={src}
        alt={alt}
        className={cn("mx-auto block w-full object-contain", imageClassName)}
        onError={onError}
      />
      {annotation && box ? (
        <div
          aria-hidden="true"
          data-screenshot-annotation=""
          className="pointer-events-none absolute"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        >
          <div
            className="absolute rounded-[2px] border-[2.5px] border-[#ea580c] bg-[#ea580c]/20"
            style={{
              left: `${annotation.selectedBounds.x * 100}%`,
              top: `${annotation.selectedBounds.y * 100}%`,
              width: `${annotation.selectedBounds.width * 100}%`,
              height: `${annotation.selectedBounds.height * 100}%`,
              boxShadow: "0 0 0 1px rgb(255 255 255 / 0.85)",
            }}
          />
          <div
            className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#ea580c] text-[11px] font-bold tabular-nums text-white ring-2 ring-white"
            style={{
              left: `${annotation.pin.x * 100}%`,
              top: `${annotation.pin.y * 100}%`,
            }}
          >
            {issueNumber}
          </div>
        </div>
      ) : null}
    </div>
  );
}
