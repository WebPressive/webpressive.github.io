import * as pdfjsLib from 'pdfjs-dist';
import { SlideData, PDFLink } from '../types';

// Configure PDF.js worker for Vite
// Use CDN for reliability (Vite can have issues with worker imports)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PDFPageData {
  pageNumber: number;
  blob: Blob;
  blobUrl: string;
  imageData: string; // Base64 data URL for sharing
  notes?: string; // Extracted speaker notes
  links?: PDFLink[]; // Embedded links
}

// Store for notes loaded from PDF metadata
let metadataNotes: Record<string, string> = {};

// Cache for PDF documents to enable re-rendering at different zoom levels
interface PDFCache {
  pdf: any; // PDF.js document
  file: File;
  arrayBuffer: ArrayBuffer;
}

let pdfCache: PDFCache | null = null;

/**
 * Extracts link annotations from a PDF page
 * @param page - The PDF page object
 * @param pdf - The PDF document (for resolving internal destinations)
 * @returns Promise resolving to an array of PDFLink objects
 */
async function extractLinksFromPage(page: any, pdf: any): Promise<PDFLink[]> {
  const links: PDFLink[] = [];
  
  try {
    const annotations = await page.getAnnotations();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    
    for (const annotation of annotations) {
      // Only process link annotations
      if (annotation.subtype !== 'Link') continue;
      
      // Get the rectangle (position) of the link
      // rect is [x1, y1, x2, y2] in PDF coordinates (origin at bottom-left)
      const rect = annotation.rect;
      if (!rect || rect.length < 4) continue;

      // IMPORTANT: PDF coordinates need to be transformed into viewport coordinates
      // to account for rotation, cropBox/viewBox offsets, etc.
      // This returns [x1, y1, x2, y2] in viewport coords where origin is top-left.
      const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(rect);

      const left = Math.min(vx1, vx2);
      const top = Math.min(vy1, vy2);
      const right = Math.max(vx1, vx2);
      const bottom = Math.max(vy1, vy2);

      // Normalize to 0-1 range relative to the page viewport
      const x = left / pageWidth;
      const y = top / pageHeight;
      const width = (right - left) / pageWidth;
      const height = (bottom - top) / pageHeight;

      // Skip tiny/invalid rectangles
      if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) continue;
      if (width <= 0 || height <= 0) continue;

      const link: PDFLink = { x, y, width, height };
      
      // Check for external URL
      if (annotation.url) {
        link.url = annotation.url;
        links.push(link);
        continue;
      }
      
      // Check for internal destination (page reference)
      if (annotation.dest) {
        try {
          // dest can be a string name or an array
          let destArray = annotation.dest;
          if (typeof destArray === 'string') {
            // Resolve named destination
            const destRef = await pdf.getDestination(destArray);
            if (destRef) {
              destArray = destRef;
            }
          }
          
          if (Array.isArray(destArray) && destArray.length > 0) {
            // First element is a reference to the page
            const pageRef = destArray[0];
            if (pageRef) {
              // Get the page index from the reference
              const pageIndex = await pdf.getPageIndex(pageRef);
              if (typeof pageIndex === 'number') {
                link.dest = pageIndex; // 0-indexed page number
                links.push(link);
              }
            }
          }
        } catch (e) {
          console.debug('Failed to resolve internal link destination:', e);
        }
        continue;
      }
      
      // Check for action-based links (GoTo actions)
      if (annotation.action) {
        const action = annotation.action;
        if (action.action === 'GoTo' && action.dest) {
          try {
            let destArray = action.dest;
            if (typeof destArray === 'string') {
              const destRef = await pdf.getDestination(destArray);
              if (destRef) {
                destArray = destRef;
              }
            }
            
            if (Array.isArray(destArray) && destArray.length > 0) {
              const pageRef = destArray[0];
              if (pageRef) {
                const pageIndex = await pdf.getPageIndex(pageRef);
                if (typeof pageIndex === 'number') {
                  link.dest = pageIndex;
                  links.push(link);
                }
              }
            }
          } catch (e) {
            console.debug('Failed to resolve GoTo action destination:', e);
          }
        } else if (action.action === 'URI' && action.uri) {
          link.url = action.uri;
          links.push(link);
        }
      }
    }
  } catch (e) {
    console.debug('Failed to extract links from page:', e);
  }
  
  return links;
}

