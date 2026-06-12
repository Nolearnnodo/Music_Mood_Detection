import { NotebookText, Trash2 } from 'lucide-react';

import EmotionTimeline from '../components/EmotionTimeline';
import { useAppState } from '../contexts/AppStateContext';

function JournalPage() {
  const { emotionLogs, emotionStats, clearEmotionLogs } = useAppState();

  const handleClear = () => {
    if (window.confirm('确定清空所有心情日志?该操作不可恢复。')) {
      clearEmotionLogs();
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col gap-4 pb-32">
      <div className="bg-mood-card border border-mood-border rounded-xl p-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <NotebookText size={18} className="text-purple-500"/>
            <h1 className="text-lg font-bold text-mood-text">心情日志</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            自动记录所有触发推荐的情绪状态。数据仅保存在本地浏览器,90 天自动清理。
          </p>
        </div>
        {emotionLogs.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs px-3 py-1.5 rounded-md border border-mood-border text-mood-text hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/40 flex items-center gap-1 shrink-0"
          >
            <Trash2 size={12}/> 清空
          </button>
        )}
      </div>

      <EmotionTimeline
        logs={emotionLogs}
        stats={emotionStats}
        onClear={handleClear}
      />
    </div>
  );
}

export default JournalPage;
