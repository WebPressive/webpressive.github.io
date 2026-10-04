

# WebPressive

A dual-screen presenter for LaTeX Beamer PDFs.

🌐 **Live Demo**: [View on GitHub Pages](https://webpressive.github.io)

## 📦 Downloads

**Latest Release: [v0.1.6](https://github.com/WebPressive/webpressive.github.io/releases/tag/v0.1.6)** (October 2026)

Download the desktop application for your platform:

- **Windows**: [WebPressive Setup 0.1.6.exe](https://github.com/WebPressive/webpressive.github.io/releases/download/v0.1.6/WebPressive.Setup.0.1.6.exe) (102 MB)
- **Linux**: [WebPressive-0.1.6.AppImage](https://github.com/WebPressive/webpressive.github.io/releases/download/v0.1.6/WebPressive-0.1.6.AppImage) (141 MB)

### Installation

- **Windows**: Run the installer and follow the setup wizard
- **Linux**: Make the AppImage executable (`chmod +x WebPressive-0.1.6.AppImage`) and run it

For release notes and more information, visit the [Releases page](https://github.com/WebPressive/webpressive.github.io/releases).

## Features

- **Dual-Screen Mode**: Open a synchronized receiver window for projector displays
- **PDF Import**: Load Beamer PDF presentations with real-time progress tracking
- **Speaker Notes**: Automatically extracts and displays speaker notes from Beamer PDFs
- **Embedded Links**: Clickable links from PDFs are preserved and functional
- **Animated GIFs & Videos**: Play GIF, MP4 or WebM files over their poster stills, marked in Beamer with a `wpmedia:` link
- **Zoom & Pan**: Multiple zoom modes with smooth panning
  - Fixed zoom levels (50%, 100%, 150%, 200%)
  - Continuous zoom with mouse wheel
  - Region selection zoom
  - Pan with right-click drag when zoomed
- **Spotlight**: Dim the screen except for a highlighted area
- **Laser Pointer**: Synchronized laser pointer across presenter and receiver screens
- **Clickers & Mouse Wheel**: Presentation clickers work in either window (keys pressed in the receiver window are passed to the presenter); the mouse wheel changes slides
- **Annotations**: Draw on slides with pen, highlighter, line, arrow, rectangle and ellipse tools, or click and type text notes
  - Color and stroke width palette, undo/redo, clear slide / clear all
  - Eraser removes just the part of a stroke under the cursor (shapes and text are removed whole)
  - Strokes are mirrored live to the receiver window and follow zoom & pan
  - Kept per slide and remembered across reloads of the same PDF
- **Overview Mode**: Grid view of all slides for quick navigation
- **Resizable Panels**: Customize presenter view layout (main slide, next slide preview, notes)
- **Fullscreen Support**: Present in fullscreen mode

## Demo Presentation

The demo presentation is provided by the [HRG Beamer Template](https://github.com/bankh/hrg-beamer-template), which is included as a Git submodule. This template demonstrates:
- Speaker notes embedded in PDF metadata
- LaTeX source code showing how to structure presentations with notes
- Examples of various Beamer slide layouts and features

> **Note:** The HRG Beamer Template used here is a cloned version from the [original repository](https://github.com/danielrherber/hrg-beamer-template) that includes comprehensive speaker notes.

**To clone with the submodule:**
```bash
git clone --recurse-submodules git@github.com:WebPressive/webpressive.git
```

The HRG Beamer Template submodule is located in `public/hrg-beamer-template/` and contains:
- `slides.pdf` - The demo PDF used by WebPressive
- LaTeX source files showing how to structure presentations with speaker notes
- Examples of the `\annotation{}` command and PDF metadata embedding

**If you already cloned without submodules:**
```bash
git submodule update --init --recursive public/hrg-beamer-template
```

**To update the submodule to the latest version:**
```bash
git submodule update --remote public/hrg-beamer-template
```

## Run Locally

### Option 1: Using Docker (Recommended for Development)

**Prerequisites:** Docker and Docker Compose

1. Build and run the container:
   ```bash
   docker-compose up --build
   ```

3. The app will be available at `http://localhost:3000`
   - Hot reload is enabled - changes to your code will automatically refresh
   - To stop the container: `docker-compose down`

**Development Commands:**
- Start in detached mode: `docker-compose up -d`
- View logs: `docker-compose logs -f`
- Rebuild after dependency changes: `docker-compose up --build`
- Execute commands in container: `docker-compose exec webpressive npm <command>`

### Option 2: Using Node.js Directly

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Production Deployment

To build a production Docker image:

```bash
docker build -f Dockerfile.prod -t webpressive:prod .
docker run -p 80:80 webpressive:prod
```

The production build uses Nginx to serve the optimized static files.

## Keyboard Shortcuts

### Navigation
- **Arrow Left** / **Arrow Right**: Previous / Next slide
- **Space** / **Page Down**: Next slide
- **Page Up** / **Backspace**: Previous slide
- **Mouse wheel**: Next / previous slide, one per scroll gesture (**Shift + wheel** zooms)

### Presentation Modes
- **TAB**: Toggle overview mode (grid view of all slides)
- **S**: Toggle spotlight mode
- **L**: Toggle laser pointer
- **D**: Toggle dual-screen mode (receiver window)
- **F**: Toggle fullscreen
- **F5**: Fullscreen (a clicker's "start slideshow" button; the page is not reloaded)
- **B** or **.**: Black screen on the projector; the next navigation key brings the slide back
- **A**: Show about dialog (works in dual-screen mode)
- **P**: Pause/Resume presentation timer
- **M**: Toggle animations (GIFs/videos) on/off (see [Animated GIFs & Videos](#animated-gifs--videos))
- **Escape**: Exit current mode (overview, spotlight, laser, or region zoom)

### Speaker Notes (Dual-Screen Mode)
- **T**: Scroll speaker notes up (line-by-line)
- **G**: Scroll speaker notes down (line-by-line)
- **+ button**: Increase font size (in notes panel)
- **− button**: Decrease font size (in notes panel)
- **Eye button**: Toggle reading guide (fixed highlight line for tracking)

> **Note:** Speaker notes automatically scroll to the top when navigating to a new slide in dual-screen mode. The reading guide helps you track your position while reading long notes.

### Timer Controls
- **P**: Pause/Resume presentation timer
- **Click clock**: Reset timer to 00:00

### Zoom Controls
- **1**: Zoom to 50%
- **2**: Zoom to 100% (normal size)
- **3**: Zoom to 150%
- **4**: Zoom to 200%
- **R**: Reset zoom to 100%
- **Z**: Enter region zoom mode (then click and drag to select area)
- **Shift + Mouse Wheel**: Continuous zoom in/out
- **Right-Click + Drag**: Pan when zoomed in
- **H**: Pan left (when zoomed)
- **J**: Pan down (when zoomed)
- **K**: Pan right (when zoomed)
- **U**: Pan up (when zoomed)

### Mouse Interactions
- **Left Click**: Navigate links (when not in region zoom mode)
- **Right-Click + Drag**: Pan the slide when zoomed
- **Z + Left Click + Drag**: Select region to zoom into

## Features in Detail

### Dual-Screen Mode
Open a synchronized receiver window that displays the current slide on a second screen or projector. The receiver window automatically syncs:
- Current slide
- Zoom level and pan position
- Spotlight state
- Laser pointer position
- Overview mode

### Speaker Notes
WebPressive automatically extracts speaker notes from Beamer PDFs. Notes are displayed in the presenter view sidebar and can be scrolled if they are long.

**Demo Presentation with Speaker Notes:**
The demo presentation uses the [HRG Beamer Template](https://github.com/bankh/hrg-beamer-template) (included as a Git submodule), which includes comprehensive speaker notes demonstrating how to structure and embed notes in LaTeX Beamer presentations. The template shows:
- How to use the `\annotation{}` command in LaTeX source
- How speaker notes are embedded in PDF metadata
- Examples of speaker notes for various slide types

> **Note:** This is a cloned version from the [original HRG Beamer Template repository](https://github.com/danielrherber/hrg-beamer-template) that has been enhanced with speaker notes.

To view the LaTeX source code showing how speaker notes are created, see the `hrg-beamer-template/` directory (Git submodule).

### Zoom Functionality
Three zoom modes are available:
1. **Fixed Levels**: Press `1`, `2`, `3`, or `4` for preset zoom levels
2. **Continuous**: Hold `Shift` and scroll the mouse wheel for smooth zooming
3. **Region Selection**: Press `Z`, then click and drag to select a region. Release to zoom into that area

When zoomed in, use right-click and drag to pan around the slide, or use keyboard shortcuts: `H` (left), `J` (down), `K` (right), `U` (up). Press `R` to reset zoom.

### Embedded Links
Links embedded in the PDF (both internal navigation and external URLs) are preserved and clickable. Internal links navigate to the target slide, while external links open in a new tab.

### Animated GIFs & Videos
A PDF cannot play a GIF. The slide carries a still (the *poster*), and WebPressive plays the GIF, MP4 or WebM over it at the poster's exact position, in the main view and the receiver window.

#### 1. Folder layout
Keep each animation next to its poster in the Beamer project. With `\graphicspath{{figures/}}` the layout is:

```
MyTalk/                              ← the folder that holds the PDF
├── main-animated.tex
├── main-animated.pdf                ← open this one in WebPressive
└── figures/
    └── videos/
        ├── demo_clip_poster.png     ← the still shown in the PDF (a frame of the GIF)
        ├── demo_clip.gif            ← the animation played over it
        └── clips/
            ├── run_poster.png
            └── run.webm
```

A media path is written relative to the PDF's folder, and the `figures/` prefix may be left out: `wpmedia:videos/demo_clip.gif` finds `figures/videos/demo_clip.gif` (or `videos/demo_clip.gif` next to the PDF). The poster must have the GIF's aspect ratio, because the GIF is stretched to fill the poster's box.

#### 2. Mark the posters in Beamer
Wrap each poster in a link whose URI is `wpmedia:<media path>`. This macro also attaches the media file to the PDF, once per file, so the PDF carries its animations:

```latex
\graphicspath{{figures/}}
\usepackage{embedfile}
% No link borders, and no 1pt padding around link boxes (pdfTeX's default): the box must match the poster
\hypersetup{hidelinks, pdflinkmargin=0pt}
\makeatletter
% \wpmedia{media path}{poster}: plays the media over the poster; attaches figures/<media path> once
\newcommand\wpmedia[2]{%
  \ifcsname wpm@#1\endcsname\else
    \global\expandafter\let\csname wpm@#1\endcsname\relax
    \embedfile[filespec=#1]{figures/#1}%
  \fi
  \mbox{\href{wpmedia:#1}{#2}}}% own box: the link is as tall as the poster, not the text line
\makeatother

% On a slide
\wpmedia{videos/demo_clip.gif}{\includegraphics[height=4cm]{videos/demo_clip_poster.png}}
\wpmedia{videos/clips/run.webm}{\includegraphics[height=3cm]{videos/clips/run_poster.png}}
```

- **Clicks:** put the link only on the overlays where the poster is fully shown, for example `\only<3->{\wpmedia{…}{…}}` with the plain poster in `\only<1-2>{…}`. A link inside covered (ghosted) content would play the GIF over a faded poster.
- **Handout:** leave the links out of a handout build that is not presented in WebPressive; its posters stay plain stills.
- **Size:** attached media adds its file size to the PDF. Without `\embedfile` the PDF stays small and the media is loaded from the folder instead (step 3).
- **Older decks:** links whose URI ends in `.gif`, `.mp4` or `.webm` are treated like `wpmedia:` links.

#### 3. Present
| The PDF… | Browser | Desktop app |
|---|---|---|
| carries its media (`\embedfile`) | Open the PDF. | Open the PDF. |
| does not carry its media | Click **Open folder with animations** and pick the project folder (`MyTalk/`), drop that folder onto the upload card, or select the PDF together with its media files. If you open only the PDF, a banner offers **Choose deck folder…**, which adds the media to the running presentation. | Open the PDF: the media is read from the PDF's folder and its `figures/` folder. |

Picked files are matched to a link's path in this order: the exact path, the path under `figures/`, the longest matching path tail, then a unique file name. If several PDFs sit at the top of a picked folder, WebPressive asks which one is the deck.

#### 4. During the talk
- Media restarts from its first frame each time its slide is shown, and follows zoom and pan.
- Ink, laser and spotlight stay above it; it never takes clicks.
- Thumbnails, the overview and the next-slide preview show the still.
- `M` turns animations off and on (also on the receiver).
- A missing or unreadable file leaves its still in place.

### Progress Indicator
When loading a PDF, a progress bar shows the current processing status with page-by-page feedback.

## License

Copyright (c) 2026 Sinan Bank

This software is provided for educational use only. See [LICENSE](LICENSE) for details.
