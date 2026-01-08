import React, { useEffect, useState } from 'react';
import { SPOTLIGHT_SIZE } from '../constants';

interface SpotlightLayerProps {
  isActive: boolean;
}

const SpotlightLayer: React.FC<SpotlightLayerProps> = ({ isActive }) => {
  const [mousePos, setMousePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isActive) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none transition-opacity duration-300"
      style={{
        background: `radial-gradient(circle ${SPOTLIGHT_SIZE}px at ${mousePos.x}px ${mousePos.y}px, transparent 0%, rgba(0, 0, 0, 0.85) 100%)`,
      }}
    />
  );
};

export default SpotlightLayer;