/**
 * Get note for a specific page (from PDF metadata)
 */
function getMetadataNote(pageNumber: number): string | undefined {
  return metadataNotes[pageNumber.toString()];
}

/**
 * Extracts speaker notes from a PDF page
 * Beamer stores notes in text annotations, popup annotations, or as text content
 * 
 * Required PDF metadata:
 * - Text annotations with 'contents' field
 * - Popup annotations with 'contents' field  
 * - Rich text annotations with formatted text
 * - Optional: Text content positioned as notes (heuristic)
 */
async function extractNotesFromPage(page: any): Promise<string | undefined> {
  try {
    let notesText = '';
    
    // Method 1: Check text annotations (most common for Beamer)
    // Beamer typically uses Text annotations or Popup annotations
    const annotations = await page.getAnnotations();
    
    for (const annotation of annotations) {
      // Check for text annotations with contents
      // This is the primary way Beamer stores notes
      if (annotation.contents && annotation.contents.trim()) {
        const content = annotation.contents.trim();
        // Filter out very short contents that are likely not notes
        if (content.length > 10) {
          notesText += content + '\n';
        }
      }
      
      // Check for popup annotations (often used for notes)
      // Popup annotations are linked to parent annotations
      if (annotation.popup && annotation.popup.contents) {
        const popupContent = annotation.popup.contents.trim();
        if (popupContent.length > 10) {
          notesText += popupContent + '\n';
        }
      }
      
      // Check for rich text annotations (formatted text)
      // Rich text is stored as XML-like markup
      if (annotation.richText) {
        // Try to extract text from rich text XML
        const richTextMatch = annotation.richText.match(/<text[^>]*>([^<]*)<\/text>/g);
        if (richTextMatch) {
          richTextMatch.forEach((match: string) => {
            const textMatch = match.match(/>([^<]*)</);
            if (textMatch && textMatch[1] && textMatch[1].trim().length > 10) {
              notesText += textMatch[1].trim() + '\n';
            }
          });
        }
        // Also try to extract plain text if XML parsing fails
        const plainText = annotation.richText.replace(/<[^>]*>/g, ' ').trim();
        if (plainText && plainText.length > 10) {
          notesText += plainText + '\n';
        }
      }
      
      // Check for annotation title/subject (sometimes used for notes)
      if (annotation.title && annotation.title.trim()) {
        // Only include if it looks like a note (not just "Note" or similar)
        if (annotation.title.length > 10) {
          notesText += annotation.title.trim() + '\n';
        }
      }
      
      // Check annotation subtype - Text annotations are most common for notes
      if (annotation.subtype === 'Text' && annotation.contents) {
        const content = annotation.contents.trim();
        if (content.length > 10) {
          notesText += content + '\n';
        }
      }
    }
    
    // Method 2: Try to get text content and look for notes patterns
    // Beamer notes are often in a separate layer or at specific positions
    try {
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Filter text items that might be notes (often positioned differently)
      // Notes are typically in smaller font or at specific Y positions
      // BUT: Skip this fallback if we found actual annotations above
      // This prevents extracting slide content when annotations exist
      if (notesText.trim().length === 0) {
        const textItems = textContent.items.filter((item: any) => {
          // Heuristic: Notes might be in smaller font sizes or at bottom of page
          const fontSize = item.height || 0;
          const yPos = item.transform ? item.transform[5] : 0;
          
          // If text is very small or at the bottom, it might be notes
          // Adjust thresholds based on typical Beamer layouts
          return fontSize < 10 || yPos < viewport.height * 0.1;
        });
        
        if (textItems.length > 0) {
          const potentialNotes = textItems
            .map((item: any) => item.str)
            .filter((str: string) => str && str.trim().length > 0)
            .join(' ');
          
          if (potentialNotes && potentialNotes.length > 10) {
            notesText += potentialNotes + '\n';
          }
        }
      }
    } catch (textError) {
      // If text extraction fails, continue with annotations only
      console.debug('Text content extraction failed, using annotations only');
    }
    
    // Clean up and return notes
    const cleanedNotes = notesText.trim();
    if (cleanedNotes && cleanedNotes.length > 0) {
      return cleanedNotes;
    }
    
    return undefined;
  } catch (error) {
    console.warn('Error extracting notes from page:', error);
    return undefined;
  }
}

