import { Annotation, AudienceState, CameraSettings, ClipData } from '../types';

// What the audience saw at one moment of a clip
export interface PlaybackFrame {
  state: AudienceState;
  annotations: Annotation[];
  draft: Annotation | null;
  camera: CameraSettings;
}

/**
 * Replays a clip's timeline. `at(t)` returns the frame at `t` ms into the clip, the same object as
 * the last call when nothing changed in between (so React can skip a re-render). Moving forward
 * applies only the new events; moving back starts again from the clip's initial state.
 */
export class TimelineCursor {
  private next = 0;
  private lastT = -1;
  private frame: PlaybackFrame;

  constructor(private clip: ClipData) {
    this.frame = this.initialFrame();
  }

  private initialFrame(): PlaybackFrame {
    const { state, annotations, camera } = this.clip.initial;
    return { state, annotations, draft: null, camera };
  }

  at(t: number): PlaybackFrame {
    if (t < this.lastT) {
      this.next = 0;
      this.frame = this.initialFrame();
    }
    this.lastT = t;
    const events = this.clip.events;
    if (this.next >= events.length || events[this.next].t > t) return this.frame;

    let { state, annotations, draft, camera } = this.frame;
    while (this.next < events.length && events[this.next].t <= t) {
      const event = events[this.next++];
      switch (event.k) {
        case 's':
          state = { ...state, ...event.d };
          break;
        case 'a':
          annotations = event.d;
          break;
        case 'd':
          draft = event.d;
          break;
        case 'c':
          camera = event.d;
          break;
      }
    }
    this.frame = { state, annotations, draft, camera };
    return this.frame;
  }
}
