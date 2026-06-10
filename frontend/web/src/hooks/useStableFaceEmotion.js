import { useEffect, useMemo, useState } from 'react';

export function useStableFaceEmotion(faceEmotion, options = {}) {
  const {
    minConfidence = 0.45,
    stableMs = 1600
  } = options;

  const [candidate, setCandidate] = useState(null);
  const [stableEmotion, setStableEmotion] = useState(null);

  useEffect(() => {
    if (!faceEmotion?.label || faceEmotion.confidence < minConfidence) return;

    setCandidate(prev => {
      if (prev?.label === faceEmotion.label) {
        return {
          ...prev,
          latest: faceEmotion,
          seenAt: Date.now()
        };
      }

      return {
        label: faceEmotion.label,
        firstSeenAt: Date.now(),
        seenAt: Date.now(),
        latest: faceEmotion
      };
    });
  }, [faceEmotion, minConfidence]);

  useEffect(() => {
    if (!candidate) return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const oldEnough = now - candidate.firstSeenAt >= stableMs;
      const stillFresh = now - candidate.seenAt <= Math.max(900, stableMs);

      if (oldEnough && stillFresh) {
        setStableEmotion(prev => {
          if (prev?.label === candidate.label && prev?.timestamp === candidate.latest.timestamp) return prev;
          return candidate.latest;
        });
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [candidate, stableMs]);

  return useMemo(() => ({
    stableEmotion,
    candidate,
    isStable: Boolean(stableEmotion)
  }), [candidate, stableEmotion]);
}
