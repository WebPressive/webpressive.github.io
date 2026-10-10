import { Annotation, AppMode, PDFMedia, SlideData } from '../types';
import { PlaybackFrame } from './timelineCursor';
import { cameraBox } from './camera';
import { smoothPath, straightPath, Px } from '../components/AnnotationLayer';
import { HIGHLIGHTER_OPACITY, SPOTLIGHT_SIZE, TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT } from '../constants';

/**
 * Draws one frame of what the audience saw onto a canvas, for video export. Mirrors AudienceView:
 * slide (with zoom/pan), animated media, camera, ink, spotlight, laser, black screen, overview grid.
 * Sizes the live view gives in screen pixels (laser dot, spotlight) are scaled as if the slide were
 * shown 1920 pixels wide.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Source = CanvasImageSource;

const REFERENCE_WIDTH = 1920;
const BADGE_DIAMETER = 2.2 / 160; // Play badge of an animated still, fraction of the page width (same as MediaOverlay)

/** Decoded frames of one GIF or video used by the deck, by time (looping). */
export interface AnimatedMedia {
  durationMs: number;
  frameAt(ms: number): Promise<Source | null>;
  close(): void;
}

export interface CompositorAssets {
  slide(index: number, fullResolution: boolean): Promise<Source | null>;
  media(src: string): Promise<AnimatedMedia | null>;
}

const toLocal = (W: number, H: number) => (p: { x: number; y: number }): Px => [p.x * W - W / 2, p.y * H - H / 2];

