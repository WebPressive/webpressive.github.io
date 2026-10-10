import React, { useRef, useState } from 'react';
import { MediaMap, PDFMedia } from '../types';
import { ImageBounds, useSlideImageBounds } from '../utils/slideImageBounds';

interface MediaOverlayProps {
  media: PDFMedia[];
  mediaMap: MediaMap;
  containerRef: React.RefObject<HTMLElement>;
  slideId: string; // Part of each element's key, so media restarts from its first frame on every slide entry
  zoomLevel?: number;
  panX?: number;
  panY?: number;
  playing?: boolean; // false -> render nothing (the poster still in the slide image shows)
}

interface MediaItemProps {
  item: PDFMedia;
  url: string;
  bounds: ImageBounds;
}

// One GIF or video, stretched over its poster. Removed on a load error so the still shows through.
const MediaItem: React.FC<MediaItemProps> = ({ item, url, bounds }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: bounds.x + item.x * bounds.width,
    top: bounds.y + item.y * bounds.height,
    width: item.width * bounds.width,
    height: item.height * bounds.height,
    objectFit: 'fill',
  };
  const onError = () => {
    console.warn(`Could not play media "${item.src}"; showing the still instead`);
    setFailed(true);
  };

  if (item.kind === 'video') {
    return <video src={url} style={style} autoPlay muted loop playsInline onError={onError} />;
  }
  return <img src={url} style={style} alt="" draggable={false} onError={onError} />;
};

// Play badge of an animated still, redrawn above the playing GIF (the PDF draws the same badge, but the
// GIF covers the quarter of it that lies inside the picture). Its centre sits on the media's bottom-left
// corner, as in the Beamer decks (\animstill / \videostill): a 2.2 mm orange disc with a white triangle on a
// 160 mm wide page. It takes no pointer input; the PDF's own link on the badge (LinkOverlay) handles the click.
const BADGE_DIAMETER = 2.2 / 160; // fraction of the page width (Beamer 16:9 page); halved 2026-10-10 so adjacent GIFs are not covered

const PlayBadge: React.FC<{ item: PDFMedia; bounds: ImageBounds }> = ({ item, bounds }) => {
  const d = BADGE_DIAMETER * bounds.width;
  const cx = bounds.x + item.x * bounds.width;
  const cy = bounds.y + (item.y + item.height) * bounds.height;
  return (
    <svg
      viewBox="-2.2 -2.2 4.4 4.4"
      style={{ position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, overflow: 'visible' }}
      aria-hidden="true"
    >
      <circle cx="0" cy="0" r="2.2" fill="#D64309" fillOpacity="0.9" />
      <polygon points="-0.75,-1.15 -0.75,1.15 1.25,0" fill="#FFFFFF" />
    </svg>
  );
};

/**
 * Plays animated media over the slide image at the poster's exact position.
 * Follows object-fit: contain letterboxing and the zoom/pan transform through the slide image bounds.
 * Sits above the slide image and below links, ink, laser and spotlight; never takes pointer input.
 */
const MediaOverlay: React.FC<MediaOverlayProps> = ({
  media,
  mediaMap,
  containerRef,
  slideId,
  zoomLevel = 1.0,
  panX = 0,
  panY = 0,
  playing = true,
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const bounds = useSlideImageBounds(containerRef, false, [zoomLevel, panX, panY, slideId], layerRef);
  const items = playing ? media.filter((item) => mediaMap[item.src]) : [];

  // The layer stays mounted while empty so the bounds are always measured relative to it
  return (
    <div
      ref={layerRef}
      data-media-layer
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 5 }}
    >
      {bounds &&
        items.map((item, index) => (
          <React.Fragment key={`${slideId}-${index}`}>
            <MediaItem item={item} url={mediaMap[item.src]} bounds={bounds} />
            <PlayBadge item={item} bounds={bounds} />
          </React.Fragment>
        ))}
    </div>
  );
};

export default MediaOverlay;