/**
 * Calculates optimal scale for PDF rendering based on device pixel ratio
 * Ensures high quality on retina/high-DPI displays
 * For presentations, we want at least 300 DPI equivalent quality
 */
function calculateOptimalScale(): number {
  const devicePixelRatio = window.devicePixelRatio || 1;
  // Use much higher scale for presentation quality
  // Target ~300 DPI equivalent (scale of ~4-5 for standard displays)
  // For retina displays (2x), use even higher scale
  // Cap at 6.0 to balance quality and memory
  return Math.min(Math.max(devicePixelRatio * 3.0, 4.0), 6.0);
}

/**
 * Extracts all pages from a PDF file and converts them to image blobs
 * @param file - The PDF file to process
 * @param scale - Scale factor for rendering (if not provided, calculated automatically)
 * @returns Promise resolving to an array of page data with blobs and blob URLs
 */
export async function extractPagesFromPDF(
  file: File,
  scale?: number,
  onProgress?: (current: number, total: number) => void
): Promise<PDFPageData[]> {
  // Reset metadata notes for new PDF
  metadataNotes = {};
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  // Cache PDF for zoom re-rendering
  pdfCache = {
    pdf,
    file,
    arrayBuffer,
  };
  
  const pages: PDFPageData[] = [];
  
  // Check document-level metadata for speaker notes
  // Notes are stored in pdfsubject as: SPEAKERNOTES|pageNum|note|pageNum|note|...
  try {
    const metadata = await pdf.getMetadata();
    if (metadata?.info && typeof metadata.info === 'object' && 'Subject' in metadata.info) {
      const subject = (metadata.info as { Subject?: string }).Subject;
      if (subject && subject.startsWith('SPEAKERNOTES|')) {
        try {
          // Parse pipe-delimited format: SPEAKERNOTES|pageNum|note|pageNum|note|...
          const parts = subject.substring('SPEAKERNOTES|'.length).split('|');
          const parsedNotes: Record<string, string> = {};
          for (let i = 0; i < parts.length - 1; i += 2) {
            const pageNumStr = parts[i];
            const noteText = parts[i + 1];
            if (pageNumStr && noteText) {
              // Convert to number - Beamer may store as 0-indexed or 1-indexed
              const pageNumFromMetadata = parseInt(pageNumStr, 10);
              if (!isNaN(pageNumFromMetadata)) {
                // PDF.js uses 1-indexed pages, so if metadata is 0-indexed, add 1
                // Try both interpretations to handle different Beamer versions
                const pageNum1Indexed = pageNumFromMetadata + 1;
                // Store with 1-indexed key (matching PDF.js page numbering)
                parsedNotes[pageNum1Indexed.toString()] = noteText;
                // Also store with original if it's already 1-indexed (for compatibility)
                if (pageNumFromMetadata > 0 && pageNumFromMetadata <= 100) {
                  parsedNotes[pageNumFromMetadata.toString()] = noteText;
                }
              }
            }
          }
          if (Object.keys(parsedNotes).length > 0) {
            metadataNotes = parsedNotes;
            console.log('Loaded speaker notes from PDF metadata:', Object.entries(parsedNotes).map(([k, v]) => `Page ${k}: ${v.substring(0, 50)}...`));
          }
        } catch (parseError) {
          console.warn('Failed to parse speaker notes from PDF metadata:', parseError);
        }
      }
    }
  } catch (e) {
    // Metadata extraction is optional, continue if it fails
    console.debug('Metadata extraction failed:', e);
  }
  
  // Use provided scale or calculate optimal scale
  const renderScale = scale ?? calculateOptimalScale();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // First check for notes from PDF metadata, then fall back to PDF annotation extraction
    // Note: pageNum is 1-indexed (PDF pages start at 1)
    // If metadata uses 0-indexed, the notes for page N would be stored at key (N-1)
    // So we check both the current page and page-1 to handle both cases
    let notes = getMetadataNote(pageNum);
    if (!notes && pageNum > 1) {
      // Try previous page number (in case metadata uses 0-indexed numbering)
      notes = getMetadataNote(pageNum - 1);
    }
    if (!notes) {
      // Fall back to extracting from page annotations
      notes = await extractNotesFromPage(page);
    }

    // Get device pixel ratio for high-DPI rendering
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Calculate final scale: combine render scale with device pixel ratio
    // This ensures we render at native resolution for the display
    const finalScale = renderScale * devicePixelRatio;
    const viewport = page.getViewport({ scale: finalScale });

    // Create a canvas to render the page
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', {
      alpha: false, // Opaque background for better performance
      desynchronized: true, // Allow async rendering
      willReadFrequently: false, // Optimize for rendering, not reading
    });
    
    if (!context) {
      throw new Error('Could not get canvas context');
    }

    // Set canvas internal size to match the high-resolution viewport
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render the page to the canvas with high quality settings
    await page.render({
      canvasContext: context,
      viewport: viewport,
      intent: 'display', // Optimize for display quality
    }).promise;

    // Convert canvas to blob with maximum quality (PNG is lossless)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png', 1.0); // Maximum quality (1.0 = lossless)
    });

    const blobUrl = URL.createObjectURL(blob);
    // Also store as data URL for sharing via BroadcastChannel
    // Note: toDataURL quality parameter only applies to JPEG, PNG is always lossless
    const imageData = canvas.toDataURL('image/png');
    
    // Extract embedded links from the page
    const links = await extractLinksFromPage(page, pdf);
    if (links.length > 0) {
      console.log(`Page ${pageNum}: Found ${links.length} embedded links`);
    }
    
    pages.push({
      pageNumber: pageNum,
      blob,
      blobUrl,
      imageData,
      notes,
      links,
    });

    // Report progress after each page is processed
    if (onProgress) {
      onProgress(pageNum, pdf.numPages);
    }
  }

  return pages;
}

