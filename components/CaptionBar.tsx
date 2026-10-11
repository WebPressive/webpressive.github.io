import React from 'react';

const MAX_CHARS = 160; // About two lines: older words drop off the front

/** The end of `text`, cut at a word boundary to about two caption lines. */
export function captionTail(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_CHARS) return clean;
  const cut = clean.slice(-MAX_CHARS);
  const space = cut.indexOf(' ');
  return '…' + (space >= 0 ? cut.slice(space + 1) : cut);
}

/** Captions at the bottom of the audience view (live, or from a recording's transcript). */
const CaptionBar: React.FC<{ text: string | null | undefined }> = ({ text }) => {
  if (!text) return null;
  return (
    <div className="absolute inset-x-0 bottom-[6%] z-[60] flex justify-center pointer-events-none px-[5%]" data-caption="">
      <div
        className="max-w-[min(90%,60em)] px-[0.6em] py-[0.25em] rounded-[0.3em] bg-black/75 text-white text-center leading-snug"
        style={{ fontSize: 'clamp(14px, 2.4vw, 44px)' }}
      >
        {captionTail(text)}
      </div>
    </div>
  );
};

export default CaptionBar;
