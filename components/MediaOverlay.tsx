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
          <MediaItem key={`${slideId}-${index}`} item={item} url={mediaMap[item.src]} bounds={bounds} />
        ))}
    </div>
  );
};

export default MediaOverlay;
