import { Link } from 'react-router-dom';
import { Camera, Clock, Hand, Loader2, Play, Sparkles, Upload as UploadIcon } from 'lucide-react';

import EmotionCamera from '../components/EmotionCamera';
import EmotionRadioPanel from '../components/EmotionRadioPanel';
import ManualEmotionSelector from '../components/ManualEmotionSelector';
import { useAppState } from '../contexts/AppStateContext';

function RadioPage() {
  const {
    tracks,
    emotionPlaylist,
    isEmotionLoading,
    faceEmotion,
    setFaceEmotion,
    manualEmotion,
    setManualEmotion,
    autoRefresh,
    setAutoRefresh,
    handleHeadGesture,
    handleEmotionGenerate,
    handleEmotionPlay,
    handleStableEmotionChange,
    currentTimeSlot,
    handleTimeSlotRecommend
  } = useAppState();

  const hasTracks = tracks.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto flex flex-col gap-6 pb-32">
      <div className="glass border border-mood-border rounded-2xl p-6 relative overflow-hidden">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-30 blur-3xl transition-colors duration-700"
          style={{ background: 'var(--mood-accent-glow)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={20} className="text-mood-accent transition-colors duration-500"/>
            <h1 className="font-display text-2xl text-mood-text tracking-wide">情绪音乐电台</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            摄像头识别表情、手动选择情绪、或挥头切歌,三种方式都能驱动推荐。
          </p>
          {!hasTracks && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-amber-600 dark:text-amber-400">还没有可推荐的音乐</span>
              <Link to="/upload" className="inline-flex items-center gap-1 text-mood-accent hover:underline">
                <UploadIcon size={12}/> 去上传
              </Link>
            </div>
          )}

          {/* 当前时段电台 */}
          {currentTimeSlot && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-full bg-mood-accent-soft border border-mood-accent/30 text-mood-text text-xs">
                <Clock size={12} className="text-mood-accent"/>
                <span className="text-lg leading-none">{currentTimeSlot.emoji}</span>
                <span className="font-medium">{currentTimeSlot.label}</span>
                <span className="font-mono text-[10px] text-slate-500">
                  V {currentTimeSlot.target.v.toFixed(1)} / A {currentTimeSlot.target.a.toFixed(1)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleTimeSlotRecommend}
                disabled={!hasTracks || isEmotionLoading}
                className="text-xs px-3 py-1.5 rounded-full bg-mood-accent text-mood-accent-on hover:brightness-110 disabled:opacity-50 flex items-center gap-1 transition-all duration-300 shadow-[0_0_18px_-4px_var(--mood-accent-glow)]"
              >
                {isEmotionLoading ? <Loader2 size={12} className="animate-spin"/> : <Play size={12}/>}
                用时段电台
              </button>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 min-w-0">
                {currentTimeSlot.target.description}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-4">
          <div className="glass border border-mood-border rounded-xl p-4 shadow-lg">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-sm font-bold text-mood-text">
              <Camera size={16} className="text-mood-accent transition-colors duration-500"/> 面部情绪识别
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal sm:ml-2">
                头朝右 = 下一首 · 头朝左 = 上一首
              </span>
            </div>
            <EmotionCamera
              onEmotion={setFaceEmotion}
              onGesture={handleHeadGesture}
            />
          </div>

          <ManualEmotionSelector onSelect={setManualEmotion}/>
        </div>

        <div className="flex flex-col gap-4">
          <EmotionRadioPanel
            faceEmotion={faceEmotion}
            manualEmotion={manualEmotion}
            autoRefresh={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
            onGenerate={handleEmotionGenerate}
            onPlay={handleEmotionPlay}
            onStableChange={handleStableEmotionChange}
            playlist={emotionPlaylist}
            loading={isEmotionLoading}
            tracksReady={hasTracks}
          />

          <div className="bg-mood-card border border-mood-border rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-2">
            <Hand size={14} className="text-cyan-500 mt-0.5 shrink-0"/>
            <div>
              手动选择会临时覆盖摄像头识别结果,点选中的情绪可清除回到自动识别。
              开启「自动续推」后,推荐歌单播放完会按当前情绪再推一组。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RadioPage;
