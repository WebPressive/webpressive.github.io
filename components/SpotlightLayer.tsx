import React, { useEffect, useState, useRef } from 'react';
import { SPOTLIGHT_SIZE } from '../constants';

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
  const [imageBounds, setImageBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Find the image element within the container and track its bounds
  useEffect(() => {
    let animationFrameId: number;

    const updateBounds = () => {
      const container = containerRef?.current || document.body;
      const img = container.querySelector('img[class*="object-contain"]') as HTMLImageElement;
      
      if (img && img.naturalWidth && img.naturalHeight) {
        imageRef.current = img;
        const rect = img.getBoundingClientRect();
        
        // Calculate rendered content dimensions (accounting for object-fit: contain)
        const naturalRatio = img.naturalWidth / img.naturalHeight;
        const visibleRatio = rect.width / rect.height;
        
        let renderedWidth = rect.width;
        let renderedHeight = rect.height;
        let contentLeft = 0;
        let contentTop = 0;
        
        if (visibleRatio > naturalRatio) {
          // Wider than content -> height constrained
          renderedWidth = rect.height * naturalRatio;
          contentLeft = (rect.width - renderedWidth) / 2;
        } else {
          // Taller than content -> width constrained
          renderedHeight = rect.width / naturalRatio;
          contentTop = (rect.height - renderedHeight) / 2;
        }

        setImageBounds({
          x: rect.left + contentLeft,
          y: rect.top + contentTop,
          width: renderedWidth,
          height: renderedHeight,
        });
      }
      
      if (isActive) {
        animationFrameId = requestAnimationFrame(updateBounds);
      }
    };

    if (isActive) {
      updateBounds(); // Initial call
    } else {
      // One-off update if not active (e.g., if bounds changed while inactive)
      updateBounds(); 
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [containerRef, zoomLevel, panX, panY, isActive]);

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
