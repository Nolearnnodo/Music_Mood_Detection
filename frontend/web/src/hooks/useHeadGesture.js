import { useCallback, useRef, useState } from 'react';

const BUFFER_SIZE = 14;
const COOLDOWN_MS = 1500;
const RANGE_THRESHOLD = 0.025;
const DIR_CHANGE_MIN = 3;

function useHeadGesture({ onGesture } = {}) {
  const bufferRef = useRef([]);
  const lastGestureRef = useRef(0);
  const [gesture, setGesture] = useState(null);

  const feed = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 31) {
      bufferRef.current = [];
      return;
    }

    const noseTip = landmarks[30];
    const now = Date.now();
    bufferRef.current.push({ x: noseTip.x, y: noseTip.y, t: now });

    while (bufferRef.current.length > 1 && now - bufferRef.current[0].t > 2200) {
      bufferRef.current.shift();
    }
    if (bufferRef.current.length > BUFFER_SIZE) {
      bufferRef.current = bufferRef.current.slice(-BUFFER_SIZE);
    }

    if (bufferRef.current.length < 8) return;

    const n = bufferRef.current.length;
    const xs = bufferRef.current.map(p => p.x);
    const ys = bufferRef.current.map(p => p.y);

    const countDirChanges = (arr) => {
      let changes = 0;
      for (let i = 2; i < arr.length; i++) {
        const d1 = arr[i - 1] - arr[i - 2];
        const d2 = arr[i] - arr[i - 1];
        if (Math.abs(d1) > 0.002 && Math.abs(d2) > 0.002 && d1 * d2 < 0) {
          changes++;
        }
      }
      return changes;
    };

    const range = (arr) => {
      let mn = Infinity, mx = -Infinity;
      for (const v of arr) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      return mx - mn;
    };

    const xRange = range(xs);
    const yRange = range(ys);
    const xDirChanges = countDirChanges(xs);
    const yDirChanges = countDirChanges(ys);

    if (now - lastGestureRef.current < COOLDOWN_MS) return;

    if (xRange > RANGE_THRESHOLD && xDirChanges >= DIR_CHANGE_MIN) {
      lastGestureRef.current = now;
      setGesture('shake');
      onGesture?.('shake');
    } else if (yRange > RANGE_THRESHOLD && yDirChanges >= DIR_CHANGE_MIN && xRange < yRange * 1.5) {
      lastGestureRef.current = now;
      setGesture('nod');
      onGesture?.('nod');
    }
  }, [onGesture]);

  const resetGesture = useCallback(() => setGesture(null), []);

  return { feed, gesture, resetGesture };
}

export default useHeadGesture;
