import { Brain, ListMusic, Loader2, Play, Radio, RefreshCcw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getFaceEmotionEmoji,
  getFaceEmotionLabel,
  getMoodTarget
} from '../emotionMapping';
import { useStableFaceEmotion } from '../hooks/useStableFaceEmotion';

function EmotionRadioPanel({
  faceEmotion,
  manualEmotion,
  autoRefresh,
  onAutoRefreshChange,
  onGenerate,
  onPlay,
  onStableChange,
  playlist,
  loading,
  tracksReady
}) {
  const [strategy, setStrategy] = useState('match');
  const { stableEmotion: camStable, candidate } = useStableFaceEmotion(faceEmotion);

  const stableEmotion = manualEmotion || camStable;

  const lastStableLabelRef = useRef(null);

  useEffect(() => {
    if (!camStable?.label) return;
    if (manualEmotion) return;
    if (camStable.label === lastStableLabelRef.current) return;
    lastStableLabelRef.current = camStable.label;

    const target = getMoodTarget(camStable.label, strategy);
    onStableChange?.({
      emotion: camStable.label,
      confidence: camStable.confidence,
      source: 'camera',
      valence: target.v,
      arousal: target.a,
      strategy
    });
  }, [camStable, manualEmotion, strategy, onStableChange]);

  const moodTarget = useMemo(() => {
    if (!stableEmotion?.label) return null;
    return getMoodTarget(stableEmotion.label, strategy);
  }, [stableEmotion, strategy]);

  const handleGenerate = () => {
    if (!stableEmotion || !moodTarget) return;
    onGenerate?.({ faceEmotion: stableEmotion, moodTarget, strategy });
  };

  const currentLabel = stableEmotion?.label || candidate?.label || faceEmotion?.label;
  const confidence = stableEmotion?.confidence || candidate?.latest?.confidence || faceEmotion?.confidence || 0;

  return (
    <div className="glass border border-mood-border rounded-xl shadow-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-mood-accent transition-colors duration-500"/>
          <div>
            <div className="text-sm font-bold text-mood-text">情绪音乐电台</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              根据表情推荐本地歌单
            </div>
          </div>
        </div>
        <div className="text-2xl leading-none">{getFaceEmotionEmoji(currentLabel)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <button
          onClick={() => setStrategy('match')}
          aria-pressed={strategy === 'match'}
          className={`rounded-lg px-3 py-2 border transition-all duration-300 ${
            strategy === 'match'
              ? 'bg-mood-accent text-mood-accent-on border-mood-accent shadow-[0_0_18px_-4px_var(--mood-accent-glow)]'
              : 'bg-slate-100/60 dark:bg-slate-800/60 border-mood-border text-mood-text hover:bg-mood-accent-soft'
          }`}
        >
          匹配心情
        </button>
        <button
          onClick={() => setStrategy('comfort')}
          aria-pressed={strategy === 'comfort'}
          className={`rounded-lg px-3 py-2 border transition-all duration-300 ${
            strategy === 'comfort'
              ? 'bg-mood-accent text-mood-accent-on border-mood-accent shadow-[0_0_18px_-4px_var(--mood-accent-glow)]'
              : 'bg-slate-100/60 dark:bg-slate-800/60 border-mood-border text-mood-text hover:bg-mood-accent-soft'
          }`}
        >
          安抚心情
        </button>
      </div>

      <button
        onClick={() => onAutoRefreshChange?.(!autoRefresh)}
        aria-pressed={autoRefresh}
        className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs border transition-all duration-300 ${
          autoRefresh
            ? 'bg-mood-accent text-mood-accent-on border-mood-accent shadow-[0_0_18px_-4px_var(--mood-accent-glow)]'
            : 'bg-slate-100/60 dark:bg-slate-800/60 border-mood-border text-mood-text hover:bg-mood-accent-soft'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <RefreshCcw size={13} className={autoRefresh ? 'animate-[spin_3s_linear_infinite]' : ''} />
          持续电台
        </span>
        <span className="text-[10px] opacity-80">
          {autoRefresh ? 'ON' : 'OFF'}
        </span>
      </button>

      <div className="rounded-lg bg-slate-100 dark:bg-slate-900/50 border border-mood-border p-3 text-xs flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400">当前稳定情绪</span>
          <span className="font-semibold text-mood-text">
            {currentLabel ? getFaceEmotionLabel(currentLabel) : '等待识别'}
            {confidence > 0 ? ` ${(confidence * 100).toFixed(0)}%` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400">推荐坐标</span>
          <span className="font-mono text-mood-text">
            {moodTarget ? `V ${moodTarget.v.toFixed(1)} / A ${moodTarget.a.toFixed(1)}` : '--'}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {moodTarget?.description || (manualEmotion
            ? '已通过手动选择确定当前情绪。'
            : '开启摄像头并保持表情稳定后，系统会给出推荐目标。')}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={!stableEmotion || !tracksReady || loading}
        className="w-full bg-mood-accent hover:brightness-110 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:hover:brightness-100 text-mood-accent-on rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-300 shadow-[0_0_24px_-6px_var(--mood-accent-glow)] hover:shadow-[0_0_32px_-4px_var(--mood-accent-glow)]"
      >
        {loading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
        {loading ? '正在推荐' : '根据当前情绪推荐'}
      </button>

      {playlist?.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <ListMusic size={13}/> 推荐歌单
            </span>
            <button
              onClick={onPlay}
              className="text-mood-accent hover:underline flex items-center gap-1 transition-colors duration-500"
            >
              <Play size={12}/> 播放
            </button>
          </div>
          <div className="max-h-28 overflow-y-auto custom-scrollbar rounded-lg border border-mood-border bg-slate-50 dark:bg-slate-900/40">
            {playlist.slice(0, 6).map((track, idx) => (
              <button
                key={`${track.id}-${idx}`}
                onClick={() => onPlay?.(idx)}
                className="w-full text-left px-3 py-2 text-[11px] border-b last:border-b-0 border-mood-border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={track.title || track.filepath}
              >
                <span className="font-mono opacity-60 mr-1">{idx + 1}.</span>
                <span className="text-mood-text">{track.title || track.filepath}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!tracksReady && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
          请先添加音乐库并等待分析完成。
        </div>
      )}

      <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-500">
        <Brain size={12}/> 摄像头画面只在浏览器本地处理。
      </div>
    </div>
  );
}

export default EmotionRadioPanel;