function drawAnnotation(ctx: Ctx, a: Annotation, W: number, H: number) {
  const px = toLocal(W, H);
  const pts = a.points.map(px);
  const sw = Math.max(1, a.width * W);
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (a.tool) {
    case 'pen':
      ctx.stroke(new Path2D(smoothPath(pts)));
      break;
    case 'highlighter':
      ctx.globalAlpha = HIGHLIGHTER_OPACITY;
      ctx.globalCompositeOperation = 'multiply';
      ctx.stroke(new Path2D(straightPath(pts)));
      break;
    case 'line':
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.stroke();
      break;
    case 'arrow': {
      if (pts.length < 2) break;
      const [[x1, y1], [x2, y2]] = pts;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len === 0) break;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const headLen = Math.min(len, Math.max(12 * (W / REFERENCE_WIDTH), sw * 5));
      const half = headLen * 0.5;
      const bx = x2 - ux * headLen;
      const by = y2 - uy * headLen;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(bx - uy * half, by + ux * half);
      ctx.lineTo(bx + uy * half, by - ux * half);
      ctx.closePath();
      ctx.lineWidth = Math.min(sw, 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'rect':
      if (pts.length < 2) break;
      ctx.strokeRect(Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.abs(pts[1][0] - pts[0][0]), Math.abs(pts[1][1] - pts[0][1]));
      break;
    case 'ellipse':
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.ellipse((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, Math.abs(pts[1][0] - pts[0][0]) / 2, Math.abs(pts[1][1] - pts[0][1]) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'text': {
      if (!a.text || pts.length < 1) break;
      const fontPx = (a.fontSize ?? 0) * W;
      ctx.font = `${fontPx}px ${TEXT_FONT_FAMILY}`;
      ctx.textBaseline = 'top';
      const [x, top] = pts[0];
      const y = top + (fontPx * (TEXT_LINE_HEIGHT - 1)) / 2;
      a.text.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * fontPx * TEXT_LINE_HEIGHT));
      break;
    }
  }
  ctx.restore();
}

function drawPlayBadge(ctx: Ctx, item: PDFMedia, W: number, H: number) {
  const d = BADGE_DIAMETER * W;
  const cx = item.x * W - W / 2;
  const cy = (item.y + item.height) * H - H / 2;
  const unit = d / 4.4;
  ctx.save();
  ctx.fillStyle = 'rgba(214, 67, 9, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(cx - 0.75 * unit, cy - 1.15 * unit);
  ctx.lineTo(cx - 0.75 * unit, cy + 1.15 * unit);
  ctx.lineTo(cx + 1.25 * unit, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// object-fit: cover
function drawCover(ctx: Ctx, source: Source, sw: number, sh: number, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / sw, h / sh);
  const cw = w / scale;
  const ch = h / scale;
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}

const sourceSize = (source: Source): [number, number] => {
  const s = source as { videoWidth?: number; videoHeight?: number; displayWidth?: number; displayHeight?: number; width?: number; height?: number };
  return [s.videoWidth ?? s.displayWidth ?? (s.width as number) ?? 0, s.videoHeight ?? s.displayHeight ?? (s.height as number) ?? 0];
};

function roundedRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawFrame(
  ctx: Ctx,
  W: number,
  H: number,
  frame: PlaybackFrame,
  slides: SlideData[],
  assets: CompositorAssets,
  camera: Source | null, // The camera picture at this moment (null: no camera in this clip)
  mediaMs: number // Time since the slide's animations (re)started
) {
  const { state } = frame;
  const k = W / REFERENCE_WIDTH;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (state.isBlackScreen) {
    ctx.restore();
    return;
  }

  if (state.mode === AppMode.OVERVIEW) {
    // The slide grid the audience sees in overview mode (4 columns)
    const cols = 4;
    const gap = 16 * k;
    const pad = 32 * k;
    const cellW = (W - 2 * pad - (cols - 1) * gap) / cols;
    const cellH = (cellW * 9) / 16;
    for (let i = 0; i < slides.length; i++) {
      const x = pad + (i % cols) * (cellW + gap);
      const y = pad + Math.floor(i / cols) * (cellH + gap);
      if (y > H) break;
      const image = await assets.slide(i, false);
      ctx.globalAlpha = i === state.index ? 1 : 0.5;
      if (image) drawCover(ctx, image, ...sourceSize(image), x, y, cellW, cellH);
      if (i === state.index) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2 * k;
        ctx.strokeRect(x - k, y - k, cellW + 2 * k, cellH + 2 * k);
      }
    }
    ctx.restore();
    return;
  }

  const slide = slides[state.index];
  const zoom = state.zoomState.level > 1 ? state.zoomState : null;

  // Slide-local coordinates: origin at the slide centre, then the CSS zoom transform
  // (scale(z) translate(panX * 100%, panY * 100%), origin centre)
  ctx.save();
  ctx.translate(W / 2, H / 2);
  if (zoom) {
    ctx.scale(zoom.level, zoom.level);
    ctx.translate(zoom.panX * W, zoom.panY * H);
  }
  const image = await assets.slide(state.index, !!zoom);
  if (image) ctx.drawImage(image, -W / 2, -H / 2, W, H);

  // Animated media over its stills
  if (state.isMediaActive) {
    for (const item of slide?.media ?? []) {
      const media = await assets.media(item.src);
      if (!media) continue;
      const picture = await media.frameAt(media.durationMs > 0 ? mediaMs % media.durationMs : 0);
      if (picture) ctx.drawImage(picture, item.x * W - W / 2, item.y * H - H / 2, item.width * W, item.height * H);
      drawPlayBadge(ctx, item, W, H);
    }
  }
  ctx.restore();

  // Camera, in the unzoomed slide frame
  if (camera && slide) {
    const box = cameraBox(frame.camera, slide.camera, { x: 0, y: 0, width: W, height: H });
    const [cw, ch] = sourceSize(camera);
    if (box && cw && ch) {
      const shape = frame.camera.shape;
      const radius = shape === 'circle' ? Math.min(box.width, box.height) / 2 : shape === 'rounded' ? box.width * 0.08 : 0;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 24 * k;
      ctx.shadowOffsetY = 4 * k;
      roundedRectPath(ctx, box.x, box.y, box.width, box.height, radius);
      ctx.fillStyle = '#171717';
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundedRectPath(ctx, box.x, box.y, box.width, box.height, radius);
      ctx.clip();
      if (frame.camera.mirror) {
        ctx.translate(box.x * 2 + box.width, 0);
        ctx.scale(-1, 1);
      }
      drawCover(ctx, camera, cw, ch, box.x, box.y, box.width, box.height);
      ctx.restore();
      if (frame.camera.border) {
        const bw = Math.max(2, Math.round(box.width * 0.015));
        ctx.save();
        roundedRectPath(ctx, box.x + bw / 2, box.y + bw / 2, box.width - bw, box.height - bw, Math.max(0, radius - bw / 2));
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = bw;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Ink, in slide-local coordinates (follows zoom)
  ctx.save();
  ctx.translate(W / 2, H / 2);
  if (zoom) {
    ctx.scale(zoom.level, zoom.level);
    ctx.translate(zoom.panX * W, zoom.panY * H);
  }
  frame.annotations.forEach((a) => drawAnnotation(ctx, a, W, H));
  if (frame.draft) drawAnnotation(ctx, frame.draft, W, H);
  ctx.restore();

  // Screen position of a slide point (normalized to the zoomed slide image, as the live overlays are)
  const onScreen = (p: { x: number; y: number }): Px => {
    const lx = p.x * W - W / 2;
    const ly = p.y * H - H / 2;
    if (!zoom) return [lx + W / 2, ly + H / 2];
    return [W / 2 + zoom.level * (lx + zoom.panX * W), H / 2 + zoom.level * (ly + zoom.panY * H)];
  };

  if (state.isSpotlight && state.spotlightPosition) {
    const [x, y] = onScreen(state.spotlightPosition);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, SPOTLIGHT_SIZE * k);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  if (state.isLaser && state.laserPosition) {
    const [x, y] = onScreen(state.laserPosition);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 16 * k);
    glow.addColorStop(0, 'rgba(255, 0, 0, 0.6)');
    glow.addColorStop(0.4, 'rgba(255, 0, 0, 0.3)');
    glow.addColorStop(0.7, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 16 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
    ctx.shadowBlur = 10 * k;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(x, y, 6 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
