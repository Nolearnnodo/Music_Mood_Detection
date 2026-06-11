import { Hand, MousePointerClick, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import {
  FACE_EMOTION_EMOJIS,
  FACE_EMOTION_LABELS,
  FACE_TO_MUSIC_MOOD
} from '../emotionMapping';

const EMOTIONS = [
  { label: 'happy', color: 'bg-amber-500', ring: 'ring-amber-400' },
  { label: 'sad', color: 'bg-blue-500', ring: 'ring-blue-400' },
  { label: 'angry', color: 'bg-red-500', ring: 'ring-red-400' },
  { label: 'surprised', color: 'bg-purple-500', ring: 'ring-purple-400' },
  { label: 'fearful', color: 'bg-slate-500', ring: 'ring-slate-400' },
  { label: 'disgusted', color: 'bg-green-600', ring: 'ring-green-400' },
  { label: 'neutral', color: 'bg-teal-500', ring: 'ring-teal-400' }
];

function buildScores(selectedLabel) {
  const scores = {};
  for (const e of EMOTIONS) {
    scores[e.label] = e.label === selectedLabel ? 0.99 : 0.01;
  }
  return scores;
}

function ManualEmotionSelector({ onSelect }) {
  const [activeLabel, setActiveLabel] = useState(null);

  const handleSelect = (label) => {
    const next = activeLabel === label ? null : label;
    setActiveLabel(next);
    if (next) {
      onSelect?.({
        label: next,
        confidence: 0.99,
        scores: buildScores(next),
        timestamp: Date.now(),
        source: 'manual'
      });
    } else {
      onSelect?.(null);
    }
  };

  return (
    <div className="bg-mood-card border border-mood-border rounded-xl shadow-lg p-4 mb-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Hand size={18} className="text-cyan-500 shrink-0" />
        <div>
          <div className="text-sm font-bold text-mood-text">手动选择情绪</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            无需摄像头，点击表情即可推荐
          </div>
        </div>
        {activeLabel && (
          <button
            onClick={() => handleSelect(activeLabel)}
            className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <RefreshCw size={12} /> 清除
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {EMOTIONS.map(({ label, color, ring }) => {
          const mood = FACE_TO_MUSIC_MOOD[label];
          const isActive = activeLabel === label;

          return (
            <button
              key={label}
              onClick={() => handleSelect(label)}
              title={mood?.description || ''}
              className={`
                flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all duration-200
                ${isActive
                  ? `border-current ring-2 ${ring} bg-slate-100 dark:bg-slate-800 scale-105`
                  : 'border-mood-border hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'
                }
              `}
            >
              <span className="text-2xl leading-none transition-transform duration-200">
                {FACE_EMOTION_EMOJIS[label]}
              </span>
              <span className="text-[10px] font-medium text-mood-text leading-tight">
                {FACE_EMOTION_LABELS[label]}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
            </button>
          );
        })}
      </div>

      {activeLabel && (
        <div className="flex items-center gap-2 text-[11px] text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2">
          <MousePointerClick size={14} />
          <span>
            已手动选择「{FACE_EMOTION_LABELS[activeLabel]}」,
            摄像头自动识别已暂停用于推荐。
          </span>
        </div>
      )}
    </div>
  );
}

export default ManualEmotionSelector;
