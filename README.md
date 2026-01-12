

# WebPressive

A dual-screen presenter for LaTeX Beamer PDFs.

🌐 **Live Demo**: [View on GitHub Pages](https://webpressive.github.io)

## Features

- **Dual-Screen Mode**: Open a synchronized receiver window for projector displays
- **PDF Import**: Load Beamer PDF presentations with real-time progress tracking
- **Speaker Notes**: Automatically extracts and displays speaker notes from Beamer PDFs
- **Embedded Links**: Clickable links from PDFs are preserved and functional
- **Zoom & Pan**: Multiple zoom modes with smooth panning
  - Fixed zoom levels (50%, 100%, 150%, 200%)
  - Continuous zoom with mouse wheel
  - Region selection zoom
  - Pan with right-click drag when zoomed
- **Spotlight**: Dim the screen except for a highlighted area
- **Laser Pointer**: Synchronized laser pointer across presenter and receiver screens
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

### Presentation Modes
- **TAB**: Toggle overview mode (grid view of all slides)
- **S**: Toggle spotlight mode
- **L**: Toggle laser pointer
- **D**: Toggle dual-screen mode (receiver window)
- **F**: Toggle fullscreen
- **A**: Show about dialog (works in dual-screen mode)
- **P**: Pause/Resume presentation timer
- **Escape**: Exit current mode (overview, spotlight, laser, or region zoom)

### Speaker Notes (Dual-Screen Mode)
- **T**: Scroll speaker notes up (line-by-line)
- **G**: Scroll speaker notes down (line-by-line)

> **Note:** Speaker notes automatically scroll to the top when navigating to a new slide in dual-screen mode.

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

### Progress Indicator
When loading a PDF, a progress bar shows the current processing status with page-by-page feedback.

## License

Copyright (c) 2026 Sinan Bank

This software is provided for educational use only. See [LICENSE](LICENSE) for details.
