import MoodChart from '../components/MoodChart';
import Player from '../components/Player';
import { useAppState } from '../contexts/AppStateContext';

function MoodPage() {
  const {
    tracks,
    currentTrack,
    trajectory,
    playlistRadius,
    setPlaylistRadius,
    playlistItems,
    currentTime,
    setCurrentTime,
    isDark,
    selectedTrack,
    appSettings,
    emotionPlaylist,
    emotionPlaylistVersion,
    emotionStartIndex,
    emotionPlaylistLabel,
    handleChartClick,
    handlePlayerTrackChange,
    handlePlaylistExportFromPlayer
  } = useAppState();

  return (
    <div className="p-4 md:p-6 h-full flex flex-col lg:flex-row gap-4 overflow-hidden">
      <div className="lg:w-80 shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
        <div className="bg-mood-card border border-mood-border rounded-xl p-4">
          <h2 className="text-sm font-bold text-mood-text mb-1">情绪图谱</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            点击散点查看歌曲细节并生成相似歌单。半径越大，推荐范围越广。
          </p>
        </div>
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
        />
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-center">
        <div className="w-full max-w-[80vh] aspect-square bg-mood-card rounded-2xl shadow-xl p-2 md:p-4 border border-mood-border flex flex-col">
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
    </div>
  );
}

export default MoodPage;
