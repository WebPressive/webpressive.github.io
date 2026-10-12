import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { SlideData, AppMode, SyncMessage, ZoomState, Annotation, AnnotationMap, AnnotationTool, MediaFile, MediaMap, CameraSettings, AudienceState } from './types';
import UploadScreen, { LoadedMedia } from './components/UploadScreen';
import Controls from './components/Controls';
import SpotlightLayer from './components/SpotlightLayer';
import LaserPointer from './components/LaserPointer';
import LinkOverlay from './components/LinkOverlay';
import MediaOverlay from './components/MediaOverlay';
import RegionSelector from './components/RegionSelector';
import ReceiverView from './components/ReceiverView';
import AboutModal from './components/AboutModal';
import AnnotationLayer from './components/AnnotationLayer';
import AnnotationToolbar from './components/AnnotationToolbar';
import CameraOverlay from './components/CameraOverlay';
import CameraPanel from './components/CameraPanel';
import RecordingPanel from './components/RecordingPanel';
import RecordingIndicator from './components/RecordingIndicator';
import PlaybackView from './components/PlaybackView';
import TranscriptPane from './components/TranscriptPane';
import SpeakerNotesPane from './components/SpeakerNotesPane';
import NextSlidePane from './components/NextSlidePane';
import PaceTimer from './components/PaceTimer';
import CaptionBar from './components/CaptionBar';
import { renderPageAtZoom } from './utils/pdfUtils';
import { buildMediaMap, preloadMedia, revokeMediaMap, resolveMediaFiles } from './utils/mediaUtils';
import { createWheelStepper } from './utils/wheelNavigation';
import { loadCameraSettings, storeCameraSettings, useCameraStream } from './utils/camera';
import { useTalkRecording } from './utils/useTalkRecording';
import { useRecordingExport } from './utils/useRecordingExport';
import { useLiveTranscript } from './utils/useLiveTranscript';
import { PaceSettings, buildPlan, defaultTalkEnd, loadPaceSettings, loadTalkEnd, parseTimeTag, savePaceSettings, saveTalkEnd, useUnitClock } from './utils/pacing';
import { BLOCK_NAMES, BlockId, DockId, Edge, TRANSCRIPT_FONT_SIZES, usePresenterLayout } from './utils/presenterLayout';
import { ANNOTATION_COLORS, ANNOTATION_WIDTHS, ANNOTATION_HISTORY_LIMIT, ANNOTATION_STORAGE_KEY } from './constants';
import { clsx } from 'clsx';

// Annotations are persisted per presentation; slide IDs are regenerated on every load,
// so key storage by PDF name + slide count instead.
const getAnnotationStorageKey = (slides: SlideData[]): string | null => {
  if (slides.length === 0) return null;
  const pdfName = slides[0].name.replace(/ - Slide \d+$/, '');
  return `${pdfName}|${slides.length}`;
};

const NO_ANNOTATIONS: Annotation[] = []; // Stable empty list, so "no ink" is not a change on every render
const CAPTION_HOLD_MS = 5000; // Captions stay this long after the speaker stops

const loadStoredAnnotations = (key: string): AnnotationMap => {
  try {
    const all = JSON.parse(localStorage.getItem(ANNOTATION_STORAGE_KEY) || '{}');
    return all[key] || {};
  } catch {
    return {};
  }
};

const storeAnnotations = (key: string, annotations: AnnotationMap) => {
  try {
    const all = JSON.parse(localStorage.getItem(ANNOTATION_STORAGE_KEY) || '{}');
    if (Object.values(annotations).some((list) => list.length > 0)) {
      all[key] = annotations;
    } else {
      delete all[key];
    }
    localStorage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(all));
  } catch (error) {
    console.warn('Could not persist annotations:', error);
  }
};

