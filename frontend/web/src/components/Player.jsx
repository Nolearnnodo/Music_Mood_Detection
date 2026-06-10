import axios from 'axios';
import AudioPlayer from 'react-h5-audio-player';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  Activity, AlertCircle, Clock, Download,
  List, ListMusic, Music, Pause,
  Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX
} from 'lucide-react';

import 'react-h5-audio-player/lib/styles.css';
import '../player-theme.css';

function Player({ selectedTrack, onTrackChange, onPlaylistChange, onExportPlaylist, onTimeUpdate, radius, setRadius, appSettings }) {
  const playerRef = useRef(null);
  const activeTrackRef = useRef(null);

  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [fullTrackInfo, setFullTrackInfo] = useState(null);

  // 计算总时长
  const totalDuration = useMemo(() => {
    if (!playlist.length) return 0;
    return playlist.reduce((acc, curr) => acc + (curr.duration || 0), 0);
  }, [playlist]);

  const formatTotalDuration = seconds => {
    if (!seconds) return '0s';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  };

  useEffect(() => {
    if (selectedTrack) {
      setPlaylist([selectedTrack]);
      setCurrentIndex(0);
      setFullTrackInfo(selectedTrack); // 外部传入的一般已经是详情了
      setErrorMsg(null);
      if (playlist.length <= 1) setShowPlaylist(false);
      handlePreviewPlaylist(selectedTrack, radius);
    }
  }, [selectedTrack]);

  // 防抖监听 radius 变化，自动更新列表和时长
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentTrack)
        handlePreviewPlaylist(currentTrack, radius);
    }, 500); // 500ms 防抖
    return () => clearTimeout(timer);
  }, [radius]); // 依赖 radius

  useEffect(() => {
    if (showPlaylist && activeTrackRef.current) {
      activeTrackRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [currentIndex, showPlaylist]);

  const currentTrack = playlist[currentIndex];

  // 切歌时，如果当前歌曲只有简略信息，则去拉取详情
  useEffect(() => {
    if (!currentTrack) return;

    let isMounted = true;

    const loadDetail = async () => {
      // 如果已经有封面数据，说明是完整信息，直接用
      if (currentTrack.cover !== undefined || currentTrack.artist !== undefined) {
        setFullTrackInfo(currentTrack);
        onTrackChange?.(currentTrack);
        return;
      }

      // 否则是简略信息（来自歌单生成），需要懒加载
      // 先重置显示（保留标题防止闪烁，但清空封面）
      setFullTrackInfo({ ...currentTrack, cover: null, artist: 'Loading...' });

      try {
        const res = await axios.get(`/api/track/detail?id=${currentTrack.id}`);
        if (isMounted) {
          const detail = { ...currentTrack, ...res.data };
          setFullTrackInfo(detail);
          onTrackChange?.(detail); // 通知 App 更新高亮等
        }
      } catch (e) {
        console.error('Fetch detail failed', e);
        if (isMounted) setFullTrackInfo(currentTrack);
      }
    };

    loadDetail();

    return () => { isMounted = false; };
  }, [currentTrack]); // 依赖 currentTrack (主要是引用变化或 ID 变化)

  // Media Session API 更新 (依赖 fullTrackInfo)
  useEffect(() => {
    if (!fullTrackInfo) return;

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: fullTrackInfo.title || 'Unknown Title',
        artist: fullTrackInfo.artist || 'Unknown Artist',
        album: fullTrackInfo.album || 'Unknown Album',
        artwork: fullTrackInfo.cover ? [{ src: fullTrackInfo.cover, sizes: '512x512', type: 'image/jpeg' }] : []
      });

      navigator.mediaSession.setActionHandler('play', () => playerRef.current?.audio.current.play());
      navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.audio.current.pause());
      navigator.mediaSession.setActionHandler('previoustrack', handleClickPrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleClickNext);
    }
  }, [fullTrackInfo]);

  const handlePreviewPlaylist = async (track = currentTrack, r = radius) => {
    if (!track) return;
    try {
      setErrorMsg(null);

      const params = {
        seed_id: track.id,
        r,
        format: 'json',
        limit: appSettings.limit // 全局设置
      };
      if (appSettings.durationLimit > 0)
        params.duration_limit = appSettings.durationLimit;

      const res = await axios.get('/api/playlist/generate', { params });

      if (res.data && res.data.length > 0) {
        setPlaylist(res.data);
        onPlaylistChange?.(res.data);
        setCurrentIndex(0);
        setShowPlaylist(true);
      } else {
        alert('该范围内没有找到其他歌曲');
      }
    } catch (e) {
      console.error(e);
      alert('生成预览失败');
    }
  };

  const handleManualGenerate = () => {
    handlePreviewPlaylist(currentTrack, radius);
    setShowPlaylist(true);
  };

  const handleClickNext = () => {
    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setErrorMsg(null);
    }
  };

  const handleClickPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setErrorMsg(null);
    }
  };

  const handleJumpTo = index => {
    setCurrentIndex(index);
    setErrorMsg(null);
  };

  const handleEnded = () => {
    if (currentIndex < playlist.length - 1)
      setCurrentIndex(prev => prev + 1);
  };

  const handleError = () => {
    if (currentTrack)
      setErrorMsg(`无法播放: ${currentTrack.title}`);
  };

  const handleListen = e => {
    const time = e.target.currentTime;
    if (onTimeUpdate) onTimeUpdate(time);
  };

  // 渲染时使用 fullTrackInfo，如果还没加载出来，降级使用 currentTrack
  const displayTrack = fullTrackInfo || currentTrack;

  if (!displayTrack) {
    return (
      <div
        className="bg-mood-card p-6 rounded-xl text-slate-500 text-center border border-mood-border flex flex-col gap-2 items-center justify-center min-h-[180px]">
        <Activity className="opacity-50" size={32}/>
        <span className="text-sm">点击图表上的点开始播放</span>
      </div>
    );
  }

  return (
    <div
      className="bg-mood-card p-4 rounded-xl shadow-lg border border-mood-border flex flex-col gap-4 relative transition-all duration-300">

      {/* 封面与信息 */}
      <div className="flex gap-3 items-center px-1">
        <div className="w-12 h-12 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 border border-mood-border relative">
          {displayTrack.cover ? (
            <img src={displayTrack.cover} alt="cover" className="w-full h-full object-cover animate-in fade-in duration-300"/>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Music size={20}/>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <h3 className="text-sm font-bold text-mood-text truncate" title={displayTrack.title}>
            {displayTrack.title || '未知曲目'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {displayTrack.artist || 'Unknown Artist'}
          </p>
        </div>
      </div>

      {/* 情绪数值 */}
      <div className="flex justify-between items-center text-[10px] text-slate-400 px-1">
        <div className="flex gap-2">
          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1 border border-transparent dark:border-slate-700">
            V: <span className={displayTrack.v >= 5 ? 'text-pink-500' : 'text-blue-500'}>{displayTrack.v?.toFixed(1)}</span>
          </span>
          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1 border border-transparent dark:border-slate-700">
            A: <span className={displayTrack.a >= 5 ? 'text-orange-500' : 'text-emerald-500'}>{displayTrack.a?.toFixed(1)}</span>
          </span>
        </div>

        <div className="flex gap-2">
          {playlist.length > 1 && (
            <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[9px] font-mono">
              <Clock size={10}/> {formatTotalDuration(totalDuration)}
            </span>
          )}
          {playlist.length > 1 && (
            <button
              onClick={() => setShowPlaylist(!showPlaylist)}
              className={`
                    flex items-center gap-1 px-2 py-0.5 rounded transition-all
                    ${showPlaylist
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold'
              : 'text-slate-500 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800'}
                `}
            >
              <List size={12}/>
              <span>{currentIndex + 1} / {playlist.length}</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-2 rounded flex items-center gap-2">
          <AlertCircle size={12}/> {errorMsg}
        </div>
      )}

      {/* 播放器组件 */}
      <div className="custom-audio-player-wrapper">
        <AudioPlayer
          ref={playerRef}
          autoPlay
          // 始终使用当前 track ID
          src={`/api/stream?id=${currentTrack.id}`}
          onListen={handleListen}
          listenInterval={200}
          onPlayError={handleError}
          showSkipControls={true}
          showJumpControls={false}
          onClickNext={handleClickNext}
          onClickPrevious={handleClickPrev}
          onEnded={handleEnded}
          customIcons={{
            play: <Play fill="currentColor" size={24}/>,
            pause: <Pause fill="currentColor" size={24}/>,
            previous: <SkipBack size={20} className={currentIndex === 0 ? 'opacity-30' : ''}/>,
            next: <SkipForward size={20} className={currentIndex === playlist.length - 1 ? 'opacity-30' : ''}/>,
            volume: <Volume2 size={20}/>,
            volumeMute: <VolumeX size={20}/>,
            loop: <Repeat size={18}/>
          }}
          customProgressBarSection={['CURRENT_TIME', 'PROGRESS_BAR', 'DURATION']}
          customControlsSection={['MAIN_CONTROLS', 'VOLUME_CONTROLS']}
          className="!bg-transparent !shadow-none !p-0"
        />
      </div>

      {/* 播放列表 */}
      {showPlaylist && playlist.length > 0 && (
        <div
          className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-1 border border-mood-border animate-in slide-in-from-top-2 duration-200">
          <div className="max-h-60 overflow-y-auto custom-scrollbar pr-1">
            {playlist.map((track, idx) => (
              <div
                key={track.id}
                ref={idx === currentIndex ? activeTrackRef : null}
                onClick={() => handleJumpTo(idx)}
                className={`
                    text-xs p-2 rounded cursor-pointer flex justify-between items-center mb-1 last:mb-0 transition-colors group
                    ${idx === currentIndex
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'}
                `}
              >
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  {idx === currentIndex && <Activity size={10} className="animate-pulse shrink-0"/>}
                  <span className="truncate font-medium">
                    {idx + 1}. {track.title || track.filepath}
                  </span>
                </div>
                <div
                  className={`flex gap-2 text-[9px] font-mono shrink-0 ${idx === currentIndex ? 'opacity-90' : 'opacity-0 group-hover:opacity-60'}`}>
                  <span>{Math.floor(track.duration / 60)}:{Math.floor(track.duration % 60).toString().padStart(2, '0')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底部控制区域 */}
      <div className="border-t border-mood-border pt-3 mt-1">
        <div className="flex justify-between items-center mb-2 px-1">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Similarity Radius</span>
          <span className="text-xs font-mono text-mood-text">{radius.toFixed(1)}</span>
        </div>
        <input
          type="range" min="0.1" max="4.0" step="0.1"
          value={radius}
          onChange={e => setRadius(Number.parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer mb-4 accent-blue-500"
        />

        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={handleManualGenerate}
            className="col-span-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-mood-text border border-mood-border text-xs py-2 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
          >
            <ListMusic size={14} className="text-blue-500"/> 生成相似歌单
          </button>

          <button
            onClick={() => onExportPlaylist(displayTrack, radius, 'm3u')}
            className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
          >
            <Download size={14}/> M3U
          </button>

          <button
            onClick={() => onExportPlaylist(displayTrack, radius, 'pls')}
            className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-mood-text text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
          >
            PLS
          </button>

          <button
            onClick={() => onExportPlaylist(displayTrack, radius, 'txt')}
            className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-mood-text text-xs py-2 rounded-lg flex items-center justify-center gap-1 transition-colors"
          >
            TXT
          </button>
        </div>
      </div>
    </div>
  );
}

export default Player;
