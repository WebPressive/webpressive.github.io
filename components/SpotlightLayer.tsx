import React from 'react';
import { SPOTLIGHT_SIZE } from '../constants';
import { useSlideImageBounds } from '../utils/slideImageBounds';

interface SpotlightLayerProps {
  isActive: boolean;
  position: { x: number; y: number } | null;
  containerRef?: React.RefObject<HTMLElement>;
  zoomLevel?: number;
  panX?: number;
  panY?: number;
}

const SpotlightLayer: React.FC<SpotlightLayerProps> = ({
  isActive,
  position,
  containerRef,
  zoomLevel = 1.0,
  panX = 0,
  panY = 0
}) => {
  // Track the rendered slide image bounds (polled every frame while active)
  const imageBounds = useSlideImageBounds(containerRef, isActive, [zoomLevel, panX, panY]);

  if (!isActive || !position || !imageBounds) return null;

  // Position is normalized relative to the image (0-1 range)
  // Convert to actual pixel position within the image bounds
  const pixelX = imageBounds.x + (position.x * imageBounds.width);
  const pixelY = imageBounds.y + (position.y * imageBounds.height);

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none transition-opacity duration-300"
      style={{
        background: `radial-gradient(circle ${SPOTLIGHT_SIZE}px at ${pixelX}px ${pixelY}px, transparent 0%, rgba(0, 0, 0, 0.85) 100%)`,
      }}
    />
  );
};

export default SpotlightLayer;
