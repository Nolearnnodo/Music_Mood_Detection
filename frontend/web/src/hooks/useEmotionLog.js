import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEY = 'mood_emotion_log';
const MAX_AGE_DAYS = 90;

function loadLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLogs(logs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    /* storage full, silently ignore */
  }
}

function pruneOld(logs) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 3600 * 1000;
  return logs.filter(e => e.timestamp >= cutoff);
}

function getDayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function getWeekKey(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

export function useEmotionLog() {
  const [logs, setLogs] = useState(() => pruneOld(loadLogs()));

  const addEntry = useCallback((entry) => {
    setLogs(prev => {
      const fresh = [{ timestamp: Date.now(), ...entry }, ...prev];
      const pruned = pruneOld(fresh);
      saveLogs(pruned);
      return pruned;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    saveLogs([]);
  }, []);

  const entriesByDay = useMemo(() => {
    const map = {};
    for (const e of logs) {
      const k = getDayKey(e.timestamp);
      if (!map[k]) map[k] = [];
      map[k].push(e);
    }
    return map;
  }, [logs]);

  const entriesByWeek = useMemo(() => {
    const map = {};
    for (const e of logs) {
      const k = getWeekKey(e.timestamp);
      if (!map[k]) map[k] = [];
      map[k].push(e);
    }
    return map;
  }, [logs]);

  const stats = useMemo(() => {
    if (!logs.length) return null;
    const countByEmo = {};
    let sumV = 0, sumA = 0, vCount = 0;
    for (const e of logs) {
      const label = e.emotion || 'unknown';
      countByEmo[label] = (countByEmo[label] || 0) + 1;
      if (e.valence !== undefined) { sumV += e.valence; vCount++; }
      if (e.arousal !== undefined) sumA += e.arousal;
    }
    const emoEntries = Object.entries(countByEmo).sort((a, b) => b[1] - a[1]);
    return {
      total: logs.length,
      topEmotion: emoEntries[0] || ['-', 0],
      distribution: emoEntries,
      avgValence: vCount ? (sumV / vCount) : 0,
      avgArousal: vCount ? (sumA / vCount) : 0
    };
  }, [logs]);

  return { logs, addEntry, clearLogs, stats, entriesByDay, entriesByWeek };
}
