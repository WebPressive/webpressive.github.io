// Turns mouse-wheel and trackpad scrolling into single slide steps.
// One gesture moves one slide: after a step, further wheel events are ignored until the wheel has been
// still for GESTURE_GAP_MS, so a trackpad's inertia or a fast spin does not skip several slides.

const STEP_THRESHOLD_PX = 40; // Scroll distance that counts as a step (one mouse notch is ~100 px)
const GESTURE_GAP_MS = 250; // Stillness that ends a gesture

export function createWheelStepper(onStep: (direction: 1 | -1) => void) {
  let accumulated = 0;
  let lastEventAt = 0;
  let locked = false;

  return (e: WheelEvent) => {
    const now = performance.now();
    const idle = now - lastEventAt;
    lastEventAt = now;
    if (idle > GESTURE_GAP_MS) {
      accumulated = 0;
      locked = false;
    }
    if (locked) return;
    // deltaMode 1 = lines, 2 = pages; normalise to pixels
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
    accumulated += e.deltaY * scale;
    if (Math.abs(accumulated) >= STEP_THRESHOLD_PX) {
      onStep(accumulated > 0 ? 1 : -1);
      accumulated = 0;
      locked = true;
    }
  };
}