/**
 * Converts a PDF file to an array of slide data
 * @param file - The PDF file to process
 * @param pdfName - The name of the PDF file
 * @returns Promise resolving to an array of SlideData objects
 */
export async function pdfToSlides(
  file: File,
  pdfName: string,
  onProgress?: (current: number, total: number) => void
): Promise<SlideData[]> {
  const pages = await extractPagesFromPDF(file, undefined, onProgress);
  
  return pages.map((page) => ({
    id: crypto.randomUUID(),
    src: page.blobUrl,
    name: `${pdfName} - Slide ${page.pageNumber}`,
    // Store the blob as a File-like object for dual-screen sharing
    // Convert Blob to File so it works with existing code
    file: new File([page.blob], `${pdfName}_slide_${page.pageNumber}.png`, { type: 'image/png' }),
    // Store base64 data for sharing via BroadcastChannel (File objects don't serialize)
    imageData: page.imageData,
    // Store speaker notes if available
    notes: page.notes,
    // Store embedded links
    links: page.links,
  }));
}

/**
 * Re-renders a specific PDF page at a given zoom level
 * @param pageNumber - The page number to render (1-indexed)
 * @param zoomLevel - Zoom level (1.0 = 100%, 2.0 = 200%, etc.)
 * @returns Promise resolving to a blob URL for the zoomed image
 */
export async function renderPageAtZoom(
  pageNumber: number,
  zoomLevel: number
): Promise<string> {
  if (!pdfCache) {
    throw new Error('PDF cache not available. Load a PDF first.');
  }

  const { pdf } = pdfCache;
  const page = await pdf.getPage(pageNumber);
  
  // Calculate scale: base scale * zoom level * device pixel ratio
  const baseScale = calculateOptimalScale();
  const devicePixelRatio = window.devicePixelRatio || 1;
  const finalScale = baseScale * zoomLevel * devicePixelRatio;
  
  const viewport = page.getViewport({ scale: finalScale });

  // Create a canvas to render the page
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false,
  });
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  // Render the page
  await page.render({
    canvasContext: context,
    viewport: viewport,
    intent: 'display',
  }).promise;

  // Convert to blob URL
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/png', 1.0);
  });

  return URL.createObjectURL(blob);
}

