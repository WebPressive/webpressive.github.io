

# WebPressive

A dual-screen presenter for LaTeX Beamer PDFs.

🌐 **Live Demo**: [View on GitHub Pages](https://webpressive.github.io)

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
