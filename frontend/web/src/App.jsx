import axios from 'axios';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Laptop, Moon, Music, Sun } from 'lucide-react';

import Player from './components/Player';
import MoodChart from './components/MoodChart';
import ControlPanel from './components/ControlPanel';
import SettingsModal from './components/SettingsModal';
import EmotionCamera from './components/EmotionCamera';
import EmotionRadioPanel from './components/EmotionRadioPanel';

function handleDownloadPlaylist(url) {
  window.open(url, '_blank');
}

function App() {
  const [tracks, setTracks] = useState([]);
  const [scanStatus, setScanStatus] = useState({ done: 0, failed: 0, total: 0, percentage: 0, readOnly: false });
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [trajectory, setTrajectory] = useState([]);

  // App Config
  const [appSettings, setAppSettings] = useState(() => {
    const saved = localStorage.getItem('mood_settings');
    return saved ? JSON.parse(saved) : { limit: 50, durationLimit: 0, defaultRadius: 0.6 };
  });

  const [playlistRadius, setPlaylistRadius] = useState(appSettings.defaultRadius);
  const [showSettings, setShowSettings] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [playlistItems, setPlaylistItems] = useState([]);
  const [faceEmotion, setFaceEmotion] = useState(null);
  const [emotionPlaylist, setEmotionPlaylist] = useState([]);
  const [emotionPlaylistVersion, setEmotionPlaylistVersion] = useState(0);
  const [emotionStartIndex, setEmotionStartIndex] = useState(0);
  const [isEmotionLoading, setIsEmotionLoading] = useState(false);
  const [emotionPlaylistLabel, setEmotionPlaylistLabel] = useState('情绪推荐歌单');

  const isScanningRef = useRef(false);
  const [isScanningUI, setIsScanningUI] = useState(false);

  const sseRef = useRef(null);

  // --- 主题管理逻辑 ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');
  const [isDark, setIsDark] = useState(true);

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

      // 扫描结束条件：成功+失败 >= 总数
      if ((data.done + data.failed) < data.total) {
        isScanningRef.current = true;
        setIsScanningUI(true);
      } else {
        // 扫描结束
        if (isScanningRef.current) {
          isScanningRef.current = false;
          // 扫描结束后仍然显示进度条（通过手动切换）
          fetchTracks();
        }
        // 停止 SSE
        if (data.total > 0 && (data.done + data.failed) >= data.total) {
          evtSource.close();
          sseRef.current = null;
          isScanningRef.current = false;
        }
      }
    });
  }, [fetchTracks]);

  // 初始化加载
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
    if (!track) return; // 安全检查

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
    if (track && track.trajectory)
      setTrajectory(track.trajectory);
    else
      setTrajectory([]);
  };

  const handleExportPreset = params => {
    const searchParams = new URLSearchParams();
    Object.keys(params).forEach(key => searchParams.append(key, params[key]));

    searchParams.append('limit', appSettings.limit);
    if (appSettings.durationLimit > 0)
      searchParams.append('duration_limit', appSettings.durationLimit);

    searchParams.append('format', 'm3u');
    const url = `/api/playlist/generate?${searchParams.toString()}`;
    handleDownloadPlaylist(url);
  };

  const handlePlaylistExportFromPlayer = (track, r, format) => {
    const searchParams = new URLSearchParams();
    searchParams.append('seed_id', track.id);
    searchParams.append('r', r);
    searchParams.append('format', format);
    searchParams.append('limit', appSettings.limit);
    if (appSettings.durationLimit > 0)
      searchParams.append('duration_limit', appSettings.durationLimit);

    const url = `/api/playlist/generate?${searchParams.toString()}`;
    handleDownloadPlaylist(url);
  };

  const handlePlaylistGenerated = list => {
    setPlaylistItems(list);
  };

  const handleEmotionGenerate = async ({ faceEmotion: stableEmotion, moodTarget, strategy }) => {
    if (!stableEmotion || !moodTarget) return;

    setIsEmotionLoading(true);
    try {
      const params = {
        v: moodTarget.v,
        a: moodTarget.a,
        r: moodTarget.radius || playlistRadius,
        format: 'json',
        limit: appSettings.limit
      };

      if (appSettings.durationLimit > 0)
        params.duration_limit = appSettings.durationLimit;

      const res = await axios.get('/api/playlist/generate', { params });
      const list = Array.isArray(res.data) ? res.data : [];

      setEmotionPlaylist(list);
      setPlaylistItems(list);
      setPlaylistRadius(moodTarget.radius || playlistRadius);
      setEmotionPlaylistLabel(`${moodTarget.title || '情绪推荐'} · ${strategy === 'comfort' ? '安抚' : '匹配'}`);

      if (list.length > 0) {
        setEmotionStartIndex(0);
        setEmotionPlaylistVersion(v => v + 1);
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

  return (
    <div className="h-screen bg-mood-bg text-mood-text p-4 md:p-6 font-sans flex flex-col md:flex-row gap-6 overflow-hidden transition-colors duration-300">

      <div className="w-full md:w-80 lg:w-96 flex flex-col shrink-0 h-full overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Music className="text-blue-500"/> Mood AI Player
          </h1>
          <button onClick={toggleTheme}
            className="p-2 rounded-full bg-mood-card border border-mood-border hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            {theme === 'light' && <Sun size={18}/>}
            {theme === 'dark' && <Moon size={18}/>}
            {theme === 'system' && <Laptop size={18}/>}
          </button>
        </div>

        <ControlPanel
          onAddFolder={handleAddFolder}
          scanStatus={scanStatus}
          onExport={handleExportPreset}
          onOpenSettings={() => setShowSettings(true)}
          readOnly={scanStatus.readOnly}
          isScanning={isScanningUI} // 传递 UI 状态
        />

        <EmotionCamera onEmotion={setFaceEmotion}/>

        <EmotionRadioPanel
          faceEmotion={faceEmotion}
          onGenerate={handleEmotionGenerate}
          onPlay={handleEmotionPlay}
          playlist={emotionPlaylist}
          loading={isEmotionLoading}
          tracksReady={tracks.length > 0}
        />

        <Player
          selectedTrack={selectedTrack}
          onTrackChange={handlePlayerTrackChange}
          onPlaylistChange={handlePlaylistGenerated}
          onExportPlaylist={handlePlaylistExportFromPlayer}
          onTimeUpdate={setCurrentTime}
          radius={playlistRadius}
          setRadius={setPlaylistRadius}
          appSettings={appSettings}
          externalPlaylist={emotionPlaylist}
          externalPlaylistVersion={emotionPlaylistVersion}
          externalStartIndex={emotionStartIndex}
          playlistLabel={emotionPlaylistLabel}
        />

        <div className="mt-auto pt-4 opacity-60 text-[10px] text-center shrink-0">
          Local Library Emotion Analysis {scanStatus.readOnly && '(Read-Only)'}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center min-w-0 min-h-0 relative">
        <div className="w-full max-w-[85vh] aspect-square bg-mood-card rounded-2xl shadow-xl p-2 md:p-4 border border-mood-border relative flex flex-col transition-colors duration-300">
          <div className="flex-1 relative w-full h-full min-h-0">
            <MoodChart
              tracks={tracks}
              selectedTrack={currentTrack}
              trajectory={trajectory}
              playlistRadius={playlistRadius}
              playlistItems={playlistItems}
              currentTime={currentTime}
              onPointClick={handleChartClick}
              isDark={isDark}
            />
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          initialSettings={appSettings}
        />
      )}
    </div>
  );
}

export default App;