const App: React.FC = () => {
  // --- Receiver Logic Check ---
  const [isReceiver, setIsReceiver] = useState(false);
  useEffect(() => {
    if (window.location.search.includes('mode=receiver')) {
      setIsReceiver(true);
    }
  }, []);

  // --- State ---
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [overviewHighlightIndex, setOverviewHighlightIndex] = useState(0); // Highlighted slide in overview mode
  const overviewSlideRefs = useRef<(HTMLDivElement | null)[]>([]); // Refs for overview slides
  const [mode, setMode] = useState<AppMode>(AppMode.UPLOAD);
  const [isSpotlightActive, setIsSpotlightActive] = useState(false);
  const [spotlightPosition, setSpotlightPosition] = useState<{ x: number; y: number } | null>(null);
  const [isLaserActive, setIsLaserActive] = useState(false);
  const [laserPosition, setLaserPosition] = useState<{ x: number; y: number } | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  // Annotation state
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('pen');
  const [annotationColor, setAnnotationColor] = useState(ANNOTATION_COLORS[0].value);
  const [annotationWidth, setAnnotationWidth] = useState(ANNOTATION_WIDTHS[1].value);
  const [annotations, setAnnotations] = useState<AnnotationMap>({});
  const [annotationDraft, setAnnotationDraft] = useState<Annotation | null>(null);
  const annotationsRef = useRef<AnnotationMap>({}); // Mirrors `annotations` for handlers that fire in quick succession
  const annotationHistoryRef = useRef<{ past: AnnotationMap[]; future: AnnotationMap[] }>({ past: [], future: [] });
  const loadedAnnotationKeyRef = useRef<string | null>(null);
  const eraseGestureRecordedRef = useRef(false); // True once the current eraser drag has its undo snapshot
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedTime, setPausedTime] = useState(0); // Accumulated paused time in milliseconds
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);
  
  // Animated media (GIF/video over poster stills): the files, this window's object URLs for them,
  // the on/off toggle (M), and a transient notice (missing files, toggle feedback)
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaMap, setMediaMap] = useState<MediaMap>({});
  const [isMediaActive, setIsMediaActive] = useState(true);
  // Projector blacked out (B or . , a clicker's "black screen" button); the next navigation key brings it back
  const [isBlackScreen, setIsBlackScreen] = useState(false);
  // Wheel steps from the receiver window go through the same checks as the presenter's own wheel
  const wheelStepRef = useRef<(direction: 1 | -1) => void>(() => {});
  const [mediaNotice, setMediaNotice] = useState<{ text: string; duration: number } | null>(null);
  // Media paths of this deck with no file yet. A browser cannot read files next to an opened PDF,
  // so a banner offers to pick the deck's folder until these are found (or the banner is dismissed).
  const [missingMedia, setMissingMedia] = useState<string[]>([]);
  const [isMissingMediaDismissed, setIsMissingMediaDismissed] = useState(false);
  const mediaFolderInputRef = useRef<HTMLInputElement>(null);

  // Presenter camera on the slides (V). The settings persist; the camera always starts off.
  // The device is open while the camera is shown or its settings panel is open, and released otherwise.
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(loadCameraSettings);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isCameraPanelOpen, setIsCameraPanelOpen] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0); // Bumped to retry after a failure

  // Talk recording: its panel, and the recording being played back (covers the presenter window)
  const [isRecordingPanelOpen, setIsRecordingPanelOpen] = useState(false);
  const [playback, setPlayback] = useState<{ recordingId: string; clip: number } | null>(null);
  const camera = useCameraStream(!isReceiver && (isCameraOn || isCameraPanelOpen), cameraSettings.videoDeviceId, cameraAttempt);

  // Dual Screen State
  const [isDualScreen, setIsDualScreen] = useState(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const receiverWindowRef = useRef<Window | null>(null);
  
  // Live transcript (W): speech recognition on this computer. Off at the start of every session, like the camera.
  const [isTranscriptOn, setIsTranscriptOn] = useState(false);

  // Presenter view blocks (next slide, notes, transcript): moved by dragging their title bar into the sidebar,
  // a strip above/below the current slide, or a floating window; every edge between sections resizes
  const presenterContainerRef = useRef<HTMLDivElement>(null);
  const presenterColumnRef = useRef<HTMLDivElement>(null);
  const presenterLayout = usePresenterLayout({
    container: presenterContainerRef,
    column: presenterColumnRef,
    isVisible: (id: BlockId) => id !== 'transcript' || isTranscriptOn,
  });
  const { layout } = presenterLayout;
  const [isCaptionShared, setIsCaptionShared] = useState(false); // Captions on the audience view too
  const transcriptFlushRef = useRef<() => Promise<void>>(() => Promise.resolve());
  
  // Refs for laser pointer containers
  const presenterSlideRef = useRef<HTMLDivElement>(null);
  const normalViewRef = useRef<HTMLDivElement>(null);
  
  // Ref for speaker notes container (for scrolling)
  const speakerNotesRef = useRef<HTMLDivElement>(null);
  
  // Speaker notes font size state
  const [speakerNotesFontSize, setSpeakerNotesFontSize] = useState(() => {
    const saved = localStorage.getItem('speakerNotesFontSize');
    return saved ? parseInt(saved, 10) : 14; // Default 14px
  });
  
  // Reading guide state
  const [isReadingGuideEnabled, setIsReadingGuideEnabled] = useState(() => {
    const saved = localStorage.getItem('isReadingGuideEnabled');
    return saved === 'true';
  });
  
  // Zoom state
  const [zoomState, setZoomState] = useState<ZoomState>({ level: 1.0, panX: 0, panY: 0 });
  const [isZooming, setIsZooming] = useState(false);
  const [isRegionSelecting, setIsRegionSelecting] = useState(false);
  const [regionStart, setRegionStart] = useState<{ x: number; y: number } | null>(null);
  const [regionCurrent, setRegionCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const isDraggingRef = useRef(false);
  const regionStartRef = useRef<{ x: number; y: number } | null>(null);
  const regionCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [zoomedSlideSrc, setZoomedSlideSrc] = useState<string | null>(null);
  const zoomedSlideRef = useRef<string | null>(null); // Track which slide is currently zoomed

  // --- Camera sync ---
  // `active` only once the stream is live, so the projector window can borrow it at once
  const cameraSyncMessage = (): SyncMessage => ({
    type: 'CAMERA_SYNC',
    active: isCameraOn && !!camera.stream,
    settings: cameraSettings,
    streamId: camera.stream?.id,
    deviceId: camera.stream?.getVideoTracks()[0]?.getSettings().deviceId,
  });

  // --- Dual Screen / Broadcasting Logic ---
  useEffect(() => {
    if (isReceiver) return; // Receivers don't broadcast

    const channel = new BroadcastChannel('webpressive_sync');
    broadcastChannelRef.current = channel;

    // Listen for requests from new receiver windows
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      if (event.data.type === 'SYNC_REQUEST') {
        // Send initial data to receiver
        channel.postMessage({
          type: 'SYNC_INIT',
          slides: slides,
          startTime: startTime
        });
        // Send current state immediately (including zoom)
          channel.postMessage({
          type: 'STATE_UPDATE',
          index: currentSlideIndex,
          isSpotlight: isSpotlightActive,
          spotlightPosition: spotlightPosition,
          mode: mode,
          isLaserActive: isLaserActive,
          laserPosition: laserPosition,
          zoomState: zoomState,
          isMediaActive: isMediaActive,
          isBlackScreen: isBlackScreen
        } as SyncMessage);
        channel.postMessage({ type: 'ANNOTATIONS_SYNC', annotations } as SyncMessage);
        channel.postMessage(cameraSyncMessage());
        channel.postMessage({ type: 'CAPTION_SYNC', text: audienceCaptionRef.current } as SyncMessage);
        if (mediaFiles.length > 0) {
          // Blobs are cloned across windows; the receiver makes its own object URLs
          channel.postMessage({ type: 'MEDIA_SYNC', files: mediaFiles } as SyncMessage);
        }
      } else if (event.data.type === 'KEY_FORWARD') {
        // A key pressed in the projector window (often a clicker): handle it as if pressed here
        const { key, code, shiftKey, ctrlKey, altKey, metaKey } = event.data;
        window.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey, ctrlKey, altKey, metaKey, cancelable: true }));
      } else if (event.data.type === 'WHEEL_STEP') {
        wheelStepRef.current(event.data.direction);
      }
    };

    return () => channel.close();
  }, [isReceiver, slides, startTime, currentSlideIndex, isSpotlightActive, spotlightPosition, mode, isLaserActive, laserPosition, zoomState, annotations, mediaFiles, isMediaActive, isBlackScreen, isCameraOn, camera.stream, cameraSettings]);

  // Broadcast committed annotations (infrequent: on every stroke commit, erase, undo, clear)
  useEffect(() => {
    if (!isReceiver && broadcastChannelRef.current && mode !== AppMode.UPLOAD) {
      broadcastChannelRef.current.postMessage({ type: 'ANNOTATIONS_SYNC', annotations } as SyncMessage);
    }
  }, [annotations, mode, isReceiver]);

  // Broadcast the stroke being drawn so the receiver shows it live rather than on pointer-up
  useEffect(() => {
    if (!isReceiver && broadcastChannelRef.current && mode !== AppMode.UPLOAD) {
      broadcastChannelRef.current.postMessage({
        type: 'ANNOTATION_DRAFT',
        index: currentSlideIndex,
        annotation: annotationDraft,
      } as SyncMessage);
    }
  }, [annotationDraft, currentSlideIndex, mode, isReceiver]);

  // Camera: broadcast every change, keep the settings, share the stream with the projector window
  useEffect(() => {
    if (!isReceiver && broadcastChannelRef.current && mode !== AppMode.UPLOAD) {
      broadcastChannelRef.current.postMessage(cameraSyncMessage());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, camera.stream, cameraSettings, mode, isReceiver]);

  useEffect(() => {
    if (!isReceiver) storeCameraSettings(cameraSettings);
  }, [cameraSettings, isReceiver]);

  useEffect(() => {
    if (!isReceiver) window.webpressiveCameraStream = camera.stream;
  }, [camera.stream, isReceiver]);

  // A camera that fails or stops is switched off; the panel shows why, or a notice does when it is closed
  useEffect(() => {
    if (!camera.error) return;
    setIsCameraOn(false);
    if (!isCameraPanelOpen) setMediaNotice({ text: camera.error, duration: 8000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.error]);

  // Load persisted annotations when a presentation starts; save on every change
  const annotationStorageKey = getAnnotationStorageKey(slides);
  useEffect(() => {
    if (!annotationStorageKey) return;
    const stored = loadStoredAnnotations(annotationStorageKey);
    annotationsRef.current = stored;
    annotationHistoryRef.current = { past: [], future: [] };
    setAnnotations(stored);
    setAnnotationDraft(null);
    loadedAnnotationKeyRef.current = annotationStorageKey;
  }, [annotationStorageKey]);

  // Pacing: each slide's time from its notes, the talk's end (per deck; backup slides follow it), and the
  // time spent on the current slide. Shown under the next slide in the presenter view.
  const [paceSettings, setPaceSettings] = useState<PaceSettings>(loadPaceSettings);
  const [talkEndChoice, setTalkEndChoice] = useState<number | null>(null);
  useEffect(() => setTalkEndChoice(loadTalkEnd(annotationStorageKey)), [annotationStorageKey]);
  const talkEnd: number = Math.min(talkEndChoice ?? defaultTalkEnd(slides), Math.max(0, slides.length - 1));
  const pacePlan = useMemo(() => buildPlan(slides, paceSettings, talkEnd), [slides, paceSettings, talkEnd]);
  const paceUnit: number = pacePlan.unitOf[currentSlideIndex] ?? 0;
  const paceUnitMs = useUnitClock(paceUnit, startTime, isPaused);
  const changePaceSettings = useCallback((settings: PaceSettings) => {
    setPaceSettings(settings);
    savePaceSettings(settings);
  }, []);
  const changeTalkEnd = useCallback((value: number | null) => {
    setTalkEndChoice(value);
    saveTalkEnd(annotationStorageKey, value);
  }, [annotationStorageKey]);

  // Presenter view: O calls the menu (bumped to show it, or hide it when shown)
  const [menuRequest, setMenuRequest] = useState(0);

  useEffect(() => {
    // The ref check skips the commit in which a new presentation's annotations are still being loaded
    if (annotationStorageKey && loadedAnnotationKeyRef.current === annotationStorageKey && annotations === annotationsRef.current) {
      storeAnnotations(annotationStorageKey, annotations);
    }
  }, [annotations, annotationStorageKey]);

  // --- Talk recording ---
  // The recorder sees what the audience sees: the same state the projector window gets, the ink on the
  // current slide, and the camera (its picture only while shown on the slides)
  const audienceState = useMemo<AudienceState>(
    () => ({
      index: currentSlideIndex,
      mode,
      isSpotlight: isSpotlightActive,
      spotlightPosition,
      isLaser: isLaserActive,
      laserPosition,
      zoomState,
      isMediaActive,
      isBlackScreen,
    }),
    [currentSlideIndex, mode, isSpotlightActive, spotlightPosition, isLaserActive, laserPosition, zoomState, isMediaActive, isBlackScreen]
  );
  const slideAnnotations = annotations[currentSlideIndex] ?? NO_ANNOTATIONS;
  const recorderInput = useMemo(
    () => ({ state: audienceState, annotations: slideAnnotations, draft: annotationDraft, camera: cameraSettings }),
    [audienceState, slideAnnotations, annotationDraft, cameraSettings]
  );
  const recordedVideoTrack = useMemo(
    () => (isCameraOn && camera.stream ? camera.stream.getVideoTracks()[0] ?? null : null),
    [isCameraOn, camera.stream]
  );
  const deckName = slides[0]?.name.replace(/ - Slide \d+$/, '') ?? '';
  const recording = useTalkRecording({
    enabled: !isReceiver && slides.length > 0,
    deckKey: annotationStorageKey,
    deckName,
    input: recorderInput,
    videoTrack: recordedVideoTrack,
    micDeviceId: cameraSettings.audioDeviceId,
    onNotice: (text: string) => setMediaNotice({ text, duration: 8000 }),
    flushTranscript: () => transcriptFlushRef.current(),
  });
  const transcript = useLiveTranscript({
    enabled: !isReceiver && isTranscriptOn && slides.length > 0,
    micDeviceId: cameraSettings.audioDeviceId,
    muted: recording.isActive && recording.isMuted,
    onFinal: recording.addTranscript, // Saved with the recording while one runs
  });
  transcriptFlushRef.current = transcript.flush;

  // Captions: the last line and the one being spoken; cleared a few seconds after the speaker stops
  const [liveCaption, setLiveCaption] = useState<string | null>(null);
  useEffect(() => {
    const last = transcript.lines[transcript.lines.length - 1]?.text ?? '';
    const text = isTranscriptOn ? `${last} ${transcript.preview ?? ''}`.trim() : '';
    setLiveCaption(text || null);
    if (!text || transcript.preview) return;
    const timer = setTimeout(() => setLiveCaption(null), CAPTION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [transcript.lines, transcript.preview, isTranscriptOn]);
  const audienceCaption = isCaptionShared ? liveCaption : null;
  const audienceCaptionRef = useRef(audienceCaption);
  audienceCaptionRef.current = audienceCaption;
  useEffect(() => {
    if (!isReceiver && broadcastChannelRef.current && mode !== AppMode.UPLOAD) {
      broadcastChannelRef.current.postMessage({ type: 'CAPTION_SYNC', text: audienceCaption } as SyncMessage);
    }
  }, [audienceCaption, mode, isReceiver]);
  // A transcript that cannot start says why (in the presenter view the pane shows it too)
  useEffect(() => {
    if (transcript.error && isTranscriptOn && !isDualScreen) setMediaNotice({ text: transcript.error, duration: 8000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript.error]);

  const recordingExport = useRecordingExport(slides, mediaMap, deckName, (text: string) => setMediaNotice({ text, duration: 8000 }));

  // Broadcast state changes
  useEffect(() => {
    if (!isReceiver && broadcastChannelRef.current && mode !== AppMode.UPLOAD) {
      broadcastChannelRef.current.postMessage({
        type: 'STATE_UPDATE',
        index: currentSlideIndex,
        isSpotlight: isSpotlightActive,
        spotlightPosition: spotlightPosition,
        mode: mode,
        isLaserActive: isLaserActive,
        laserPosition: laserPosition,
        zoomState: zoomState,
        isMediaActive: isMediaActive,
        isBlackScreen: isBlackScreen
      });
    }
  }, [currentSlideIndex, isSpotlightActive, spotlightPosition, mode, isReceiver, isLaserActive, laserPosition, zoomState, isMediaActive, isBlackScreen]);

  const toggleDualScreen = useCallback(() => {
    if (isDualScreen && receiverWindowRef.current) {
      // Close dual-screen mode
      receiverWindowRef.current.close();
      receiverWindowRef.current = null;
      setIsDualScreen(false);
    } else {
      // Open dual-screen mode
      const receiverWindow = window.open(
        `${window.location.pathname}?mode=receiver`, 
        'WebPressiveReceiver', 
        'width=800,height=600'
      );
      if (receiverWindow) {
        receiverWindowRef.current = receiverWindow;
        setIsDualScreen(true);
        
        // Check if window was closed by user (manually)
        const checkWindowClosed = setInterval(() => {
          if (receiverWindow.closed) {
            clearInterval(checkWindowClosed);
            receiverWindowRef.current = null;
            setIsDualScreen(false);
          }
        }, 500);
      }
    }
  }, [isDualScreen]);

  // --- Navigation Logic ---
  const startPresentation = (newSlides: SlideData[], media?: LoadedMedia) => {
    revokeMediaMap(mediaMap);
    const files = media?.files ?? [];
    const newMediaMap = buildMediaMap(files);
    preloadMedia(newMediaMap);
    setMediaFiles(files);
    setMediaMap(newMediaMap);
    setIsMediaActive(true);
    const missing = media?.missing ?? [];
    if (missing.length > 0) {
      // Slides with missing media keep their stills until the files are added
      console.warn(`${missing.length} animation file(s) not found:`, missing);
    }
    setMissingMedia(missing);
    setIsMissingMediaDismissed(false);
    setMediaNotice(null);
    setSlides(newSlides);
    setMode(AppMode.PRESENTATION);
    setStartTime(Date.now());
    setCurrentSlideIndex(0);
    setIsPaused(false);
    setPausedTime(0);
    setPauseStartTime(null);
  };

  // --- Timer Reset Logic ---
  const resetTimer = useCallback(() => {
    setStartTime(Date.now());
    setIsPaused(false);
    setPausedTime(0);
    setPauseStartTime(null);
  }, []);

  // --- Timer Pause Logic ---
  const togglePause = useCallback(() => {
    if (!startTime) return;
    
    if (isPaused) {
      // Resuming: add the paused duration to accumulated paused time
      if (pauseStartTime) {
        const pauseDuration = Date.now() - pauseStartTime;
        setPausedTime(prev => prev + pauseDuration);
        setPauseStartTime(null);
      }
      setIsPaused(false);
    } else {
      // Pausing: record when we started pausing
      setPauseStartTime(Date.now());
      setIsPaused(true);
    }
  }, [isPaused, startTime, pauseStartTime]);

  // Speaker notes font size handlers
  const increaseFontSize = useCallback(() => {
    setSpeakerNotesFontSize((prev) => {
      const newSize = Math.min(prev + 1, 24); // Max 24px
      localStorage.setItem('speakerNotesFontSize', newSize.toString());
      return newSize;
    });
  }, []);

  const decreaseFontSize = useCallback(() => {
    setSpeakerNotesFontSize((prev) => {
      const newSize = Math.max(prev - 1, 8); // Min 8px
      localStorage.setItem('speakerNotesFontSize', newSize.toString());
      return newSize;
    });
  }, []);

  // Reading guide toggle
  const toggleReadingGuide = useCallback(() => {
    setIsReadingGuideEnabled((prev) => {
      const newValue = !prev;
      localStorage.setItem('isReadingGuideEnabled', newValue.toString());
      // Reset scroll position to top when enabling the reading guide
      if (newValue && speakerNotesRef.current) {
        speakerNotesRef.current.scrollTop = 0;
      }
      return newValue;
    });
  }, []);

  // Zoom functions
  const applyZoom = useCallback(async (zoomLevel: number, resetPan: boolean = false) => {
    if (slides.length === 0) return;
    
    setIsZooming(true);
    try {
      const pageNumber = currentSlideIndex + 1; // PDF pages are 1-indexed
      const newBlobUrl = await renderPageAtZoom(pageNumber, zoomLevel);
      
      // Clean up old zoomed image if it exists
      if (zoomedSlideSrc && zoomedSlideSrc !== slides[currentSlideIndex].src) {
        URL.revokeObjectURL(zoomedSlideSrc);
      }
      
      setZoomedSlideSrc(newBlobUrl);
      zoomedSlideRef.current = slides[currentSlideIndex].id;
      
      setZoomState((prev) => {
        const newZoomState = {
          level: zoomLevel,
          panX: resetPan ? 0 : prev.panX,
          panY: resetPan ? 0 : prev.panY,
        };

        // Broadcast zoom state for dual screen
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'STATE_UPDATE',
            index: currentSlideIndex,
            isSpotlight: isSpotlightActive,
            spotlightPosition: spotlightPosition,
            mode: mode,
            isLaserActive: isLaserActive,
            laserPosition: laserPosition,
            zoomState: newZoomState,
          } as SyncMessage);
        }

        return newZoomState;
      });
    } catch (error) {
      console.error('Failed to apply zoom:', error);
    } finally {
      setIsZooming(false);
    }
  }, [slides, currentSlideIndex, isSpotlightActive, mode, isLaserActive, laserPosition, zoomState]);

  const resetZoom = useCallback(() => {
    if (zoomedSlideSrc && zoomedSlideSrc !== slides[currentSlideIndex]?.src) {
      URL.revokeObjectURL(zoomedSlideSrc);
    }
    setZoomedSlideSrc(null);
    zoomedSlideRef.current = null;
    setZoomState({ level: 1.0, panX: 0, panY: 0 });
    
    // Broadcast reset
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'STATE_UPDATE',
        index: currentSlideIndex,
        isSpotlight: isSpotlightActive,
        spotlightPosition: spotlightPosition,
        mode: mode,
        isLaserActive: isLaserActive,
        laserPosition: laserPosition,
        zoomState: { level: 1.0, panX: 0, panY: 0 },
      } as SyncMessage);
    }
  }, [zoomedSlideSrc, slides, currentSlideIndex, isSpotlightActive, spotlightPosition, mode, isLaserActive, laserPosition]);

  const nextSlide = useCallback(() => {
    setIsBlackScreen(false);
    setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
    resetZoom(); // Reset zoom when changing slides
    // Scroll speaker notes to top when in dual screen mode
    if (isDualScreen && speakerNotesRef.current) {
      speakerNotesRef.current.scrollTop = 0;
    }
  }, [slides.length, resetZoom, isDualScreen]);

  const prevSlide = useCallback(() => {
    setIsBlackScreen(false);
    setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
    resetZoom(); // Reset zoom when changing slides
    // Scroll speaker notes to top when in dual screen mode
    if (isDualScreen && speakerNotesRef.current) {
      speakerNotesRef.current.scrollTop = 0;
    }
  }, [resetZoom, isDualScreen]);

  const toggleOverview = useCallback(() => {
    setMode((prev) => {
      if (prev === AppMode.PRESENTATION) {
        // Entering overview mode - set highlight to current slide
        setOverviewHighlightIndex(currentSlideIndex);
        // Scroll to current slide after entering overview
        setTimeout(() => {
          overviewSlideRefs.current[currentSlideIndex]?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest', 
            inline: 'nearest' 
          });
        }, 100);
        return AppMode.OVERVIEW;
      } else {
        return AppMode.PRESENTATION;
      }
    });
    setIsSpotlightActive(false); 
  }, [currentSlideIndex]);

  const selectSlide = (index: number) => {
    setIsBlackScreen(false);
    setCurrentSlideIndex(index);
    setMode(AppMode.PRESENTATION);
    resetZoom(); // Reset zoom when changing slides
    // Scroll speaker notes to top when in dual screen mode
    if (isDualScreen && speakerNotesRef.current) {
      speakerNotesRef.current.scrollTop = 0;
    }
  };

  const toggleMedia = useCallback(() => {
    setIsMediaActive(!isMediaActive);
    setMediaNotice({ text: isMediaActive ? 'Animations off' : 'Animations on', duration: 1500 });
  }, [isMediaActive]);

  const toggleCamera = useCallback(() => {
    if (!isCameraOn && camera.error) setCameraAttempt((n: number) => n + 1); // Try again after a failure
    setIsCameraOn(!isCameraOn);
  }, [isCameraOn, camera.error]);

  // The camera and recording panels share the same spot: one at a time
  const toggleCameraPanel = useCallback(() => {
    if (!isCameraPanelOpen && camera.error) setCameraAttempt((n: number) => n + 1);
    setIsCameraPanelOpen(!isCameraPanelOpen);
    setIsRecordingPanelOpen(false);
  }, [isCameraPanelOpen, camera.error]);

  const openCameraPanel = useCallback(() => {
    if (isCameraPanelOpen) return;
    if (camera.error) setCameraAttempt((n: number) => n + 1);
    setIsCameraPanelOpen(true);
    setIsRecordingPanelOpen(false);
  }, [isCameraPanelOpen, camera.error]);

  const toggleRecordingPanel = useCallback(() => {
    setIsRecordingPanelOpen(!isRecordingPanelOpen);
    setIsCameraPanelOpen(false);
  }, [isRecordingPanelOpen]);

  const updateCameraSettings = useCallback((changes: Partial<CameraSettings>) => {
    setCameraSettings((prev: CameraSettings) => ({ ...prev, ...changes }));
  }, []);

  // Adds media files picked after the deck was loaded (the deck's folder), matched by path suffix
  const addMediaFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      setMediaNotice({ text: 'The browser passed no files from that folder. Try picking it again.', duration: 8000 });
      return;
    }
    const picked = Array.from(fileList).map((file) => ({
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }));
    const found = resolveMediaFiles(slides, picked, '').resolved.filter((m) => missingMedia.includes(m.path));
    if (found.length === 0) {
      // Say what arrived, so a wrong folder or a folder the browser could not list is easy to tell apart
      const media = picked.filter((f) => /\.(gif|mp4|webm)$/i.test(f.path));
      const folder = picked[0].path.split('/')[0];
      console.warn('No deck media in the picked folder. Wanted:', missingMedia, 'Got media files:', media.map((f) => f.path));
      setMediaNotice({
        text: `No files for this deck in "${folder}": it has ${picked.length} files, ${media.length} of them GIF/MP4/WebM. Pick the folder that holds the PDF and its figures/ folder.`,
        duration: 12000,
      });
      return;
    }
    const newMap = buildMediaMap(found);
    preloadMedia(newMap);
    const files = [...mediaFiles, ...found];
    setMediaFiles(files);
    setMediaMap({ ...mediaMap, ...newMap });
    const stillMissing = missingMedia.filter((path) => !found.some((m) => m.path === path));
    setMissingMedia(stillMissing);
    setMediaNotice({
      text: `${found.length} animation${found.length === 1 ? '' : 's'} added${stillMissing.length ? `, ${stillMissing.length} still missing` : ''}.`,
      duration: 4000,
    });
    // An open receiver window replaces its media with the full set
    broadcastChannelRef.current?.postMessage({ type: 'MEDIA_SYNC', files } as SyncMessage);
  };

  // Hide the media notice after its duration
  useEffect(() => {
    if (!mediaNotice) return;
    const timer = setTimeout(() => setMediaNotice(null), mediaNotice.duration);
    return () => clearTimeout(timer);
  }, [mediaNotice]);

  const toggleSpotlight = useCallback(() => {
    if (mode === AppMode.PRESENTATION) {
      setIsSpotlightActive((prev) => !prev);
      // Turn off laser and annotation when spotlight is activated
      if (!isSpotlightActive) {
        setIsLaserActive(false);
        setIsAnnotating(false);
      }
    }
  }, [mode, isSpotlightActive]);

  const toggleLaser = useCallback(() => {
    if (mode === AppMode.PRESENTATION) {
      setIsLaserActive((prev) => !prev);
      // Turn off spotlight and annotation when laser is activated
      if (!isLaserActive) {
        setIsSpotlightActive(false);
        setIsAnnotating(false);
      }
    }
  }, [mode, isLaserActive]);

  // --- Annotation Logic ---
  const toggleAnnotate = useCallback(() => {
    if (mode !== AppMode.PRESENTATION) return;
    if (!isAnnotating) {
      // Annotation captures the pointer, so the other pointer tools must yield
      setIsSpotlightActive(false);
      setIsLaserActive(false);
      setIsRegionSelecting(false);
    } else {
      setAnnotationDraft(null);
    }
    setIsAnnotating(!isAnnotating);
  }, [mode, isAnnotating]);

  // All edits go through here so undo/redo history stays consistent.
  // `coalesce` folds successive edits of one eraser drag into a single undo step.
  const updateAnnotations = useCallback((updater: (prev: AnnotationMap) => AnnotationMap, coalesce = false) => {
    const prev = annotationsRef.current;
    const next = updater(prev);
    if (next === prev) return;
    if (!(coalesce && eraseGestureRecordedRef.current)) {
      const history = annotationHistoryRef.current;
      history.past = [...history.past, prev].slice(-ANNOTATION_HISTORY_LIMIT);
      history.future = [];
    }
    if (coalesce) eraseGestureRecordedRef.current = true;
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

  const endEraseGesture = useCallback(() => {
    eraseGestureRecordedRef.current = false;
  }, []);

  const commitAnnotation = useCallback((annotation: Annotation) => {
    updateAnnotations((prev) => ({
      ...prev,
      [currentSlideIndex]: [...(prev[currentSlideIndex] || []), annotation],
    }));
  }, [updateAnnotations, currentSlideIndex]);

  // Replace one annotation with the pieces that survive the eraser (none = removed entirely)
  const eraseAnnotation = useCallback((id: string, replacements: Annotation[] = []) => {
    updateAnnotations((prev) => {
      const list = prev[currentSlideIndex] || [];
      if (!list.some((a) => a.id === id)) return prev;
      return { ...prev, [currentSlideIndex]: list.flatMap((a) => (a.id === id ? replacements : [a])) };
    }, true);
  }, [updateAnnotations, currentSlideIndex]);

  const clearSlideAnnotations = useCallback(() => {
    updateAnnotations((prev) => {
      if (!prev[currentSlideIndex]?.length) return prev;
      const next = { ...prev };
      delete next[currentSlideIndex];
      return next;
    });
  }, [updateAnnotations, currentSlideIndex]);

  const clearAllAnnotations = useCallback(() => {
    updateAnnotations((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [updateAnnotations]);

  const undoAnnotation = useCallback(() => {
    const history = annotationHistoryRef.current;
    const prev = history.past.pop();
    if (!prev) return;
    history.future = [annotationsRef.current, ...history.future];
    annotationsRef.current = prev;
    setAnnotations(prev);
  }, []);

  const redoAnnotation = useCallback(() => {
    const history = annotationHistoryRef.current;
    const next = history.future.shift();
    if (!next) return;
    history.past = [...history.past, annotationsRef.current];
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

  // Track mouse position for spotlight and laser pointer (shared calculation logic)
  useEffect(() => {
    if ((!isSpotlightActive && !isLaserActive) || mode !== AppMode.PRESENTATION) {
      setSpotlightPosition(null);
      setLaserPosition(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Find the image element to get its actual rendered bounds
      let container: HTMLElement | null = null;
      if (isDualScreen && presenterSlideRef.current) {
        container = presenterSlideRef.current;
      } else if (!isDualScreen && normalViewRef.current) {
        container = normalViewRef.current;
      }
      
      if (!container) {
        container = document.querySelector('.presenter-container') || document.body;
      }

      const img = container.querySelector('img[class*="object-contain"]') as HTMLImageElement;
      
      if (img && img.naturalWidth && img.naturalHeight) {
        const rect = img.getBoundingClientRect();
        
        // Calculate rendered content dimensions (accounting for object-fit: contain)
        const naturalRatio = img.naturalWidth / img.naturalHeight;
        const visibleRatio = rect.width / rect.height;
        
        let renderedWidth = rect.width;
        let renderedHeight = rect.height;
        let contentLeft = 0;
        let contentTop = 0;
        
        if (visibleRatio > naturalRatio) {
          // Wider than content -> height constrained
          renderedWidth = rect.height * naturalRatio;
          contentLeft = (rect.width - renderedWidth) / 2;
        } else {
          // Taller than content -> width constrained
          renderedHeight = rect.width / naturalRatio;
          contentTop = (rect.height - renderedHeight) / 2;
        }
        
        // Calculate position relative to the CONTENT
        const relativeX = (e.clientX - rect.left - contentLeft) / renderedWidth;
        const relativeY = (e.clientY - rect.top - contentTop) / renderedHeight;
        
        // Only update if mouse is within CONTENT bounds
        if (relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1) {
          const normalizedPos = { x: relativeX, y: relativeY };
          if (isSpotlightActive) {
            setSpotlightPosition(normalizedPos);
          }
          if (isLaserActive) {
            setLaserPosition(normalizedPos);
          }
        } else {
          if (isSpotlightActive) {
            setSpotlightPosition(null);
          }
          if (isLaserActive) {
            setLaserPosition(null);
          }
        }
      } else {
        // Hide if no image found or dimensions are zero
        if (isSpotlightActive) {
          setSpotlightPosition(null);
        }
        if (isLaserActive) {
          setLaserPosition(null);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isSpotlightActive, isLaserActive, mode, isDualScreen]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === AppMode.UPLOAD) return;
      if (playback) return; // The player handles its own keys

      // Typing into a text annotation must not trigger single-letter shortcuts
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)) return;

      // After a control-bar button was clicked, Space/Enter (clicker or keyboard) must change slides, not press it again
      if (target && target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        target.blur();
      }

      // While the projector is blacked out, the next navigation key only brings the slide back
      if (isBlackScreen && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Enter', 'Backspace', 'Escape', 'b', 'B', '.'].includes(e.key)) {
        e.preventDefault();
        setIsBlackScreen(false);
        return;
      }

      // Annotation undo/redo (handled before the switch so Ctrl+Z doesn't trigger region zoom)
      if ((e.ctrlKey || e.metaKey) && mode === AppMode.PRESENTATION) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redoAnnotation(); else undoAnnotation();
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          redoAnnotation();
          return;
        }
      }

      switch (e.key) {
        case 'ArrowRight':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            const newIndex = Math.min(overviewHighlightIndex + 1, slides.length - 1);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          } else if (mode === AppMode.PRESENTATION) {
            nextSlide();
          }
          break;
        case 'ArrowLeft':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            const newIndex = Math.max(overviewHighlightIndex - 1, 0);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          } else if (mode === AppMode.PRESENTATION) {
            prevSlide();
          }
          break;
        case 'ArrowDown':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            // Move down in grid (4 columns)
            const cols = 4;
            const newIndex = Math.min(overviewHighlightIndex + cols, slides.length - 1);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          }
          break;
        case 'ArrowUp':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            // Move up in grid (4 columns)
            const cols = 4;
            const newIndex = Math.max(overviewHighlightIndex - cols, 0);
            setOverviewHighlightIndex(newIndex);
            // Scroll into view after state update
            setTimeout(() => {
              overviewSlideRefs.current[newIndex]?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest', 
                inline: 'nearest' 
              });
            }, 0);
          }
          break;
        case 'Enter':
          if (mode === AppMode.OVERVIEW) {
            e.preventDefault();
            selectSlide(overviewHighlightIndex);
          }
          break;
        case ' ':
        case 'PageDown':
          if (mode === AppMode.PRESENTATION) nextSlide();
          break;
        case 'PageUp':
        case 'Backspace':
          if (mode === AppMode.PRESENTATION) prevSlide();
          break;
        case 'Tab':
          e.preventDefault();
          toggleOverview();
          break;
        case 's':
        case 'S':
          toggleSpotlight();
          break;
        case 'l':
        case 'L':
          toggleLaser();
          break;
        case 'd':
        case 'D':
          if (mode === AppMode.PRESENTATION) {
            toggleDualScreen();
          }
          break;
        case 'f':
        case 'F':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
          break;
        case '1':
          if (mode === AppMode.PRESENTATION) applyZoom(0.5, true);
          break;
        case '2':
          if (mode === AppMode.PRESENTATION) applyZoom(1.0, true);
          break;
        case '3':
          if (mode === AppMode.PRESENTATION) applyZoom(1.5, true);
          break;
        case '4':
          if (mode === AppMode.PRESENTATION) applyZoom(2.0, true);
          break;
        case 'r':
        case 'R':
          if (mode === AppMode.PRESENTATION) resetZoom();
          break;
        case 'z':
        case 'Z':
          if (mode === AppMode.PRESENTATION && !isRegionSelecting) {
            setIsAnnotating(false); // Region selection captures the pointer
            setIsRegionSelecting(true);
          }
          break;
        case 'n':
        case 'N':
          toggleAnnotate();
          break;
        case 'e':
        case 'E':
          // Toggle eraser while annotating
          if (isAnnotating) {
            setAnnotationTool((prev) => (prev === 'eraser' ? 'pen' : 'eraser'));
          }
          break;
        case 'c':
        case 'C':
          // Clear annotations on this slide; Shift+C clears every slide
          if (isAnnotating) {
            if (e.shiftKey) clearAllAnnotations(); else clearSlideAnnotations();
          }
          break;
        case 'a':
        case 'A':
          if (mode === AppMode.PRESENTATION || mode === AppMode.OVERVIEW) {
            setShowAbout(prev => !prev); // Toggle about modal
          }
          break;
        case 'b':
        case 'B':
        case '.':
          // Black screen on the projector (a clicker's "black screen" button sends B or .)
          if (mode === AppMode.PRESENTATION) setIsBlackScreen(true);
          break;
        case 'F5':
          // A clicker's "start slideshow" button (F5 / Shift+F5): go fullscreen instead of reloading the page
          e.preventDefault();
          if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
          break;
        case 'v':
        case 'V':
          // Presenter camera on the slides on/off
          if (mode === AppMode.PRESENTATION) toggleCamera();
          break;
        case 'w':
        case 'W':
          // Live transcript on/off
          if (mode === AppMode.PRESENTATION) setIsTranscriptOn(!isTranscriptOn);
          break;
        case 'm':
        case 'M':
          // Animations (GIF/video over poster stills) on/off
          if (mode === AppMode.PRESENTATION) toggleMedia();
          break;
        case 'o':
        case 'O':
          // The menu (in the presenter view it stays hidden until called)
          if (mode === AppMode.PRESENTATION) setMenuRequest((n: number) => n + 1);
          break;
        case 'p':
        case 'P':
          if (mode !== AppMode.PRESENTATION) break;
          if (recording.isActive) {
            // While recording, P pauses/resumes the recording, and the timer with it
            const pausing = recording.status === 'recording';
            recording.togglePause();
            if (startTime && pausing !== isPaused) togglePause();
          } else if (startTime) {
            togglePause();
          }
          break;
        case 'h':
        case 'H':
          // Pan right (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 0.05; // 5% shift
            setZoomState((prev) => {
              const newPanX = prev.panX + panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panX: newPanX },
                } as SyncMessage);
              }
              return { ...prev, panX: newPanX };
            });
          }
          break;
        case 'j':
        case 'J':
          // Pan up (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 0.05; // 5% shift
            setZoomState((prev) => {
              const newPanY = prev.panY - panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panY: newPanY },
                } as SyncMessage);
              }
              return { ...prev, panY: newPanY };
            });
          }
          break;
        case 'k':
        case 'K':
          // Pan left (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 0.05; // 5% shift
            setZoomState((prev) => {
              const newPanX = prev.panX - panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panX: newPanX },
                } as SyncMessage);
              }
              return { ...prev, panX: newPanX };
            });
          }
          break;
        case 'u':
        case 'U':
          // Pan down (only when zoomed)
          if (mode === AppMode.PRESENTATION && zoomState.level > 1.0) {
            e.preventDefault();
            const panStep = 0.05; // 5% shift
            setZoomState((prev) => {
              const newPanY = prev.panY + panStep;
              // Broadcast pan update
              if (broadcastChannelRef.current) {
                broadcastChannelRef.current.postMessage({
                  type: 'STATE_UPDATE',
                  index: currentSlideIndex,
                  isSpotlight: isSpotlightActive,
                  spotlightPosition: spotlightPosition,
                  mode: mode,
                  isLaserActive: isLaserActive,
                  laserPosition: laserPosition,
                  zoomState: { ...prev, panY: newPanY },
                } as SyncMessage);
              }
              return { ...prev, panY: newPanY };
            });
          }
          break;
        case 't':
        case 'T':
          // Scroll speaker notes up (line-by-line) in dual screen mode
          if (mode === AppMode.PRESENTATION && isDualScreen && speakerNotesRef.current) {
            e.preventDefault();
            const lineHeight = speakerNotesFontSize * 1.625; // Match leading-relaxed (1.625)
            speakerNotesRef.current.scrollBy({
              top: -lineHeight,
              behavior: 'smooth'
            });
          }
          break;
        case 'g':
        case 'G':
          // Scroll speaker notes down (line-by-line) in dual screen mode
          if (mode === AppMode.PRESENTATION && isDualScreen && speakerNotesRef.current) {
            e.preventDefault();
            const lineHeight = speakerNotesFontSize * 1.625; // Match leading-relaxed (1.625)
            speakerNotesRef.current.scrollBy({
              top: lineHeight,
              behavior: 'smooth'
            });
          }
          break;
        case 'Escape':
          if (recording.status === 'countdown') {
            recording.cancelCountdown();
          } else if (showAbout) {
            setShowAbout(false);
          } else if (isCameraPanelOpen) {
            setIsCameraPanelOpen(false);
          } else if (isRecordingPanelOpen) {
            setIsRecordingPanelOpen(false);
          } else if (mode === AppMode.OVERVIEW) {
            setMode(AppMode.PRESENTATION);
          } else if (isAnnotating) {
            setIsAnnotating(false);
            setAnnotationDraft(null);
          } else if (isSpotlightActive) {
            setIsSpotlightActive(false);
          } else if (isLaserActive) {
            setIsLaserActive(false);
          } else if (isRegionSelecting) {
            setIsRegionSelecting(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, nextSlide, prevSlide, toggleOverview, toggleSpotlight, toggleLaser, toggleDualScreen, isSpotlightActive, isLaserActive, applyZoom, resetZoom, isRegionSelecting, showAbout, zoomState, currentSlideIndex, laserPosition, slides.length, overviewHighlightIndex, selectSlide, isDualScreen, startTime, togglePause, toggleAnnotate, isAnnotating, undoAnnotation, redoAnnotation, clearSlideAnnotations, clearAllAnnotations, toggleMedia, isBlackScreen, toggleCamera, isCameraPanelOpen, isRecordingPanelOpen, recording, isPaused, playback, isTranscriptOn]);

  // Mouse wheel: Shift + wheel zooms (Mode B); the plain wheel moves one slide per scroll gesture.
  // No slide change while zoomed, drawing, in the about dialog, or over the speaker notes (which scroll).
  const wheelStep = (direction: 1 | -1) => {
    if (mode !== AppMode.PRESENTATION || isRegionSelecting || isAnnotating || showAbout || playback || zoomState.level > 1.0) return;
    if (isBlackScreen) {
      setIsBlackScreen(false);
      return;
    }
    if (direction > 0) nextSlide(); else prevSlide();
  };
  wheelStepRef.current = wheelStep;
  const wheelStepperRef = useRef<((e: WheelEvent) => void) | null>(null);
  if (!wheelStepperRef.current) wheelStepperRef.current = createWheelStepper((direction) => wheelStepRef.current(direction));

  useEffect(() => {
    if (mode !== AppMode.PRESENTATION || isRegionSelecting || playback) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.5, Math.min(3.0, zoomState.level + delta));
        applyZoom(newZoom, false);
        return;
      }
      if (e.ctrlKey) return; // Trackpad pinch: leave it to the browser
      if (speakerNotesRef.current?.contains(e.target as Node)) return; // The notes panel scrolls itself
      if ((e.target as Element | null)?.closest?.('[data-transcript-pane]')) return; // So does the transcript
      e.preventDefault();
      wheelStepperRef.current?.(e);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [mode, zoomState.level, applyZoom, isRegionSelecting, playback]);

  // Right-click drag panning
  useEffect(() => {
    if (mode !== AppMode.PRESENTATION || zoomState.level <= 1.0) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) { // Right mouse button
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning && panStart) {
        const deltaX = e.clientX - panStart.x;
        const deltaY = e.clientY - panStart.y;
        
        // Find current rendered width/height to normalize delta
        let renderedWidth = 1000; // fallback
        let renderedHeight = 1000;
        
        const container = (isDualScreen ? presenterSlideRef.current : normalViewRef.current) || document.body;
        const img = container?.querySelector('img[class*="object-contain"]') as HTMLImageElement;
        
        if (img && img.naturalWidth) {
          const rect = img.getBoundingClientRect();
          // We need the rendered dimensions of the image *content*, which might be smaller than rect due to object-contain
          // OR, if we fixed the img styling to be w-auto h-auto, rect is the content.
          // Let's assume the new styling (w-auto h-auto max-w-full)
          // But we haven't applied that styling change to the element yet in this update batch.
          // So let's use the robust logic from spotlight calculation for now, or just rect if we update styling.
          
          // Using robust logic:
          const naturalRatio = img.naturalWidth / img.naturalHeight;
          const visibleRatio = rect.width / rect.height;
          
          if (visibleRatio > naturalRatio) {
             renderedWidth = rect.height * naturalRatio;
             renderedHeight = rect.height;
          } else {
             renderedWidth = rect.width;
             renderedHeight = rect.width / naturalRatio;
          }
          
          // Apply zoom level to get current rendered size on screen
          // The rect from getBoundingClientRect ALREADY includes the scale transform!
          // So rect.width IS the zoomed width.
          // Wait.
          // If we pan, we update panX/panY.
          // We want to add (deltaX / ZoomedWidth) to panX?
          // panX is fraction of ORIGINAL width.
          // So we need deltaX / (OriginalWidth * ZoomLevel).
          // Rect.width is (OriginalWidth * ZoomLevel).
          // So deltaX / Rect.width is the fraction of *original width*.
          // Wait.
          // If 100% means width.
          // Translate(10%) moves by 0.1 * Width * Scale pixels on screen.
          // So if we move mouse by D pixels.
          // D = Delta_Frac * Width * Scale.
          // Delta_Frac = D / (Width * Scale).
          // Width * Scale IS the current rect width.
          // So yes: Delta_Frac = D / rect.width.
          
          renderedWidth = rect.width;
          renderedHeight = rect.height;
        }

        setZoomState((prev) => ({
          ...prev,
          panX: prev.panX + (deltaX / renderedWidth),
          panY: prev.panY + (deltaY / renderedHeight),
        }));
        
        setPanStart({ x: e.clientX, y: e.clientY });
        
        // Broadcast pan update
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'STATE_UPDATE',
            index: currentSlideIndex,
            isSpotlight: isSpotlightActive,
            spotlightPosition: spotlightPosition,
            mode: mode,
            isLaserActive: isLaserActive,
            laserPosition: laserPosition,
            zoomState: {
              level: zoomState.level,
              panX: zoomState.panX + (deltaX / renderedWidth),
              panY: zoomState.panY + (deltaY / renderedHeight),
            },
          } as SyncMessage);
        }
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      setPanStart(null);
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [mode, zoomState, isPanning, panStart, currentSlideIndex, isSpotlightActive, isLaserActive, laserPosition]);

  // Region selection with Z key (Mode C)
  useEffect(() => {
    if (!isRegionSelecting || mode !== AppMode.PRESENTATION) {
      setRegionStart(null);
      setRegionCurrent(null);
      isDraggingRef.current = false;
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && !isDraggingRef.current) { // Left mouse button
        e.preventDefault();
        e.stopPropagation();
        isDraggingRef.current = true;
        
        const container = (isDualScreen ? presenterSlideRef.current : normalViewRef.current) || document.body;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        
        const point = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        
        regionStartRef.current = point;
        regionCurrentRef.current = point;
        setRegionStart(point);
        setRegionCurrent(point);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !regionStartRef.current) return;
      
      const container = (isDualScreen ? presenterSlideRef.current : normalViewRef.current) || document.body;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      
      regionCurrentRef.current = point;
      setRegionCurrent(point);
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!isDraggingRef.current || !regionStartRef.current || !regionCurrentRef.current) {
        isDraggingRef.current = false;
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = false;
      
      const container = (isDualScreen ? presenterSlideRef.current : normalViewRef.current) || document.body;
      if (!container) return;
      
      const img = container.querySelector('img[class*="object-contain"]') as HTMLImageElement;
      if (!img) {
        setIsRegionSelecting(false);
        setRegionStart(null);
        setRegionCurrent(null);
        return;
      }

      // We need BOTH container rect (unzoomed base) AND img rect (zoomed visual)
      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      
      // 1. Calculate region relative to the current visual image (normalized 0-1)
      const currentVisualLeft = imgRect.left - containerRect.left;
      const currentVisualTop = imgRect.top - containerRect.top;
      
      // Calculate start/end in 0-1 coords relative to the visual image
      const startX = Math.max(0, Math.min(1, (regionStartRef.current.x - currentVisualLeft) / imgRect.width));
      const startY = Math.max(0, Math.min(1, (regionStartRef.current.y - currentVisualTop) / imgRect.height));
      const endXNorm = Math.max(0, Math.min(1, (regionCurrentRef.current.x - currentVisualLeft) / imgRect.width));
      const endYNorm = Math.max(0, Math.min(1, (regionCurrentRef.current.y - currentVisualTop) / imgRect.height));
      
      const regionWidth = Math.abs(endXNorm - startX);
      const regionHeight = Math.abs(endYNorm - startY);
      
      if (regionWidth > 0.01 && regionHeight > 0.01) { // Minimum region size (1%)
        const newZoomLevel = Math.max(1.5, Math.min(3.0, 1 / Math.max(regionWidth, regionHeight)));
        
        // Calculate center of region in normalized coordinates (0-1 relative to content)
        const centerX = (startX + endXNorm) / 2;
        const centerY = (startY + endYNorm) / 2;
        
        // Apply zoom first
        await applyZoom(newZoomLevel, true);
        
        // Pan offset = (0.5 - centerX)
        const panX = (0.5 - centerX);
        const panY = (0.5 - centerY);
        
        // Update pan state
        setZoomState((prev) => ({
          ...prev,
          panX: panX,
          panY: panY,
        }));
        
        // Broadcast pan update
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'STATE_UPDATE',
            index: currentSlideIndex,
            isSpotlight: isSpotlightActive,
            spotlightPosition: spotlightPosition,
            mode: mode,
            isLaserActive: isLaserActive,
            laserPosition: laserPosition,
            zoomState: {
              level: newZoomLevel,
              panX: panX,
              panY: panY,
            },
          } as SyncMessage);
        }
      }
      
      setIsRegionSelecting(false);
      setRegionStart(null);
      setRegionCurrent(null);
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      isDraggingRef.current = false;
    };
  }, [isRegionSelecting, mode, isDualScreen, applyZoom, currentSlideIndex, isSpotlightActive, isLaserActive, laserPosition]);

  // --- Render Logic ---

  if (isReceiver) {
    return <ReceiverView />;
  }

  const currentAnnotations = annotations[currentSlideIndex] || [];

  // Shared by the dual-screen and normal presentation views
  const annotationToolbar = isAnnotating && mode === AppMode.PRESENTATION ? (
    <AnnotationToolbar
      tool={annotationTool}
      color={annotationColor}
      strokeWidth={annotationWidth}
      canUndo={annotationHistoryRef.current.past.length > 0}
      canRedo={annotationHistoryRef.current.future.length > 0}
      hasSlideAnnotations={currentAnnotations.length > 0}
      onToolChange={setAnnotationTool}
      onColorChange={setAnnotationColor}
      onWidthChange={setAnnotationWidth}
      onUndo={undoAnnotation}
      onRedo={redoAnnotation}
      onClearSlide={clearSlideAnnotations}
      onClearAll={clearAllAnnotations}
      onClose={toggleAnnotate}
    />
  ) : null;

  const renderAnnotationLayer = (containerRef: React.RefObject<HTMLDivElement>) => (
    <AnnotationLayer
      annotations={currentAnnotations}
      draft={annotationDraft}
      containerRef={containerRef}
      zoomLevel={zoomState.level}
      panX={zoomState.panX}
      panY={zoomState.panY}
      editable={isAnnotating}
      tool={annotationTool}
      color={annotationColor}
      strokeWidth={annotationWidth}
      onDraftChange={setAnnotationDraft}
      onCommit={commitAnnotation}
      onErase={eraseAnnotation}
      onEraseEnd={endEraseGesture}
    />
  );

  // Animated media over the current slide's poster stills (main views only, never in previews)
  const renderMediaOverlay = (containerRef: React.RefObject<HTMLDivElement>) => (
    <MediaOverlay
      media={slides[currentSlideIndex]?.media || []}
      mediaMap={mediaMap}
      containerRef={containerRef}
      slideId={slides[currentSlideIndex]?.id ?? ''}
      zoomLevel={zoomState.level}
      panX={zoomState.panX}
      panY={zoomState.panY}
      playing={isMediaActive && mode === AppMode.PRESENTATION}
    />
  );

  // The presenter's camera on the current slide; draggable while no pointer tool is active
  const canMoveCamera = !isAnnotating && !isLaserActive && !isSpotlightActive && !isRegionSelecting;
  const renderCameraOverlay = (containerRef: React.RefObject<HTMLDivElement>) => (
    <CameraOverlay
      stream={isCameraOn && mode === AppMode.PRESENTATION ? camera.stream : null}
      settings={cameraSettings}
      slideCamera={slides[currentSlideIndex]?.camera}
      containerRef={containerRef}
      slideId={slides[currentSlideIndex]?.id ?? ''}
      onMove={canMoveCamera ? (position) => updateCameraSettings({ position }) : undefined}
      onOpenSettings={openCameraPanel}
    />
  );

  const cameraPanel = (
    <CameraPanel
      isOpen={isCameraPanelOpen}
      onClose={() => setIsCameraPanelOpen(false)}
      settings={cameraSettings}
      onChange={updateCameraSettings}
      isCameraOn={isCameraOn}
      onToggleCamera={toggleCamera}
      stream={camera.stream}
      error={camera.error}
      slideCamera={slides[currentSlideIndex]?.camera}
    />
  );

  const recordingPanel = (
    <RecordingPanel
      isOpen={isRecordingPanelOpen}
      onClose={() => setIsRecordingPanelOpen(false)}
      recording={recording}
      exporter={recordingExport}
      currentSlide={currentSlideIndex}
      isCameraOn={isCameraOn}
      onRecord={() => {
        setIsRecordingPanelOpen(false);
        recording.start();
      }}
      onRerecordSlide={(slideIndex: number) => {
        setIsRecordingPanelOpen(false);
        selectSlide(slideIndex);
        recording.start({ replaceSlide: slideIndex });
      }}
      onPlay={(recordingId: string, clip?: number) => {
        if (recording.status !== 'idle') return;
        setIsRecordingPanelOpen(false);
        setPlayback({ recordingId, clip: clip ?? 0 });
      }}
    />
  );

  const recordingOverlays = (
    <>
      <RecordingIndicator recording={recording} />
      {playback && (
        <PlaybackView
          key={`${playback.recordingId}:${playback.clip}`}
          recordingId={playback.recordingId}
          startClip={playback.clip}
          slides={slides}
          mediaMap={mediaMap}
          exporter={recordingExport}
          onClose={() => setPlayback(null)}
        />
      )}
    </>
  );

  const missingMediaBanner = missingMedia.length > 0 && !isMissingMediaDismissed ? (
    <div
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-xl flex items-center gap-3 bg-neutral-900/95 border border-amber-500/40 text-amber-100 text-sm px-4 py-2 rounded-lg shadow-lg"
    >
      <span>
        {missingMedia.length} animation{missingMedia.length === 1 ? '' : 's'} can't play yet (
        {missingMedia.slice(0, 2).map((path) => path.split('/').pop()).join(', ')}
        {missingMedia.length > 2 ? ', …' : ''}): the browser only reads files you choose.
      </span>
      <input
        ref={(el) => {
          mediaFolderInputRef.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        className="hidden"
        onChange={(e) => {
          addMediaFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        onClick={(e) => {
          e.currentTarget.blur(); // Space/Enter must keep advancing slides, not reopen the picker
          mediaFolderInputRef.current?.click();
        }}
        className="shrink-0 px-3 py-1 rounded bg-amber-500 text-neutral-900 font-semibold hover:bg-amber-400"
      >
        Choose deck folder…
      </button>
      <button
        onClick={() => setIsMissingMediaDismissed(true)}
        className="text-neutral-400 hover:text-white leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  ) : null;

  const mediaNoticeBanner = mediaNotice ? (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-xl flex items-start gap-3 bg-neutral-900/95 border border-amber-500/40 text-amber-100 text-sm px-4 py-2 rounded-lg shadow-lg"
    >
      <span>{mediaNotice.text}</span>
      <button
        onClick={() => setMediaNotice(null)}
        className="text-neutral-400 hover:text-white leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  ) : null;

  if (mode === AppMode.UPLOAD) {
    return <UploadScreen onSlidesLoaded={startPresentation} />;
  }

  // Safety check: if no slides loaded, show upload screen
  if (slides.length === 0) {
    return <UploadScreen onSlidesLoaded={startPresentation} />;
  }

  // --- Presenter View (Dual Screen Active) ---
  if (isDualScreen && mode === AppMode.PRESENTATION) {
    const nextIndex = Math.min(currentSlideIndex + 1, slides.length - 1);
    const sideBlocks = presenterLayout.shownIn('side');
    const topBlocks = presenterLayout.shownIn('top');
    const bottomBlocks = presenterLayout.shownIn('bottom');
    const floatingBlocks = (['next', 'notes', 'transcript'] as BlockId[]).filter(
      (id) => layout.floating[id] && (id !== 'transcript' || isTranscriptOn)
    );
    const blockDrag = presenterLayout.drag;
    type BlockExtra = { place: string; className?: string; style?: React.CSSProperties; children?: React.ReactNode };
    const renderBlock = (id: BlockId, { place, className, style, children }: BlockExtra) => {
      const common = {
        className: clsx(className, blockDrag?.id === id && 'opacity-40'),
        style,
        headerProps: presenterLayout.moveHandleProps(id),
        children,
      };
      if (id === 'next')
        return (
          <NextSlidePane
            key={id}
            place={place}
            src={currentSlideIndex < slides.length - 1 ? slides[nextIndex].src : null}
            footer={
              <PaceTimer
                plan={pacePlan}
                unit={paceUnit}
                unitMs={paceUnitMs}
                startTime={startTime}
                pausedTime={pausedTime}
                pauseStartTime={isPaused ? pauseStartTime : null}
                settings={paceSettings}
                onSettings={changePaceSettings}
                talkEnd={talkEnd}
                onTalkEnd={changeTalkEnd}
                currentIndex={currentSlideIndex}
                slideCount={slides.length}
                onTogglePause={togglePause}
                onReset={resetTimer}
              />
            }
            {...common}
          />
        );
      if (id === 'notes')
        return (
          <SpeakerNotesPane
            key={id}
            place={place}
            notes={parseTimeTag(slides[currentSlideIndex].notes).text}
            slideName={slides[currentSlideIndex].name}
            fontSize={speakerNotesFontSize}
            isReadingGuideEnabled={isReadingGuideEnabled}
            onToggleReadingGuide={toggleReadingGuide}
            onDecreaseFontSize={decreaseFontSize}
            onIncreaseFontSize={increaseFontSize}
            scrollRef={speakerNotesRef}
            {...common}
          />
        );
      return (
        <TranscriptPane
          key={id}
          place={place}
          transcript={transcript}
          fontSize={layout.fontSize}
          showAudience={isCaptionShared}
          onFontSize={(step) => {
            const sizes = TRANSCRIPT_FONT_SIZES;
            const at = sizes.findIndex((size) => size >= layout.fontSize);
            const index = Math.max(0, Math.min(sizes.length - 1, (at < 0 ? sizes.length - 1 : at) + step));
            presenterLayout.update({ fontSize: sizes[index] });
          }}
          onToggleAudience={() => setIsCaptionShared(!isCaptionShared)}
          onClose={() => setIsTranscriptOn(false)}
          {...common}
        />
      );
    };
    // An edge between sections: a wide grab area around a thin line (drag to resize, double-click to reset)
    const edgeBar = (edge: Edge, vertical: boolean) => (
      <div
        key={`edge-${edge.kind}-${'dock' in edge ? edge.dock : ''}-${'after' in edge ? edge.after : ''}`}
        {...presenterLayout.edgeProps(edge)}
        className={clsx('flex-shrink-0 flex items-center justify-center group', vertical ? 'w-4 cursor-col-resize' : 'h-4 cursor-row-resize')}
      >
        <div className={clsx('rounded-full bg-neutral-700 group-hover:bg-blue-500 transition-colors', vertical ? 'w-1 h-full' : 'h-1 w-full')} />
      </div>
    );
    // A place's blocks: stacked in the sidebar, side by side in a strip, each sharing the place by its weight
    const renderDock = (dock: DockId, blocks: BlockId[]) => {
      const horizontal = dock !== 'side';
      const total = blocks.reduce((sum, id) => sum + layout.weights[id], 0);
      // A percentage basis (padding included), shrunk evenly to make room for the edges between blocks
      return blocks.map((id, i) => (
        <React.Fragment key={id}>
          {i > 0 && edgeBar({ kind: 'between', dock, after: blocks[i - 1] }, horizontal)}
          {renderBlock(id, { place: dock, className: 'min-h-0 min-w-0', style: { flex: `0 1 ${(layout.weights[id] / total) * 100}%` } })}
        </React.Fragment>
      ));
    };
    
    return (
      <div className={`w-full h-screen bg-neutral-900 text-white flex flex-col overflow-hidden ${isLaserActive ? 'cursor-none' : ''}`}>
        {/* Presenter Dashboard */}
        <div ref={presenterContainerRef} className="flex-1 min-h-0 flex p-4 h-full presenter-container">
            
          {/* Current slide column, with the strips above/below it; the full width when the sidebar is empty */}
          <div ref={presenterColumnRef} className="flex-1 flex flex-col min-w-0">
            {topBlocks.length > 0 && (
              <>
                <div data-dock="top" className="flex flex-row flex-shrink-0 min-h-0" style={{ height: `${layout.topHeight}%` }}>
                  {renderDock('top', topBlocks)}
                </div>
                {edgeBar({ kind: 'strip', dock: 'top' }, false)}
              </>
            )}
            {/* Main Slide */}
            <div 
              ref={presenterSlideRef}
              className={`flex-1 min-h-0 bg-black rounded-2xl flex items-center justify-center relative overflow-hidden border border-neutral-700 ${isLaserActive ? 'cursor-none' : ''}`}
            >
               <div className="relative w-full h-full flex items-center justify-center overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '100%' }}>
                 <img 
                   src={zoomedSlideSrc && zoomedSlideRef.current === slides[currentSlideIndex].id 
                     ? zoomedSlideSrc 
                     : slides[currentSlideIndex].src} 
                   className="w-auto h-auto max-w-full max-h-full object-contain transition-transform duration-200"
                   alt={slides[currentSlideIndex].name}
                   style={{
                     transform: zoomState.level > 1.0 
                       ? `scale(${zoomState.level}) translate(${zoomState.panX * 100}%, ${zoomState.panY * 100}%)`
                       : 'none',
                     transformOrigin: 'center center',
                   }}
                 />
                 {renderMediaOverlay(presenterSlideRef)}
                 {renderCameraOverlay(presenterSlideRef)}
                 {/* Overlays inside the aspect-ratio container */}
                 <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-sm font-mono text-red-400 border border-red-500/30 z-50">
                   LIVE ON PROJECTOR
                 </div>
                 {isBlackScreen && (
                   <div className="absolute inset-0 z-40 bg-black/75 flex items-center justify-center pointer-events-none">
                     <span className="px-3 py-1 rounded-full border border-neutral-500 text-sm font-mono text-neutral-200">
                       PROJECTOR BLACK: press any navigation key
                     </span>
                   </div>
                 )}
                 {isRegionSelecting && (
                   <div className="absolute top-4 right-4 bg-blue-600/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 text-white text-sm font-medium shadow-lg border border-blue-400/30 z-50">
                     <Search className="w-4 h-4" />
                     <span>Click, drag & release to zoom</span>
                   </div>
                 )}
                 <LinkOverlay
                   links={slides[currentSlideIndex].links || []}
                   containerRef={presenterSlideRef}
                   onNavigate={selectSlide}
                   disabled={isSpotlightActive || isLaserActive || isAnnotating}
                   zoomLevel={zoomState.level}
                   panX={zoomState.panX}
                   panY={zoomState.panY}
                 />
                 {renderAnnotationLayer(presenterSlideRef)}
                 <RegionSelector
                   isActive={isRegionSelecting}
                   start={regionStart}
                   current={regionCurrent}
                   containerRef={presenterSlideRef}
                 />
                 <SpotlightLayer 
                   isActive={isSpotlightActive} 
                   position={spotlightPosition}
                   containerRef={presenterSlideRef}
                   zoomLevel={zoomState.level}
                   panX={zoomState.panX}
                   panY={zoomState.panY}
                 />
                 <LaserPointer 
                   isActive={isLaserActive} 
                   position={laserPosition} 
                   containerRef={presenterSlideRef} 
                   zoomLevel={zoomState.level}
                   panX={zoomState.panX}
                   panY={zoomState.panY}
                 />
               </div>
            </div>
            {bottomBlocks.length > 0 && (
              <>
                {edgeBar({ kind: 'strip', dock: 'bottom' }, false)}
                <div data-dock="bottom" className="flex flex-row flex-shrink-0 min-h-0" style={{ height: `${layout.bottomHeight}%` }}>
                  {renderDock('bottom', bottomBlocks)}
                </div>
              </>
            )}
          </div>

          {/* Sidebar beside the slide (Resizable), while it holds a block */}
          {sideBlocks.length > 0 && (
            <>
              {edgeBar({ kind: 'side' }, true)}
              <div data-dock="side" className="flex flex-col presenter-sidebar min-w-0 flex-shrink-0" style={{ width: `${layout.sideWidth}%` }}>
                {renderDock('side', sideBlocks)}
              </div>
            </>
          )}
        </div>

        {/* Floating blocks: drag the title bar to move (double-click: back to the sidebar), the corner to resize */}
        {floatingBlocks.map((id) => {
          // Kept on screen (the window may have been made smaller since it was placed)
          const saved = layout.floating[id]!;
          const rect = { ...saved, x: Math.max(0, Math.min(saved.x, 1 - saved.w)), y: Math.max(0, Math.min(saved.y, 0.92)) };
          return renderBlock(id, {
            place: 'floating',
            className: clsx('fixed', id === 'transcript' ? 'z-[66]' : 'z-[65]'),
            style: { left: `${rect.x * 100}vw`, top: `${rect.y * 100}vh`, width: `${rect.w * 100}vw`, height: `${rect.h * 100}vh` },
            children: (
              <div
                {...presenterLayout.floatResizeProps(id)}
                className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize z-30"
                style={{ touchAction: 'none', background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.35) 50%)' }}
              />
            ),
          });
        })}

        {/* While a block is dragged: where it will land, and its name at the pointer */}
        {blockDrag?.preview && (
          <div
            data-drop-preview={blockDrag.target?.kind === 'dock' ? blockDrag.target.dock : 'floating'}
            className="fixed z-[90] pointer-events-none rounded-2xl border-2 border-blue-400 bg-blue-500/15 transition-all duration-75"
            style={blockDrag.preview}
          />
        )}
        {blockDrag && (
          <div
            className="fixed z-[91] pointer-events-none px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold shadow-lg"
            style={{ left: blockDrag.x + 12, top: blockDrag.y + 12 }}
          >
            {BLOCK_NAMES[blockDrag.id]}
          </div>
        )}

        {/* Menu: hidden until called (bottom edge, its tab, or O), then it slides up over the content */}
        <Controls
          reveal="edge"
          openRequest={menuRequest}
          currentSlide={currentSlideIndex}
          totalSlides={slides.length}
          mode={mode}
          isSpotlight={isSpotlightActive}
          isLaser={isLaserActive}
          startTime={startTime}
          zoomLevel={zoomState.level}
          isPaused={isPaused}
          pausedTime={pausedTime + (pauseStartTime ? Date.now() - pauseStartTime : 0)}
          togglePause={togglePause}
          resetTimer={resetTimer}
          toggleOverview={toggleOverview}
          toggleSpotlight={toggleSpotlight}
          toggleLaser={toggleLaser}
          isAnnotating={isAnnotating}
          toggleAnnotate={toggleAnnotate}
          isCameraOn={isCameraOn}
          onCameraClick={toggleCameraPanel}
          isRecording={recording.isActive}
          onRecordClick={toggleRecordingPanel}
          isTranscriptOn={isTranscriptOn}
          onTranscriptClick={() => setIsTranscriptOn(!isTranscriptOn)}
          toggleDualScreen={toggleDualScreen}
          nextSlide={nextSlide}
          prevSlide={prevSlide}
          onAboutClick={() => setShowAbout(true)}
        />

        {annotationToolbar}
        {cameraPanel}
        {recordingPanel}
        {recordingOverlays}
        {mediaNoticeBanner ?? missingMediaBanner}

        {/* About Modal - also available in dual-screen mode */}
        <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
      </div>
    );
  }

  // --- Normal Presentation View ---
  return (
    <div ref={normalViewRef} className={`w-full h-screen bg-black text-white relative overflow-hidden normal-presentation-container ${isLaserActive ? 'cursor-none' : ''}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlideIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full h-full flex items-center justify-center"
        >
          <img 
            src={zoomedSlideSrc && zoomedSlideRef.current === slides[currentSlideIndex].id 
              ? zoomedSlideSrc 
              : slides[currentSlideIndex].src} 
            className="w-auto h-auto max-w-full max-h-full object-contain transition-transform duration-200"
            alt={slides[currentSlideIndex].name}
            style={{
              transform: zoomState.level > 1.0 
                ? `scale(${zoomState.level}) translate(${zoomState.panX * 100}%, ${zoomState.panY * 100}%)`
                : 'none',
              transformOrigin: 'center center',
            }}
          />
          {renderMediaOverlay(normalViewRef)}
          <LinkOverlay
            links={slides[currentSlideIndex].links || []}
            containerRef={normalViewRef}
            onNavigate={selectSlide}
            disabled={isSpotlightActive || isLaserActive || isAnnotating}
            zoomLevel={zoomState.level}
            panX={zoomState.panX}
            panY={zoomState.panY}
          />
          {renderAnnotationLayer(normalViewRef)}
          {isRegionSelecting && (
            <div className="absolute top-4 right-4 bg-blue-600/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 text-white text-sm font-medium shadow-lg border border-blue-400/30 z-50">
              <Search className="w-4 h-4" />
              <span>Click, drag & release to zoom</span>
            </div>
          )}
          <RegionSelector
            isActive={isRegionSelecting}
            start={regionStart}
            current={regionCurrent}
            containerRef={normalViewRef}
          />
          <SpotlightLayer 
            isActive={isSpotlightActive} 
            position={spotlightPosition}
            containerRef={normalViewRef}
            zoomLevel={zoomState.level}
            panX={zoomState.panX}
            panY={zoomState.panY}
          />
          <LaserPointer 
            isActive={isLaserActive} 
            position={laserPosition} 
            containerRef={normalViewRef} 
            zoomLevel={zoomState.level}
            panX={zoomState.panX}
            panY={zoomState.panY}
          />
        </motion.div>
      </AnimatePresence>
      {/* Outside the per-slide fade, so the camera stays steady through slide changes */}
      {renderCameraOverlay(normalViewRef)}
      {/* One screen: the transcript shows as captions (everything here is seen by the audience) */}
      {mode === AppMode.PRESENTATION && <CaptionBar text={isTranscriptOn ? liveCaption : null} />}
      {isTranscriptOn && !transcript.isListening && !transcript.error && (
        <div className="absolute top-4 right-4 z-[60] px-3 py-1.5 rounded-lg bg-neutral-900/85 text-xs text-neutral-300 pointer-events-none" data-transcript-status="">
          {transcript.status === 'ready'
            ? 'Transcript: opening the microphone…'
            : `Transcript: loading the speech model${transcript.progress > 0 && transcript.progress < 1 ? ` (${Math.round(transcript.progress * 100)}%)` : ''}…`}
        </div>
      )}

      <Controls
        currentSlide={currentSlideIndex}
        totalSlides={slides.length}
        mode={mode}
        isSpotlight={isSpotlightActive}
        isLaser={isLaserActive}
        startTime={startTime}
        zoomLevel={zoomState.level}
        isPaused={isPaused}
        pausedTime={pausedTime + (pauseStartTime ? Date.now() - pauseStartTime : 0)}
        togglePause={togglePause}
        resetTimer={resetTimer}
        toggleOverview={toggleOverview}
        toggleSpotlight={toggleSpotlight}
        toggleLaser={toggleLaser}
        isAnnotating={isAnnotating}
        toggleAnnotate={toggleAnnotate}
        isCameraOn={isCameraOn}
        onCameraClick={toggleCameraPanel}
        isRecording={recording.isActive}
        onRecordClick={toggleRecordingPanel}
        isTranscriptOn={isTranscriptOn}
        onTranscriptClick={() => setIsTranscriptOn(!isTranscriptOn)}
        toggleDualScreen={toggleDualScreen}
        nextSlide={nextSlide}
        prevSlide={prevSlide}
        onAboutClick={() => setShowAbout(true)}
        openRequest={menuRequest}
      />

      {isBlackScreen && (
        <div className="absolute inset-0 z-[45] bg-black" onClick={() => setIsBlackScreen(false)} aria-label="Black screen" />
      )}
      {annotationToolbar}
      {cameraPanel}
      {recordingPanel}
      {recordingOverlays}
      {mediaNoticeBanner ?? missingMediaBanner}

      {/* Overview Mode */}
      {mode === AppMode.OVERVIEW && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-neutral-900 z-30 overflow-y-auto p-8"
        >
          <div className="grid grid-cols-4 gap-4 max-w-7xl mx-auto">
            {slides.map((slide, index) => (
              <motion.div
                key={index}
                ref={(el) => {
                  overviewSlideRefs.current[index] = el;
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => selectSlide(index)}
                className={clsx(
                  "cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                  index === currentSlideIndex
                    ? "border-blue-500 ring-2 ring-blue-500/50"
                    : index === overviewHighlightIndex
                    ? "border-yellow-500 ring-2 ring-yellow-500/50 bg-yellow-500/10"
                    : "border-neutral-700 hover:border-neutral-600"
                )}
              >
                <img 
                  src={slide.src} 
                  className="w-full h-auto"
                  alt={slide.name}
                />
                <div className="p-2 bg-neutral-800 text-sm truncate">
                  {slide.name}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* About Modal */}
      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
};

export default App;