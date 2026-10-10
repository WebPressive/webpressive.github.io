import React, { useEffect, useRef, useState } from 'react';
import { Video, X, Circle, Square, RectangleHorizontal, Mic, GripHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { CameraCorner, CameraSettings, CameraShape, SlideCamera } from '../types';
import { CAMERA_SIZE_MAX, CAMERA_SIZE_MIN, useAudioLevel, useMediaDevices, useMicrophoneStream, useVideoStream } from '../utils/camera';
import { useDraggablePanel } from '../utils/draggablePanel';

interface CameraPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CameraSettings;
  onChange: (changes: Partial<CameraSettings>) => void;
  isCameraOn: boolean;
  onToggleCamera: () => void;
  stream: MediaStream | null; // The presenter's camera, live while this panel is open
  error: string | null;
  slideCamera?: SlideCamera; // The current slide's own placement, if any
}

const SHAPES: { value: CameraShape; label: string; icon: React.ReactNode }[] = [
  { value: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
  { value: 'rounded', label: 'Rounded', icon: <Square className="w-4 h-4" /> },
  { value: 'rectangle', label: 'Rectangle', icon: <RectangleHorizontal className="w-4 h-4" /> },
];

const CORNERS: { value: CameraCorner; label: string; className: string }[] = [
  { value: 'top-left', label: 'Top left', className: 'top-1 left-1' },
  { value: 'top-right', label: 'Top right', className: 'top-1 right-1' },
  { value: 'bottom-left', label: 'Bottom left', className: 'bottom-1 left-1' },
  { value: 'bottom-right', label: 'Bottom right', className: 'bottom-1 right-1' },
];

const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={clsx('relative w-9 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-blue-600' : 'bg-neutral-700')}
  >
    <span className={clsx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', checked && 'translate-x-4')} />
  </button>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-2">{children}</h3>
);

const selectClass = 'w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-blue-500';

/**
 * Camera and microphone settings, as a side panel so the slide (and the camera on it) stays visible.
 * Drag its header to move it; it keeps that place for the session. The camera is live while the panel
 * is open; the microphone only while "Test" is on.
 */
const CameraPanel: React.FC<CameraPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  isCameraOn,
  onToggleCamera,
  stream,
  error,
  slideCamera,
}) => {
  const previewRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { isDocked, handleProps, panelStyle } = useDraggablePanel(panelRef);
  const [isMicTestOn, setIsMicTestOn] = useState(false);
  useEffect(() => {
    if (!isOpen) setIsMicTestOn(false); // Closing the panel ends the microphone test
  }, [isOpen]);
  const mic = useMicrophoneStream(isOpen && isMicTestOn, settings.audioDeviceId);
  const level = useAudioLevel(mic.stream);
  // Labels appear once access is granted: list again when a stream opens
  const { cameras, microphones } = useMediaDevices(`${stream?.id ?? ''}|${mic.stream?.id ?? ''}`);
  useVideoStream(previewRef, isOpen ? stream : null);

  if (!isOpen) return null;

  const activeCameraId = stream?.getVideoTracks()[0]?.getSettings().deviceId ?? '';
  const activeMicId = mic.stream?.getAudioTracks()[0]?.getSettings().deviceId ?? '';
  const isFreePosition = typeof settings.position !== 'string';

  return (
    <div
      role="dialog"
      aria-label="Camera settings"
      ref={panelRef}
      data-camera-panel=""
      className={clsx(
        'fixed z-[60] w-80 overflow-y-auto bg-neutral-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl text-white',
        isDocked && 'top-4 right-4'
      )}
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#525252 #171717', ...panelStyle }}
    >
      <div
        data-camera-panel-handle=""
        className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 cursor-move select-none sticky top-0 bg-neutral-900 z-10 rounded-t-2xl"
        {...handleProps}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Video className="w-5 h-5" />
          Camera
          <GripHorizontal className="w-4 h-4 text-neutral-500" aria-hidden="true" />
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white" aria-label="Close camera settings">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* On/off */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Show camera on slides</div>
            <div className="text-xs text-neutral-500">
              Press <kbd className="px-1 py-0.5 bg-neutral-800 rounded border border-neutral-700">V</kbd> any time
            </div>
          </div>
          <Toggle checked={isCameraOn} onChange={onToggleCamera} label="Show camera on slides" />
        </div>

        {/* Preview and device */}
        <div>
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-neutral-800 mb-2">
            {stream ? (
              <video
                ref={previewRef}
                className="w-full h-full object-cover"
                style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined }}
                autoPlay
                muted
                playsInline
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500 px-4 text-center">
                {error ? 'No camera picture' : 'Starting the camera…'}
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="text-xs text-amber-300 mb-2">
              {error}
            </p>
          )}
          <label className="block">
            <span className="sr-only">Camera</span>
            <select
              className={selectClass}
              value={settings.videoDeviceId && cameras.some((c) => c.deviceId === settings.videoDeviceId) ? settings.videoDeviceId : ''}
              onChange={(e) => onChange({ videoDeviceId: e.target.value })}
              aria-label="Camera"
            >
              <option value="">
                Default camera{!settings.videoDeviceId && activeCameraId ? ` (${cameras.find((c) => c.deviceId === activeCameraId)?.label || 'in use'})` : ''}
              </option>
              {cameras.map((camera, index) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Shape */}
        <div>
          <SectionTitle>Shape</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {SHAPES.map((shape) => (
              <button
                key={shape.value}
                onClick={() => onChange({ shape: shape.value })}
                aria-pressed={settings.shape === shape.value}
                className={clsx(
                  'flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-colors',
                  settings.shape === shape.value ? 'border-blue-500 bg-blue-600/20 text-white' : 'border-neutral-700 hover:bg-white/5 text-neutral-300'
                )}
              >
                {shape.icon}
                {shape.label}
              </button>
            ))}
          </div>
        </div>

        {/* Position */}
        <div>
          <SectionTitle>Position</SectionTitle>
          {slideCamera && (
            <p className="text-xs text-blue-300 mb-2">
              {slideCamera.hidden ? 'This slide hides the camera (wpcamera:off).' : 'This slide sets the camera box itself (wpcamera:).'}
            </p>
          )}
          <div className="flex items-start gap-3">
            <div className="relative w-28 aspect-video bg-neutral-800 rounded-md border border-neutral-700 shrink-0">
              {CORNERS.map((corner) => (
                <button
                  key={corner.value}
                  onClick={() => onChange({ position: corner.value })}
                  aria-label={corner.label}
                  aria-pressed={settings.position === corner.value}
                  title={corner.label}
                  className={clsx(
                    'absolute w-6 h-4 rounded-sm border transition-colors',
                    corner.className,
                    settings.position === corner.value ? 'bg-blue-500 border-blue-300' : 'bg-neutral-700 border-neutral-600 hover:bg-neutral-600'
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-neutral-400 leading-snug">
              {isFreePosition ? 'Placed by dragging. Pick a corner to snap back. ' : ''}
              Drag the camera on your slide to place it anywhere.
            </p>
          </div>
        </div>

        {/* Size */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>Size</SectionTitle>
            <span className="text-xs font-mono text-neutral-400">{Math.round(settings.size * 100)}%</span>
          </div>
          <input
            type="range"
            min={CAMERA_SIZE_MIN * 100}
            max={CAMERA_SIZE_MAX * 100}
            step={1}
            value={Math.round(settings.size * 100)}
            onChange={(e) => onChange({ size: Number(e.target.value) / 100 })}
            className="w-full accent-blue-500"
            aria-label="Camera size, percent of the slide width"
          />
        </div>

        {/* Mirror and border */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Mirror</span>
            <Toggle checked={settings.mirror} onChange={() => onChange({ mirror: !settings.mirror })} label="Mirror" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Border</span>
            <Toggle checked={settings.border} onChange={() => onChange({ border: !settings.border })} label="Border" />
          </div>
        </div>

        {/* Microphone */}
        <div className="pt-4 border-t border-white/10">
          <SectionTitle>Microphone (for recordings)</SectionTitle>
          <select
            className={selectClass}
            value={settings.audioDeviceId && microphones.some((m) => m.deviceId === settings.audioDeviceId) ? settings.audioDeviceId : ''}
            onChange={(e) => onChange({ audioDeviceId: e.target.value })}
            aria-label="Microphone"
          >
            <option value="">
              Default microphone{!settings.audioDeviceId && activeMicId ? ` (${microphones.find((m) => m.deviceId === activeMicId)?.label || 'in use'})` : ''}
            </option>
            {microphones.map((microphone, index) => (
              <option key={microphone.deviceId} value={microphone.deviceId}>
                {microphone.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setIsMicTestOn(!isMicTestOn)}
              aria-pressed={isMicTestOn}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors shrink-0',
                isMicTestOn ? 'border-green-500 bg-green-600/20 text-white' : 'border-neutral-700 hover:bg-white/5 text-neutral-300'
              )}
            >
              <Mic className="w-3.5 h-3.5" />
              {isMicTestOn ? 'Stop test' : 'Test'}
            </button>
            <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden" aria-label="Microphone level" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
              <div
                data-mic-level=""
                className={clsx('h-full rounded-full transition-[width] duration-75', level > 0.85 ? 'bg-red-500' : 'bg-green-500')}
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </div>
          {mic.error && isMicTestOn && (
            <p role="alert" className="text-xs text-amber-300 mt-2">
              {mic.error}
            </p>
          )}
        </div>

        <p className="text-xs text-neutral-500 leading-snug">
          The camera and microphone stay on this computer. Nothing is uploaded.
        </p>
      </div>
    </div>
  );
};

export default CameraPanel;
