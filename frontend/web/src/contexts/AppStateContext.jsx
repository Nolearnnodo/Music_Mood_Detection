import axios from 'axios';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [tracks, setTracks] = useState([]);
  const [scanStatus, setScanStatus] = useState({ done: 0, failed: 0, total: 0, percentage: 0, readOnly: false });
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [trajectory, setTrajectory] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playlistItems, setPlaylistItems] = useState([]);

  const [faceEmotion, setFaceEmotion] = useState(null);
  const [emotionPlaylist, setEmotionPlaylist] = useState([]);
  const [emotionPlaylistVersion, setEmotionPlaylistVersion] = useState(0);
  const [emotionStartIndex, setEmotionStartIndex] = useState(0);
  const [isEmotionLoading, setIsEmotionLoading] = useState(false);
  const [emotionPlaylistLabel, setEmotionPlaylistLabel] = useState('情绪推荐歌单');

  const [appSettings, setAppSettings] = useState(() => {
    const saved = localStorage.getItem('mood_settings');
    return saved ? JSON.parse(saved) : { limit: 50, durationLimit: 0, defaultRadius: 0.6 };
  });
  const [playlistRadius, setPlaylistRadius] = useState(appSettings.defaultRadius);

  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
  const [isDark, setIsDark] = useState(true);

  const isScanningRef = useRef(false);
  const [isScanningUI, setIsScanningUI] = useState(false);
  const sseRef = useRef(null);

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const systemDark = mediaQuery.matches;
      const shouldBeDark = theme === 'dark' || (theme === 'system' && systemDark);
      setIsDark(shouldBeDark);
      root.classList.toggle('dark', shouldBeDark);
    };
    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'system' ? 'dark' : (theme === 'dark' ? 'light' : 'system');
    setTheme(next);
    localStorage.setItem('theme', next);
  };

  const handleSaveSettings = newSettings => {
    setAppSettings(newSettings);
    setPlaylistRadius(newSettings.defaultRadius);
    localStorage.setItem('mood_settings', JSON.stringify(newSettings));
  };

  const fetchTracks = useCallback(async () => {
    try {
      const tRes = await axios.get('/api/tracks');
      setTracks(tRes.data);
      const sRes = await axios.get('/api/status');
      setScanStatus(sRes.data);
      return sRes.data;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, []);

  const startSSE = useCallback(() => {
    if (sseRef.current) return;
    const evtSource = new EventSource('/api/events');
    sseRef.current = evtSource;

    evtSource.addEventListener('progress', e => {
      const data = JSON.parse(e.data);
      setScanStatus(prev => ({ ...data, readOnly: prev.readOnly }));

      if ((data.done + data.failed) < data.total) {
        isScanningRef.current = true;
        setIsScanningUI(true);
      } else {
        if (isScanningRef.current) {
          isScanningRef.current = false;
          fetchTracks();
        }
        if (data.total > 0 && (data.done + data.failed) >= data.total) {
          evtSource.close();
          sseRef.current = null;
          isScanningRef.current = false;
          setIsScanningUI(false);
        }
      }
    });
  }, [fetchTracks]);

  useEffect(() => {
    let isMounted = true;
    fetchTracks().then(data => {
      if (isMounted && data && (data.done + data.failed) < data.total) {
        isScanningRef.current = true;
        setIsScanningUI(true);
        startSSE();
      }
    });
    return () => {
      isMounted = false;
      if (sseRef.current) sseRef.current.close();
    };
  }, [fetchTracks, startSSE]);

  const handleAddFolder = async path => {
    try {
      await axios.post('/api/config/folders', { path });
      isScanningRef.current = true;
      setIsScanningUI(true);
      startSSE();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleChartClick = async index => {
    const track = tracks[index];
    if (!track) return;
    try {
      const res = await axios.get(`/api/track/detail?id=${track.id}`);
      const detail = {
        ...track,
        ...res.data,
        v: res.data.v || track.v,
        a: res.data.a || track.a,
        trajectory: res.data.trajectory || []
      };
      setSelectedTrack(detail);
      setCurrentTrack(detail);
      setTrajectory(detail.trajectory || []);
      setPlaylistRadius(appSettings.defaultRadius);
      setPlaylistItems([]);
      setCurrentTime(0);
    } catch (e) {
      console.error('Failed to load details', e);
      setSelectedTrack(track);
      setCurrentTrack(track);
      setTrajectory([]);
      setPlaylistItems([]);
    }
  };

  const handlePlayerTrackChange = track => {
    setCurrentTrack(track);
    setTrajectory(track && track.trajectory ? track.trajectory : []);
  };

  const handleExportPreset = params => {
    const searchParams = new URLSearchParams();
    Object.keys(params).forEach(key => searchParams.append(key, params[key]));
    searchParams.append('limit', appSettings.limit);
    if (appSettings.durationLimit > 0)
      searchParams.append('duration_limit', appSettings.durationLimit);
    searchParams.append('format', 'm3u');
    window.open(`/api/playlist/generate?${searchParams.toString()}`, '_blank');
  };

  const handlePlaylistExportFromPlayer = (track, r, format) => {
    const searchParams = new URLSearchParams();
    searchParams.append('seed_id', track.id);
    searchParams.append('r', r);
    searchParams.append('format', format);
    searchParams.append('limit', appSettings.limit);
    if (appSettings.durationLimit > 0)
      searchParams.append('duration_limit', appSettings.durationLimit);
    window.open(`/api/playlist/generate?${searchParams.toString()}`, '_blank');
  };

  const handleEmotionGenerate = async ({ faceEmotion: stableEmotion, moodTarget, strategy }) => {
    if (!stableEmotion || !moodTarget) return;
    setIsEmotionLoading(true);
    try {
      const baseR = moodTarget.radius || playlistRadius;
      const radiusSteps = [baseR, baseR * 1.5, baseR * 2.5, baseR * 4];
      let list = [];
      let usedRadius = baseR;

      for (const r of radiusSteps) {
        const params = {
          v: moodTarget.v,
          a: moodTarget.a,
          r,
          format: 'json',
          limit: appSettings.limit
        };
        if (appSettings.durationLimit > 0)
          params.duration_limit = appSettings.durationLimit;

        const res = await axios.get('/api/playlist/generate', { params });
        const tmp = Array.isArray(res.data) ? res.data : [];
        if (tmp.length > 0) {
          list = tmp;
          usedRadius = r;
          break;
        }
      }

      setEmotionPlaylist(list);
      setPlaylistItems(list);
      setPlaylistRadius(usedRadius);
      const expanded = usedRadius > baseR + 0.01 ? `（已扩大到 r=${usedRadius.toFixed(1)}）` : '';
      setEmotionPlaylistLabel(`${moodTarget.title || '情绪推荐'} · ${strategy === 'comfort' ? '安抚' : '匹配'}${expanded}`);

      if (list.length > 0) {
        setEmotionStartIndex(0);
        setEmotionPlaylistVersion(v => v + 1);
      } else {
        alert('库里没有匹配的歌曲，试试更换情绪或在 /mood 页面手动挑选。');
      }
    } catch (e) {
      console.error('Emotion playlist failed', e);
      alert('情绪推荐失败，请确认音乐库已经完成分析');
    } finally {
      setIsEmotionLoading(false);
    }
  };

  const handleEmotionPlay = (index = 0) => {
    if (!emotionPlaylist.length) return;
    const startIndex = typeof index === 'number' ? index : 0;
    setEmotionStartIndex(startIndex);
    setEmotionPlaylistVersion(v => v + 1);
    setPlaylistItems(emotionPlaylist);
  };

  const value = {
    tracks, scanStatus, selectedTrack, currentTrack, trajectory, currentTime, setCurrentTime,
    playlistItems, faceEmotion, setFaceEmotion,
    emotionPlaylist, emotionPlaylistVersion, emotionStartIndex,
    isEmotionLoading, emotionPlaylistLabel,
    appSettings, playlistRadius, setPlaylistRadius,
    theme, isDark, toggleTheme,
    isScanningUI,
    handleSaveSettings, handleAddFolder, handleChartClick,
    handlePlayerTrackChange, handleExportPreset, handlePlaylistExportFromPlayer,
    handleEmotionGenerate, handleEmotionPlay,
    fetchTracks, refreshScanStatus: startSSE
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
