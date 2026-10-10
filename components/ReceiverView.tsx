import React, { useEffect, useMemo, useState, useRef } from 'react';
import { SlideData, SyncMessage, AppMode, ZoomState, Annotation, AnnotationMap, MediaMap, AudienceState } from '../types';
import AudienceView from './AudienceView';
import { buildMediaMap, preloadMedia, revokeMediaMap } from '../utils/mediaUtils';
import { createWheelStepper } from '../utils/wheelNavigation';
import { DEFAULT_CAMERA_SETTINGS, getOpenerCameraStream, useCameraStream } from '../utils/camera';

const ReceiverView: React.FC = () => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSpotlight, setIsSpotlight] = useState(false);
  const [spotlightPosition, setSpotlightPosition] = useState<{ x: number; y: number } | null>(null);
  const [isLaser, setIsLaser] = useState(false);
  const [laserPosition, setLaserPosition] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<AppMode>(AppMode.PRESENTATION);
  const [zoomState, setZoomState] = useState<ZoomState>({ level: 1.0, panX: 0, panY: 0 });
  const [annotations, setAnnotations] = useState<AnnotationMap>({});
  const [annotationDraft, setAnnotationDraft] = useState<{ index: number; annotation: Annotation | null }>({ index: 0, annotation: null });
  const [mediaMap, setMediaMap] = useState<MediaMap>({});
  const [isMediaActive, setIsMediaActive] = useState(true);
  const [isBlackScreen, setIsBlackScreen] = useState(false);
  const [cameraSync, setCameraSync] = useState<Extract<SyncMessage, { type: 'CAMERA_SYNC' }> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null); // For forwarding keys and wheel steps to the presenter
  const mediaMapRef = useRef<MediaMap>({}); // For revoking on replace/unmount

  useEffect(() => {
    const channel = new BroadcastChannel('webpressive_sync');
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;

      if (msg.type === 'SYNC_INIT') {
        // Reconstruct Object URLs from Files or imageData
        const processedSlides = msg.slides.map(s => {
          // If we have imageData (base64), convert it to a blob URL
          if (s.imageData) {
            // Convert base64 data URL to blob
            const byteString = atob(s.imageData.split(',')[1]);
            const mimeString = s.imageData.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeString });
            return { ...s, src: URL.createObjectURL(blob) };
          }
          // Fallback to file if available
          if (s.file) {
            return { ...s, src: URL.createObjectURL(s.file) };
          }
          return s;
        });
        setSlides(processedSlides);
      } else if (msg.type === 'STATE_UPDATE') {
        setCurrentIndex(msg.index);
        setIsSpotlight(msg.isSpotlight);
        if (msg.spotlightPosition !== undefined) {
          setSpotlightPosition(msg.spotlightPosition);
        }
        setMode(msg.mode);
        if (msg.isLaserActive !== undefined) {
          setIsLaser(msg.isLaserActive);
        }
        if (msg.laserPosition !== undefined) {
          setLaserPosition(msg.laserPosition);
        }
        if (msg.zoomState) {
          setZoomState(msg.zoomState);
        }
        if (msg.isMediaActive !== undefined) {
          setIsMediaActive(msg.isMediaActive);
        }
        if (msg.isBlackScreen !== undefined) {
          setIsBlackScreen(msg.isBlackScreen);
        }
      } else if (msg.type === 'ANNOTATIONS_SYNC') {
        setAnnotations(msg.annotations);
      } else if (msg.type === 'ANNOTATION_DRAFT') {
        setAnnotationDraft({ index: msg.index, annotation: msg.annotation });
      } else if (msg.type === 'CAMERA_SYNC') {
        setCameraSync(msg);
      } else if (msg.type === 'MEDIA_SYNC') {
        // Object URLs from the presenter window are not usable here; make our own from the Blobs
        revokeMediaMap(mediaMapRef.current);
        const map = buildMediaMap(msg.files);
        preloadMedia(map);
        mediaMapRef.current = map;
        setMediaMap(map);
      }
    };

    // Request initial state
    channel.postMessage({ type: 'SYNC_REQUEST' });

    return () => {
      channel.close();
      channelRef.current = null;
      revokeMediaMap(mediaMapRef.current);
    };
  }, []);

  // The projector window often has focus (it opened last, or was clicked to go fullscreen), so keys pressed
  // here, by a clicker or the keyboard, are passed to the presenter window, which acts on them.
  // F and F5 (a clicker's "start slideshow" button) toggle this window's own fullscreen instead: a browser
  // only allows fullscreen from a real key press in the window itself.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'F11', 'F12'].includes(e.key)) return;
      if ((e.key === 'f' || e.key === 'F' || e.key === 'F5') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (e.key !== 'F5') document.exitFullscreen().catch(() => {});
        return;
      }
      // Leave browser shortcuts (Ctrl/Cmd + key) alone, except the annotation undo/redo the presenter handles
      const isUndoRedo = (e.ctrlKey || e.metaKey) && ['z', 'Z', 'y', 'Y'].includes(e.key);
      if ((e.ctrlKey || e.metaKey) && !isUndoRedo) return;
      e.preventDefault();
      channelRef.current?.postMessage({
        type: 'KEY_FORWARD', key: e.key, code: e.code,
        shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey,
      } as SyncMessage);
    };

    // The plain wheel moves one slide per gesture, as in the presenter window
    const stepper = createWheelStepper((direction) => {
      channelRef.current?.postMessage({ type: 'WHEEL_STEP', direction } as SyncMessage);
    });
    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey || e.ctrlKey) return;
      e.preventDefault();
      stepper(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // The presenter's camera: borrowed from the presenter window that opened this one, or (a projector
  // window opened by hand) the same camera opened here
  const isCameraActive = !!cameraSync?.active;
  const borrowedCamera = useMemo(
    () => (isCameraActive ? getOpenerCameraStream(cameraSync?.streamId) : null),
    [isCameraActive, cameraSync?.streamId]
  );
  const ownCamera = useCameraStream(isCameraActive && !borrowedCamera, cameraSync?.deviceId ?? '');
  const cameraStream: MediaStream | null = isCameraActive ? borrowedCamera ?? ownCamera.stream : null;

  if (slides.length === 0) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-neutral-500">
        Connecting to presenter...
      </div>
    );
  }

  const audienceState: AudienceState = {
    index: currentIndex,
    mode,
    isSpotlight,
    spotlightPosition,
    isLaser,
    laserPosition,
    zoomState,
    isMediaActive,
    isBlackScreen,
  };

  return (
    <AudienceView
      className="receiver-container"
      slides={slides}
      state={audienceState}
      annotations={annotations[currentIndex] || []}
      draft={annotationDraft.index === currentIndex ? annotationDraft.annotation : null}
      mediaMap={mediaMap}
      camera={{ settings: cameraSync?.settings ?? DEFAULT_CAMERA_SETTINGS, stream: cameraStream }}
    />
  );
};

export default ReceiverView;
