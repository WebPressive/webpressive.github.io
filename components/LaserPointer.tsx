import React from 'react';
import { motion } from 'framer-motion';
import { useSlideImageBounds } from '../utils/slideImageBounds';

interface LaserPointerProps {
  isActive: boolean;
  position: { x: number; y: number } | null;
  containerRef?: React.RefObject<HTMLElement>;
  zoomLevel?: number;
  panX?: number;
  panY?: number;
}

const LaserPointer: React.FC<LaserPointerProps> = ({ isActive, position, containerRef, zoomLevel = 1.0, panX = 0, panY = 0 }) => {
  // Track the rendered slide image bounds (polled every frame while active)
  const imageBounds = useSlideImageBounds(containerRef, isActive, [zoomLevel, panX, panY]);

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
