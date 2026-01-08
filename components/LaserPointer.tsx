import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface LaserPointerProps {
  isActive: boolean;
  position: { x: number; y: number } | null;
  containerRef?: React.RefObject<HTMLElement>;
}

const LaserPointer: React.FC<LaserPointerProps> = ({ isActive, position, containerRef }) => {
  const [imageBounds, setImageBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Find the image element within the container
  useEffect(() => {
    const updateBounds = () => {
      const container = containerRef?.current || document.body;
      const img = container.querySelector('img[class*="object-contain"]') as HTMLImageElement;
      
      if (img) {
        imageRef.current = img;
        const rect = img.getBoundingClientRect();
        setImageBounds({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateBounds();
    window.addEventListener('resize', updateBounds);
    // Also update on image load
    const img = containerRef?.current?.querySelector('img[class*="object-contain"]') as HTMLImageElement;
    if (img) {
      img.addEventListener('load', updateBounds);
    }

    return () => {
      window.removeEventListener('resize', updateBounds);
      if (img) {
        img.removeEventListener('load', updateBounds);
      }
    };
  }, [containerRef]);

  if (!isActive || !position || !imageBounds) return null;

  // Position is normalized relative to the image (0-1 range)
  // Convert to actual pixel position within the image bounds
  const pixelX = imageBounds.x + (position.x * imageBounds.width);
  const pixelY = imageBounds.y + (position.y * imageBounds.height);

  return (
    <motion.div
      className="fixed z-50 pointer-events-none"
      style={{
        left: `${pixelX}px`,
        top: `${pixelY}px`,
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ duration: 0.1 }}
    >
      {/* Outer glow */}
      <div
        className="absolute w-8 h-8 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255, 0, 0, 0.6) 0%, rgba(255, 0, 0, 0.3) 40%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
        }}
      />
      {/* Inner bright dot */}
      <div
        className="absolute w-3 h-3 rounded-full bg-red-500"
        style={{
          boxShadow: '0 0 10px rgba(255, 0, 0, 0.8), 0 0 20px rgba(255, 0, 0, 0.5)',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </motion.div>
  );
};

export default LaserPointer;

