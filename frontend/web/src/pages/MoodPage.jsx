import MoodChart from '../components/MoodChart';
import { useAppState } from '../contexts/AppStateContext';

function MoodPage() {
  const {
    tracks,
    currentTrack,
    trajectory,
    playlistRadius,
    playlistItems,
    currentTime,
    isDark,
    handleChartClick
  } = useAppState();

  return (
    <div className="p-4 md:p-6 h-full flex flex-col gap-3 overflow-hidden">
      <div className="bg-mood-card border border-mood-border rounded-xl px-4 py-2 shrink-0">
        <h2 className="text-sm font-bold text-mood-text">情绪图谱</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          点击散点查看歌曲细节并生成相似歌单。播放器在右下浮窗中。
        </p>
      </div>

      <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
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
