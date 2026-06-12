import { useCallback, useRef, useState } from 'react';

// 所有阈值以像素为单位,基于实测(swipe 时 peakDx ≈ 15–40 像素)
const BUFFER_SIZE = 14;
const BUFFER_WINDOW_MS = 1500;
const MIN_FRAMES = 5;

const COOLDOWN_MS = 1000;             // 触发任一手势后,1 秒内不接收信号也不再触发
const SHAKE_RANGE_THRESHOLD = 12;     // 摇头横向跨度 ≥ 12 像素
const SHAKE_DIR_CHANGE_MIN  = 3;
const SWIPE_RANGE_THRESHOLD = 10;
const SWIPE_PEAK_THRESHOLD  = 8;      // 朝一侧偏 ≥ 8 像素即触发
const SWIPE_MAX_DIR_CHANGES = 1;

const DEBUG_GESTURES = false;

// 单帧位移门槛 (像素)
const NOISE_FRAME_DX = 1.5;

// 整段路径长度门槛 (像素)
const IDLE_TOTAL_PATH = 12;

/**
 * 头部姿态识别,支持四种事件:
 *   'swipe_left'   — 单方向向左挥头  (建议接上一首)
 *   'swipe_right'  — 单方向向右挥头  (建议接下一首)
 *   'shake'        — 多次来回左右摇头  (建议接暂停/拒绝)
 *   'nod'          — 上下点头  (建议接喜欢/确认)
 *
 * @param {object}   opts
 * @param {Function} opts.onGesture  (type, info) => void
 * @param {boolean}  opts.mirrored   根据你的摄像头实际行为校准:用户朝右挥头后
 *                                   peakDx 是负的 → 设 true;peakDx 是正的 → 设 false
 */

function useHeadGesture({ onGesture, mirrored = true } = {}) {
  const bufferRef = useRef([]);
  const lastGestureRef = useRef(0);
  const [gesture, setGesture] = useState(null);

  const feed = useCallback((landmarks) => {
    if (!landmarks || landmarks.length < 31) {
      bufferRef.current = [];
      return;
    }

    const now = Date.now();

    // 屏蔽期内:直接丢帧、清 buffer,不让回正/回弹动作累积。
    // 屏蔽期结束后从干净状态重新攒数据,需要先收满 MIN_FRAMES 才能再次触发。
    if (now - lastGestureRef.current < COOLDOWN_MS) {
      bufferRef.current = [];
      return;
    }

    const noseTip = landmarks[30];
    bufferRef.current.push({ x: noseTip.x, y: noseTip.y, t: now });

    // 按时间和容量裁剪滑窗
    while (bufferRef.current.length > 1 &&
           now - bufferRef.current[0].t > BUFFER_WINDOW_MS) {
      bufferRef.current.shift();
    }
    if (bufferRef.current.length > BUFFER_SIZE) {
      bufferRef.current = bufferRef.current.slice(-BUFFER_SIZE);
    }
    if (bufferRef.current.length < MIN_FRAMES) return;

    const xs = bufferRef.current.map(p => p.x);
    const ys = bufferRef.current.map(p => p.y);

    const countDirChanges = (arr) => {
      let changes = 0;
      for (let i = 2; i < arr.length; i++) {
        const d1 = arr[i - 1] - arr[i - 2];
        const d2 = arr[i] - arr[i - 1];
        if (Math.abs(d1) > NOISE_FRAME_DX &&
            Math.abs(d2) > NOISE_FRAME_DX &&
            d1 * d2 < 0) {
          changes++;
        }
      }
      return changes;
    };

    const range = (arr) => {
      let mn = Infinity, mx = -Infinity;
      for (const v of arr) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      return mx - mn;
    };

    const xRange = range(xs);
    const yRange = range(ys);

    // 总路径长度:把每一帧的位移加起来,衡量"实际动了多少"
    let totalPathX = 0;
    let totalPathY = 0;
    for (let i = 1; i < xs.length; i++) {
      totalPathX += Math.abs(xs[i] - xs[i - 1]);
      totalPathY += Math.abs(ys[i] - ys[i - 1]);
    }

    // 静止/噪声门槛:X、Y 总路径都太小 → 直接返回,不可能是手势
    if (totalPathX < IDLE_TOTAL_PATH && totalPathY < IDLE_TOTAL_PATH) return;

    const xDirChanges = countDirChanges(xs);
    const yDirChanges = countDirChanges(ys);

    // 相对起点的最大偏移点(衡量"用户朝哪边挥过去过")
    let peakDx = 0;
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[0];
      if (Math.abs(d) > Math.abs(peakDx)) peakDx = d;
    }

    // 1) 多次来回摇头 (shake)
    if (xRange > SHAKE_RANGE_THRESHOLD && xDirChanges >= SHAKE_DIR_CHANGE_MIN) {
      lastGestureRef.current = now;
      setGesture('shake');
      if (DEBUG_GESTURES) console.log('[gesture] SHAKE',
        { xRange: xRange.toFixed(3), xDirChanges, totalPathX: totalPathX.toFixed(3) });
      onGesture?.('shake', { range: xRange, dirChanges: xDirChanges });
      return;
    }

    // 2) 单方向挥头 (swipe)
    if (xRange > SWIPE_RANGE_THRESHOLD &&
        xDirChanges <= SWIPE_MAX_DIR_CHANGES &&
        Math.abs(peakDx) >= SWIPE_PEAK_THRESHOLD) {
      const movedUserRight = mirrored ? peakDx < 0 : peakDx > 0;
      const type = movedUserRight ? 'swipe_right' : 'swipe_left';

      lastGestureRef.current = now;
      // 触发后只保留最近 2 帧,丢掉旧的极值,避免回正阶段被算成反向 swipe
      setGesture(type);
      if (DEBUG_GESTURES) console.log(`[gesture] ${type.toUpperCase()}`,
        { peakDx: peakDx.toFixed(3), xRange: xRange.toFixed(3),
          xDirChanges, mirrored, totalPathX: totalPathX.toFixed(3) });
      onGesture?.(type, { peakDx, range: xRange });
      return;
    }

    // 3) 点头 (nod)
    if (yRange > SHAKE_RANGE_THRESHOLD &&
        yDirChanges >= SHAKE_DIR_CHANGE_MIN &&
        xRange < yRange * 1.5) {
      lastGestureRef.current = now;
      setGesture('nod');
      onGesture?.('nod', { range: yRange, dirChanges: yDirChanges });
    }
  }, [onGesture, mirrored]);

  const resetGesture = useCallback(() => setGesture(null), []);

  return { feed, gesture, resetGesture };
}

export default useHeadGesture;
