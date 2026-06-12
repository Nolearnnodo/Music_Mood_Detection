import { useLocation } from 'react-router-dom';

import Player from './Player';
import { useAppState } from '../contexts/AppStateContext';

// 在哪些路由上展示全局播放器(其余路由如设置页/上传页隐藏)
const VISIBLE_ROUTES = ['/radio', '/library', '/mood', '/chat', '/journal'];

function GlobalPlayer() {
  const { pathname } = useLocation();
  const visible = VISIBLE_ROUTES.some(r => pathname.startsWith(r)) || pathname === '/';

  const {
    selectedTrack,
    handlePlayerTrackChange,
    setCurrentTime,
    playlistRadius,
    setPlaylistRadius,
    appSettings,
    emotionPlaylist,
    emotionPlaylistVersion,
    emotionStartIndex,
    emotionPlaylistLabel,
    handlePlaylistExportFromPlayer,
    autoRefresh,
    handlePlaylistLow,
    skipSongTrigger,
    prevSongTrigger
  } = useAppState();

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))] max-h-[min(70vh,640px)] overflow-hidden">
      <Player
        selectedTrack={selectedTrack}
        onTrackChange={handlePlayerTrackChange}
        onPlaylistChange={() => {}}
        onExportPlaylist={handlePlaylistExportFromPlayer}
        onTimeUpdate={setCurrentTime}
        radius={playlistRadius}
        setRadius={setPlaylistRadius}
        appSettings={appSettings}
        externalPlaylist={emotionPlaylist}
        externalPlaylistVersion={emotionPlaylistVersion}
        externalStartIndex={emotionStartIndex}
        playlistLabel={emotionPlaylistLabel}
        autoRefresh={autoRefresh}
        onPlaylistLow={handlePlaylistLow}
        skipSongTrigger={skipSongTrigger}
        prevSongTrigger={prevSongTrigger}
      />
    </div>
  );
}

export default GlobalPlayer;
