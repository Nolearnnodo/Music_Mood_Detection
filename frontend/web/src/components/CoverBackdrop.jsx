import { useEffect, useRef, useState } from 'react';

import { useAppState } from '../contexts/AppStateContext';

/**
 * 沉浸式背景:正在播放的曲目封面经过强模糊作为整页背景。
 * - 与 Aurora 同层(在 #root 之下),不影响阅读
 * - 没有当前曲时彻底隐藏,Aurora 自然显露
 * - 切歌时旧封面渐隐,新封面渐显,避免突兀
 */
function CoverBackdrop() {
  const { currentTrack } = useAppState();
  const [layers, setLayers] = useState([]); // [{url, key, opacity}]
  const counterRef = useRef(0);

  useEffect(() => {
    if (!currentTrack?.id) {
      // 全部淡出
      setLayers(prev => prev.map(l => ({ ...l, opacity: 0 })));
      return;
    }
    const url = `/api/cover?id=${currentTrack.id}`;
    counterRef.current += 1;
    const key = counterRef.current;

    setLayers(prev => {
      // 旧层全部淡出,加入新层
      const fading = prev.map(l => ({ ...l, opacity: 0 }));
      return [...fading, { url, key, opacity: 1 }];
    });

    // 一段时间后清理已经完全隐藏的层
    const t = setTimeout(() => {
      setLayers(prev => prev.filter(l => l.opacity > 0 || l.key === key));
    }, 1400);
    return () => clearTimeout(t);
  }, [currentTrack?.id]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {layers.map(l => (
        <div
          key={l.key}
          className="absolute inset-0 transition-opacity duration-[1200ms] ease-out"
          style={{ opacity: l.opacity }}
        >
          <img
            src={l.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              filter: 'blur(22px) saturate(1.4) brightness(0.7)',
              transform: 'scale(1.08)'
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            draggable={false}
          />
          {/* 上下淡黑遮罩,保证文字可读性。比之前更轻一点 */}
          <div className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.45) 100%)'
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default CoverBackdrop;
