import React from 'react';

interface RegionSelectorProps {
  isActive: boolean;
  start: { x: number; y: number } | null;
  current: { x: number; y: number } | null;
  containerRef: React.RefObject<HTMLElement>;
}

const RegionSelector: React.FC<RegionSelectorProps> = ({
  isActive,
  start,
  current,
  containerRef,
}) => {
  if (!isActive || !start || !current) return null;

  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  return (
    <div
      className="absolute pointer-events-none z-50 border-2 border-blue-500 bg-blue-500/20"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <div className="absolute inset-0 border-2 border-dashed border-blue-400" />
    </div>
  );
};

export default RegionSelector;

