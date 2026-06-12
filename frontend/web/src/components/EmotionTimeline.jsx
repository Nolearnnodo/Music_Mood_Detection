import { Bar } from 'react-chartjs-2';
import { useMemo } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip
} from 'chart.js';
import { BarChart3, Calendar, Clock, Smile, Trash2 } from 'lucide-react';

import {
  FACE_EMOTION_EMOJIS,
  FACE_EMOTION_LABELS
} from '../emotionMapping';

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, Title, Tooltip, Legend);

const EMOTION_COLORS = {
  happy: 'rgba(251, 191, 36, 0.85)',
  sad: 'rgba(59, 130, 246, 0.8)',
  angry: 'rgba(239, 68, 68, 0.8)',
  surprised: 'rgba(168, 85, 247, 0.8)',
  fearful: 'rgba(100, 116, 139, 0.8)',
  disgusted: 'rgba(22, 163, 74, 0.8)',
  neutral: 'rgba(20, 184, 166, 0.8)'
};

const LABELS = Object.keys(EMOTION_COLORS);

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(5, 10));
  }
  return days;
}

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(5, 10);
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function EmotionTimeline({ logs, stats, onClear }) {
  const dayLabels = useMemo(() => lastNDays(7), []);

  const chartData = useMemo(() => {
    const dayMap = {};
    for (const d of dayLabels) dayMap[d] = {};

    for (const e of logs) {
      const k = dayKey(e.timestamp);
      if (!dayMap[k]) continue;
      dayMap[k][e.emotion] = (dayMap[k][e.emotion] || 0) + 1;
    }

    return {
      labels: dayLabels,
      datasets: LABELS.map(label => ({
        label: FACE_EMOTION_LABELS[label] || label,
        data: dayLabels.map(d => dayMap[d][label] || 0),
        backgroundColor: EMOTION_COLORS[label],
        borderRadius: 4,
        borderWidth: 0
      }))
    };
  }, [logs, dayLabels]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        ticks: { color: '#94a3b8', font: { size: 10 } },
        grid: { display: false }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { stepSize: 1, color: '#94a3b8', font: { size: 10 } },
        grid: { color: 'rgba(148,163,184,0.12)' }
      }
    },
    plugins: {
      legend: {
        labels: {
          boxWidth: 10,
          padding: 8,
          font: { size: 10 },
          color: '#94a3b8',
          usePointStyle: true
        }
      },
      tooltip: { mode: 'index' }
    }
  }), []);

  const recent = useMemo(() => logs.slice(0, 12), [logs]);

  if (!logs.length) {
    return (
      <div className="bg-mood-card border border-mood-border rounded-xl shadow-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={18} className="text-purple-500 shrink-0" />
          <div className="text-sm font-bold text-mood-text">心情日记</div>
        </div>
        <div className="text-center py-6 text-xs text-slate-400">
          <Smile size={28} className="mx-auto mb-2 opacity-40" />
          暂无记录。开启摄像头或手动选择情绪并生成推荐后，心情记录会自动保存。
        </div>
      </div>
    );
  }

  return (
    <div className="bg-mood-card border border-mood-border rounded-xl shadow-lg p-4 mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-purple-500 shrink-0" />
          <div>
            <div className="text-sm font-bold text-mood-text">心情日记</div>
            <div className="text-[10px] text-slate-400">{stats?.total || 0} 条记录</div>
          </div>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="清除记录"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-2 text-center">
            <div className="text-lg leading-none">{FACE_EMOTION_EMOJIS[stats.topEmotion[0]]}</div>
            <div className="text-mood-text font-medium">{FACE_EMOTION_LABELS[stats.topEmotion[0]]}</div>
            <div className="text-[10px] text-slate-400">最多情绪</div>
          </div>
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-2 text-center">
            <div className="text-lg leading-none font-mono text-emerald-500">{stats.avgValence.toFixed(1)}</div>
            <div className="text-mood-text font-medium">平均V</div>
            <div className="text-[10px] text-slate-400">Valence</div>
          </div>
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-2 text-center">
            <div className="text-lg leading-none font-mono text-orange-400">{stats.avgArousal.toFixed(1)}</div>
            <div className="text-mood-text font-medium">平均A</div>
            <div className="text-[10px] text-slate-400">Arousal</div>
          </div>
        </div>
      )}

      <div className="h-36">
        <Bar data={chartData} options={chartOptions} />
      </div>

      <div className="max-h-36 overflow-y-auto custom-scrollbar border-t border-mood-border pt-2">
        <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
          <Clock size={10} /> 最近记录
        </div>
        {recent.map((entry, idx) => (
          <div key={`${entry.timestamp}-${idx}`}
            className="flex items-center gap-2 py-1 border-b border-mood-border/30 last:border-b-0 text-[11px]">
            <span className="w-10 text-slate-400 shrink-0">{formatTime(entry.timestamp)}</span>
            <span className="text-base leading-none">{FACE_EMOTION_EMOJIS[entry.emotion]}</span>
            <span className="text-mood-text">{FACE_EMOTION_LABELS[entry.emotion]}</span>
            {entry.source === 'manual' && (
              <span className="text-[9px] text-cyan-500 bg-cyan-500/10 px-1 rounded">手动</span>
            )}
            <span className="ml-auto text-slate-400 font-mono text-[10px]">
              V{entry.valence?.toFixed(1)} A{entry.arousal?.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default EmotionTimeline;
