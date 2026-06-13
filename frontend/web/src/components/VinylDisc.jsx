import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';

/**
 * 黑胶唱片样式的封面展示。
 * - cover 作为唱片中央贴纸
 * - 外圈黑色 + 同心圆凹槽 + 反射高光
 * - playing=true 时缓慢旋转,否则静止(过渡平滑)
 *
 * 用 inline SVG 画凹槽,体积小、不依赖图片。
 */
function VinylDisc({
  trackId,
  cover,                 // 可选:已知封面 URL
  playing = false,
  size = 160,
  className = ''
}) {
  const [coverUrl, setCoverUrl] = useState(cover || null);

  useEffect(() => {
    if (cover) { setCoverUrl(cover); return; }
    if (!trackId) { setCoverUrl(null); return; }
    // 探一下封面是否存在;不存在时 img 自身 onError 会处理
    setCoverUrl(`/api/cover?id=${trackId}`);
  }, [trackId, cover]);

  const center = size / 2;
  const labelR = size * 0.28;     // 中央贴纸半径
  const holeR  = size * 0.038;    // 中心孔
  const grooveStart = size * 0.30;
  const grooveEnd   = size * 0.48;
  const grooveCount = 10;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size, perspective: 600 }}
    >
      <div
        className="relative w-full h-full rounded-full overflow-hidden"
        style={{
          animation: playing ? 'vinyl-spin 7s linear infinite' : 'none',
          animationPlayState: playing ? 'running' : 'paused',
          boxShadow:
            '0 8px 32px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 22px rgba(0,0,0,0.6)'
        }}
      >
        {/* 黑胶本体 */}
        <div className="absolute inset-0 rounded-full" style={{
          background: 'radial-gradient(circle at 50% 50%, #1a1a1f 0%, #0a0a0d 70%, #050507 100%)'
        }}/>

        {/* 同心凹槽 (SVG) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${size} ${size}`}
          fill="none"
        >
          {Array.from({ length: grooveCount }).map((_, i) => {
            const t = i / (grooveCount - 1);
            const r = grooveStart + t * (grooveEnd - grooveStart);
            return (
              <circle
                key={i}
                cx={center} cy={center} r={r}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="0.8"
              />
            );
          })}
          {/* 一道高光弧:模拟光线反射 */}
          <defs>
            <linearGradient id={`shine-${trackId || 'x'}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.12)"/>
              <stop offset="45%"  stopColor="rgba(255,255,255,0)"/>
              <stop offset="55%"  stopColor="rgba(255,255,255,0)"/>
              <stop offset="100%" stopColor="rgba(255,255,255,0.18)"/>
            </linearGradient>
          </defs>
          <circle
            cx={center} cy={center} r={size * 0.49}
            fill={`url(#shine-${trackId || 'x'})`}
            style={{ mixBlendMode: 'screen' }}
          />
        </svg>

        {/* 中央封面贴纸 */}
        <div
          className="absolute rounded-full overflow-hidden flex items-center justify-center"
          style={{
            top: center - labelR,
            left: center - labelR,
            width: labelR * 2,
            height: labelR * 2,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), inset 0 0 12px rgba(0,0,0,0.4)'
          }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setCoverUrl(null)}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--mood-accent), var(--mood-accent-glow))' }}>
              <Music size={Math.max(16, labelR * 0.5)} className="text-white opacity-70"/>
            </div>
          )}
        </div>

        {/* 中心孔 */}
        <div
          className="absolute rounded-full"
          style={{
            top: center - holeR,
            left: center - holeR,
            width: holeR * 2,
            height: holeR * 2,
            background: 'radial-gradient(circle, #050507 0%, #1a1a1f 80%)',
            boxShadow: 'inset 0 0 4px rgba(0,0,0,0.9)'
          }}
        />
      </div>
    </div>
  );
}

export default VinylDisc;
