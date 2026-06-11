import { Camera, CameraOff, Loader2, MoveLeft, MoveUp, ShieldCheck, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getFaceEmotionEmoji, getFaceEmotionLabel } from '../emotionMapping';
import useHeadGesture from '../hooks/useHeadGesture';

const FACE_API_SRC = '/face-api.min.js';
const MODEL_URL = '/face-models';

let faceApiLoader = null;

function loadFaceApi() {
  if (window.faceapi) return Promise.resolve(window.faceapi);
  if (faceApiLoader) return faceApiLoader;

  faceApiLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${FACE_API_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.faceapi), { once: true });
      existing.addEventListener('error', () => reject(new Error('face-api.js 加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = FACE_API_SRC;
    script.async = true;
    script.onload = () => resolve(window.faceapi);
    script.onerror = () => reject(new Error('face-api.js 加载失败'));
    document.head.appendChild(script);
  });

  return faceApiLoader;
}

function getTopExpression(expressions) {
  return Object.entries(expressions).reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ['neutral', 0]
  );
}

function EmotionCamera({ onEmotion, onGesture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const gestureCallbackRef = useRef(onGesture);
  gestureCallbackRef.current = onGesture;
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('摄像头未开启');
  const [error, setError] = useState('');
  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [lastGesture, setLastGesture] = useState(null);
  const gestureTimeoutRef = useRef(null);

  const handleGesture = useCallback((type) => {
    gestureCallbackRef.current?.(type);
    setLastGesture(type);
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = setTimeout(() => setLastGesture(null), 1800);
  }, []);

  const { feed } = useHeadGesture({ onGesture: handleGesture });

  const stopCamera = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }

    setIsRunning(false);
    setIsLoading(false);
    setStatus('摄像头未开启');
  };

  const startCamera = async () => {
    setError('');
    setIsLoading(true);
    setStatus('正在加载识别模型');

    try {
      if (!window.isSecureContext) {
        throw new Error('请使用 localhost、127.0.0.1 或 HTTPS 访问页面');
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('当前浏览器不支持摄像头 API');
      }

      const faceapi = await loadFaceApi();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
      ]);

      setStatus('等待摄像头权限');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 360, height: 270, facingMode: 'user' },
        audio: false
      });

      streamRef.current = stream;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      video.srcObject = stream;
      await video.play();

      const displaySize = {
        width: video.videoWidth || 360,
        height: video.videoHeight || 270
      };

      canvas.width = displaySize.width;
      canvas.height = displaySize.height;
      faceapi.matchDimensions(canvas, displaySize);

      setIsRunning(true);
      setIsLoading(false);
      setStatus('正在识别表情');

      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

        const detections = await faceapi
          .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!detections.length) {
          setStatus('未检测到人脸');
          feed(null);
          return;
        }

        const resized = faceapi.resizeResults(detections, displaySize);
        faceapi.draw.drawDetections(canvas, resized);
        faceapi.draw.drawFaceLandmarks(canvas, resized);

        feed(detections[0].landmarks.positions);

        const [label, confidence] = getTopExpression(detections[0].expressions);
        const nextEmotion = {
          label,
          confidence,
          scores: detections[0].expressions,
          timestamp: Date.now()
        };

        setCurrentEmotion(nextEmotion);
        setStatus(`${getFaceEmotionLabel(label)} ${(confidence * 100).toFixed(0)}%`);
        onEmotion?.(nextEmotion);
      }, 180);
    } catch (err) {
      const message = err?.message || String(err);
      setError(message);
      setStatus('摄像头不可用');
      setIsLoading(false);
      setIsRunning(false);
    }
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <div className="bg-mood-card border border-mood-border rounded-xl shadow-lg p-4 mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Video size={18} className="text-blue-500 shrink-0"/>
          <div className="min-w-0">
            <div className="text-sm font-bold text-mood-text">面部情绪识别</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{status}</div>
          </div>
        </div>
        <button
          onClick={isRunning || isLoading ? stopCamera : startCamera}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
            isRunning || isLoading
              ? 'bg-slate-200 dark:bg-slate-700 text-mood-text hover:bg-slate-300 dark:hover:bg-slate-600'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin"/> : isRunning ? <CameraOff size={14}/> : <Camera size={14}/>}
          {isLoading ? '加载中' : isRunning ? '关闭' : '开启'}
        </button>
      </div>

      <div className="relative aspect-[4/3] bg-slate-950 rounded-lg overflow-hidden border border-mood-border">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        {!isRunning && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 text-xs">
            <Camera size={28} className="opacity-70"/>
            <span>点击开启摄像头</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl leading-none">{getFaceEmotionEmoji(currentEmotion?.label)}</span>
          <div className="min-w-0">
            <div className="font-semibold text-mood-text">
              {currentEmotion ? getFaceEmotionLabel(currentEmotion.label) : '等待识别'}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {currentEmotion ? `置信度 ${(currentEmotion.confidence * 100).toFixed(1)}%` : '不会上传摄像头画面'}
            </div>
          </div>
        </div>
        <ShieldCheck size={16} className="text-emerald-500 shrink-0"/>
      </div>

      {lastGesture && (
        <div className="flex items-center gap-2 text-[11px] text-violet-600 dark:text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg p-2">
          {lastGesture === 'nod' ? <MoveUp size={14} className="animate-bounce" /> : <MoveLeft size={14} className="animate-[bounce_0.6s_ease-in-out_2]" />}
          <span>检测到</span>
          <span className="font-semibold">{lastGesture === 'nod' ? '点头' : '摇头'}</span>
          <span className="opacity-70">{lastGesture === 'nod' ? '(确认)' : '(切歌)'}</span>
        </div>
      )}

      {error && (
        <div className="text-[11px] bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-2">
          {error}
        </div>
      )}
    </div>
  );
}

export default EmotionCamera;
