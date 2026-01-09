import React, { useRef, useEffect, useState, useCallback } from 'react';
import { PDFLink } from '../types';

interface LinkOverlayProps {
  links: PDFLink[];
  containerRef: React.RefObject<HTMLDivElement>;
  onNavigate?: (pageIndex: number) => void;
  disabled?: boolean; // Disable links during active presentation
}

interface PositionedLink extends PDFLink {
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
}

const LinkOverlay: React.FC<LinkOverlayProps> = ({
  links,
  containerRef,
  onNavigate,
  disabled = false,
}) => {
  const [positionedLinks, setPositionedLinks] = useState<PositionedLink[]>([]);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);

  // Calculate pixel positions based on image dimensions
  const calculatePositions = useCallback(() => {
    if (!containerRef.current || links.length === 0) {
      setPositionedLinks([]);
      return;
    }

    // Find the image element within the container
    const img = containerRef.current.querySelector('img[class*="object-contain"]') as HTMLImageElement;
    if (!img) {
      setPositionedLinks([]);
      return;
    }

    // If image hasn't loaded dimensions yet, we can't calculate correct positions
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      return;
    }

    const imgRect = img.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    // Calculate the actual rendered dimensions of the image within the img element
    // because object-fit: contain might leave empty space (letterboxing)
    const naturalRatio = img.naturalWidth / img.naturalHeight;
    const visibleRatio = imgRect.width / imgRect.height;

    let renderedWidth: number;
    let renderedHeight: number;
    let contentLeft: number;
    let contentTop: number;

    if (visibleRatio > naturalRatio) {
      // Container is wider than image -> Image is height-constrained
      renderedHeight = imgRect.height;
      renderedWidth = imgRect.height * naturalRatio;
      contentTop = 0;
      contentLeft = (imgRect.width - renderedWidth) / 2;
    } else {
      // Container is taller than image -> Image is width-constrained
      renderedWidth = imgRect.width;
      renderedHeight = imgRect.width / naturalRatio;
      contentLeft = 0;
      contentTop = (imgRect.height - renderedHeight) / 2;
    }

    // Calculate total offset relative to the container
    // imgRect coordinates are relative to viewport
    // containerRect coordinates are relative to viewport
    const finalOffsetX = (imgRect.left - containerRect.left) + contentLeft;
    const finalOffsetY = (imgRect.top - containerRect.top) + contentTop;

    const positioned = links.map((link) => ({
      ...link,
      pixelX: finalOffsetX + link.x * renderedWidth,
      pixelY: finalOffsetY + link.y * renderedHeight,
      pixelWidth: link.width * renderedWidth,
      pixelHeight: link.height * renderedHeight,
    }));

    setPositionedLinks(positioned);
  }, [links, containerRef]);

  // Recalculate on resize and when links change
  useEffect(() => {
    calculatePositions();

    const handleResize = () => {
      requestAnimationFrame(calculatePositions);
    };

    window.addEventListener('resize', handleResize);
    
    // Also observe container for size changes
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [calculatePositions, containerRef]);

  // Recalculate after image loads
  useEffect(() => {
    if (!containerRef.current) return;

    const img = containerRef.current.querySelector('img') as HTMLImageElement;
    if (img) {
      if (img.complete) {
        calculatePositions();
      } else {
        img.addEventListener('load', calculatePositions);
        return () => img.removeEventListener('load', calculatePositions);
      }
    }
  }, [calculatePositions, containerRef]);

  const handleClick = (link: PositionedLink, e: React.MouseEvent) => {
    if (disabled) return;
    
    e.preventDefault();
    e.stopPropagation();

    if (link.url) {
      // External link - open in new tab
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } else if (typeof link.dest === 'number' && onNavigate) {
      // Internal link - navigate to page
      onNavigate(link.dest);
    }
  };

  if (links.length === 0 || positionedLinks.length === 0) {
    return null;
  }

  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {positionedLinks.map((link, index) => (
        <div
          key={index}
          className={`absolute transition-all duration-150 ${
            disabled 
              ? 'cursor-default' 
              : 'pointer-events-auto cursor-pointer'
          }`}
          style={{
            left: `${link.pixelX}px`,
            top: `${link.pixelY}px`,
            width: `${link.pixelWidth}px`,
            height: `${link.pixelHeight}px`,
            backgroundColor: hoveredLink === index && !disabled
              ? 'rgba(59, 130, 246, 0.2)' // Blue highlight on hover
              : 'transparent',
            border: hoveredLink === index && !disabled
              ? '2px solid rgba(59, 130, 246, 0.6)'
              : '2px solid transparent',
            borderRadius: '2px',
          }}
          onClick={(e) => handleClick(link, e)}
          onMouseEnter={() => !disabled && setHoveredLink(index)}
          onMouseLeave={() => setHoveredLink(null)}
          title={
            disabled 
              ? undefined 
              : link.url 
                ? `Open: ${link.url}` 
                : link.dest !== undefined 
                  ? `Go to slide ${link.dest + 1}` 
                  : undefined
          }
        />
      ))}
    </div>
  );
};

export default LinkOverlay;

