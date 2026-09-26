import React, { useEffect, useState } from 'react';

export interface ImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the viewport-pixel bounds of the slide image's visible content inside `container`.
 * Accounts for object-fit: contain letterboxing. Because getBoundingClientRect already includes
 * the CSS zoom/pan transform, the returned bounds describe the image as currently drawn on screen,
 * so a normalized (0-1) slide coordinate maps to `x + nx * width`, `y + ny * height` at any zoom.
 */
export function getSlideImageBounds(container: HTMLElement | null): ImageBounds | null {
  const root = container || document.body;
  const img = root.querySelector('img[class*="object-contain"]') as HTMLImageElement | null;
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;

  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const naturalRatio = img.naturalWidth / img.naturalHeight;
  const visibleRatio = rect.width / rect.height;

  let width = rect.width;
  let height = rect.height;
  let left = 0;
  let top = 0;

  if (visibleRatio > naturalRatio) {
    // Wider than content -> height constrained
    width = rect.height * naturalRatio;
    left = (rect.width - width) / 2;
  } else {
    // Taller than content -> width constrained
    height = rect.width / naturalRatio;
    top = (rect.height - height) / 2;
  }

  return { x: rect.left + left, y: rect.top + top, width, height };
}

export function sameBounds(a: ImageBounds | null, b: ImageBounds | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// The slide image animates its transform for this long (transition-transform duration-200);
// keep polling a little longer than that so overlays settle on the final position.
const SETTLE_MS = 400;

/**
 * Tracks the slide image bounds within `containerRef`.
 * Polls every frame while `active`; otherwise polls briefly after `deps` change (zoom/pan)
 * and on window resize so the bounds are correct once the CSS transition ends.
 * Bounds are in viewport pixels, or relative to `relativeTo`'s box when given
 * (for overlays positioned inside the container rather than fixed to the viewport).
 */
export function useSlideImageBounds(
  containerRef: React.RefObject<HTMLElement> | undefined,
  active: boolean,
  deps: ReadonlyArray<unknown> = [],
  relativeTo?: React.RefObject<Element>
): ImageBounds | null {
  const [bounds, setBounds] = useState<ImageBounds | null>(null);

  useEffect(() => {
    let frame = 0;
    let settleUntil = performance.now() + SETTLE_MS;

    const update = () => {
      let next = getSlideImageBounds(containerRef?.current ?? null);
      const origin = relativeTo?.current?.getBoundingClientRect();
      if (next && origin) {
        next = { ...next, x: next.x - origin.left, y: next.y - origin.top };
      }
      setBounds((prev) => (sameBounds(prev, next) ? prev : next));
      if (active || performance.now() < settleUntil) {
        frame = requestAnimationFrame(update);
      } else {
        frame = 0;
      }
    };

    const restart = () => {
      settleUntil = performance.now() + SETTLE_MS;
      if (!frame) update();
    };

    update();
    window.addEventListener('resize', restart);

    return () => {
      window.removeEventListener('resize', restart);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, relativeTo, active, ...deps]);

  return bounds;
}
