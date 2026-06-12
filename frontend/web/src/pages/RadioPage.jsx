import { Link } from 'react-router-dom';
import { Camera, Sparkles, Upload as UploadIcon } from 'lucide-react';

import EmotionCamera from '../components/EmotionCamera';
import EmotionRadioPanel from '../components/EmotionRadioPanel';
import Player from '../components/Player';
import { useAppState } from '../contexts/AppStateContext';

function RadioPage() {
  const {
    tracks,
    selectedTrack,
    appSettings,
    playlistRadius,
    setPlaylistRadius,
    setCurrentTime,
    emotionPlaylist,
    emotionPlaylistVersion,
    emotionStartIndex,
    emotionPlaylistLabel,
    isEmotionLoading,
    faceEmotion,
    setFaceEmotion,
    handleEmotionGenerate,
    handleEmotionPlay,
    handlePlayerTrackChange,
    handlePlaylistExportFromPlayer
  } = useAppState();

  const hasTracks = tracks.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="bg-gradient-to-br from-blue-500/10 to-emerald-500/10 border border-mood-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={18} className="text-emerald-500"/>
          <h1 className="text-xl font-bold text-mood-text">情绪音乐电台</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          通过摄像头识别表情，从本地曲库为你挑选最合拍的歌曲。
        </p>
        {!hasTracks && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-amber-600 dark:text-amber-400">还没有可推荐的音乐</span>
            <Link to="/upload" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
              <UploadIcon size={12}/> 去上传
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-4">
          <div className="bg-mood-card border border-mood-border rounded-xl p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3 text-sm font-bold text-mood-text">
              <Camera size={16} className="text-blue-500"/> 面部情绪识别
            </div>
            <EmotionCamera onEmotion={setFaceEmotion}/>
          </div>

          <EmotionRadioPanel
            faceEmotion={faceEmotion}
            onGenerate={handleEmotionGenerate}
            onPlay={handleEmotionPlay}
            playlist={emotionPlaylist}
            loading={isEmotionLoading}
            tracksReady={hasTracks}
          />
        </div>

        <div className="flex flex-col">
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
      </div>
    </div>
  );
}

export default RadioPage;
