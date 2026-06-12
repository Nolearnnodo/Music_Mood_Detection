// 时段 → 情绪坐标映射。所有 V/A 都是 1-9 的小数,与 emotionMapping.js 一致。
//
//   morning   6-10   起床、通勤、轻快积极  → match
//   midday    10-14  专注/午餐、推持续能量 → match
//   afternoon 14-18  午后舒缓、轻度节奏    → match
//   evening   18-22  下班放松、暖色调      → match
//   night     22-02  睡前、低唤醒          → match
//   lateNight 02-06  深夜、极静            → comfort

const SLOTS = [
  {
    id: 'morning', hourStart: 6, hourEnd: 10,
    label: '晨间电台', emoji: '🌅', theme: 'happy',
    target: { v: 7.2, a: 6.5, radius: 1.5, strategy: 'match',
              title: '晨间电台', description: '轻快积极,陪你打开一天。' }
  },
  {
    id: 'midday', hourStart: 10, hourEnd: 14,
    label: '午间电台', emoji: '☀️', theme: 'energetic',
    target: { v: 6.8, a: 7.2, radius: 1.5, strategy: 'match',
              title: '午间电台', description: '保持节奏,持续高能。' }
  },
  {
    id: 'afternoon', hourStart: 14, hourEnd: 18,
    label: '午后电台', emoji: '🌤️', theme: 'focused',
    target: { v: 5.8, a: 5.5, radius: 1.5, strategy: 'match',
              title: '午后电台', description: '温和稳定,适合专注。' }
  },
  {
    id: 'evening', hourStart: 18, hourEnd: 22,
    label: '傍晚电台', emoji: '🌇', theme: 'calm',
    target: { v: 5.5, a: 4.2, radius: 1.5, strategy: 'match',
              title: '傍晚电台', description: '下班放松,暖色慢板。' }
  },
  {
    id: 'night', hourStart: 22, hourEnd: 26,  // 22-02 (跨夜)
    label: '夜晚电台', emoji: '🌙', theme: 'calm',
    target: { v: 4.6, a: 3.0, radius: 1.8, strategy: 'match',
              title: '夜晚电台', description: '准备入眠,低唤醒。' }
  },
  {
    id: 'lateNight', hourStart: 2, hourEnd: 6,
    label: '深夜电台', emoji: '🌌', theme: 'sad',
    target: { v: 4.2, a: 2.2, radius: 2.0, strategy: 'comfort',
              title: '深夜电台', description: '极静极慢,给睡不着的时刻。' }
  }
];

export function getTimeSlot(date = new Date()) {
  const h = date.getHours();
  for (const s of SLOTS) {
    if (s.hourEnd > 24) {
      // 跨夜:22-26 等价于 [22, 24) ∪ [0, 2)
      if (h >= s.hourStart || h < (s.hourEnd - 24)) return s;
    } else {
      if (h >= s.hourStart && h < s.hourEnd) return s;
    }
  }
  // 兜底
  return SLOTS[2]; // afternoon
}

export function getTimeSlotById(id) {
  return SLOTS.find(s => s.id === id) || null;
}

export const ALL_SLOTS = SLOTS;
