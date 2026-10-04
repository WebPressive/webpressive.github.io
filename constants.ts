export const DEMO_SLIDES = [
  { id: '1', src: 'https://picsum.photos/id/10/1600/900', name: 'Intro' },
  { id: '2', src: 'https://picsum.photos/id/14/1600/900', name: 'Architecture' },
  { id: '3', src: 'https://picsum.photos/id/19/1600/900', name: 'Design' },
  { id: '4', src: 'https://picsum.photos/id/29/1600/900', name: 'Implementation' },
  { id: '5', src: 'https://picsum.photos/id/35/1600/900', name: 'Testing' },
  { id: '6', src: 'https://picsum.photos/id/42/1600/900', name: 'Deployment' },
  { id: '7', src: 'https://picsum.photos/id/48/1600/900', name: 'Conclusion' },
  { id: '8', src: 'https://picsum.photos/id/56/1600/900', name: 'Q&A' },
];

export const TRANSITION_DURATION = 0.5;
export const SPOTLIGHT_SIZE = 200;

// --- Annotations ---
export const ANNOTATION_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#facc15' },
  { name: 'Black', value: '#171717' },
  { name: 'White', value: '#fafafa' },
];
// Stroke widths as a fraction of slide image width (0.004 = 4px on a 1000px wide slide)
export const ANNOTATION_WIDTHS = [
  { name: 'Thin', value: 0.002 },
  { name: 'Medium', value: 0.004 },
  { name: 'Thick', value: 0.008 },
];
export const HIGHLIGHTER_WIDTH_FACTOR = 4;
export const TEXT_SIZE_FACTOR = 6; // Text font size = selected stroke width × this
export const TEXT_LINE_HEIGHT = 1.2;
export const TEXT_FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const HIGHLIGHTER_OPACITY = 0.45;
export const ANNOTATION_HISTORY_LIMIT = 100;
export const ANNOTATION_STORAGE_KEY = 'webpressive_annotations';
