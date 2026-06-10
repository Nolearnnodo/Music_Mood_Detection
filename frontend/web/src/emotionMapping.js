export const FACE_EMOTION_LABELS = {
  default: '等待识别',
  neutral: '平静',
  happy: '开心',
  sad: '伤心',
  angry: '生气',
  fearful: '紧张',
  disgusted: '厌恶',
  surprised: '惊讶'
};

export const FACE_EMOTION_EMOJIS = {
  default: '😐',
  neutral: '😐',
  happy: '😀',
  sad: '😥',
  angry: '😠',
  fearful: '😨',
  disgusted: '🤢',
  surprised: '😲'
};

export const FACE_TO_MUSIC_MOOD = {
  neutral: {
    v: 5.5,
    a: 4.0,
    radius: 1.2,
    title: '平静电台',
    description: '选择轻松、不刺激的音乐，让当下保持稳定。'
  },
  happy: {
    v: 8.0,
    a: 6.5,
    radius: 1.4,
    title: '开心电台',
    description: '匹配明亮、愉悦、有活力的歌曲。'
  },
  sad: {
    v: 3.0,
    a: 3.0,
    radius: 1.5,
    title: '低落电台',
    description: '匹配低唤醒、低愉悦的歌曲，先接住当前心情。'
  },
  angry: {
    v: 3.0,
    a: 8.0,
    radius: 1.6,
    title: '高能电台',
    description: '匹配高能量、强烈情绪的音乐。'
  },
  fearful: {
    v: 2.8,
    a: 7.0,
    radius: 1.6,
    title: '紧张电台',
    description: '匹配紧张、高唤醒的音乐氛围。'
  },
  disgusted: {
    v: 2.5,
    a: 5.5,
    radius: 1.5,
    title: '冷色电台',
    description: '匹配低愉悦、中等能量的歌曲。'
  },
  surprised: {
    v: 6.5,
    a: 8.0,
    radius: 1.4,
    title: '惊喜电台',
    description: '匹配明亮、高能量、跳跃感更强的歌曲。'
  }
};

export const COMFORT_MOOD_TARGETS = {
  neutral: FACE_TO_MUSIC_MOOD.neutral,
  happy: FACE_TO_MUSIC_MOOD.happy,
  sad: {
    v: 6.2,
    a: 3.4,
    radius: 1.8,
    title: '安抚电台',
    description: '用更温和、更明亮的歌曲慢慢托起情绪。'
  },
  angry: {
    v: 5.4,
    a: 3.6,
    radius: 1.8,
    title: '降温电台',
    description: '用低能量、较稳定的歌曲帮助情绪降温。'
  },
  fearful: {
    v: 6.0,
    a: 3.2,
    radius: 1.8,
    title: '安全感电台',
    description: '选择更舒缓、低唤醒的歌曲建立安全感。'
  },
  disgusted: {
    v: 5.8,
    a: 3.8,
    radius: 1.7,
    title: '转换心情电台',
    description: '用干净、轻松的音乐把注意力带离不适感。'
  },
  surprised: FACE_TO_MUSIC_MOOD.surprised
};

export function getMoodTarget(faceEmotion, strategy = 'match') {
  const table = strategy === 'comfort' ? COMFORT_MOOD_TARGETS : FACE_TO_MUSIC_MOOD;
  return table[faceEmotion] || FACE_TO_MUSIC_MOOD.neutral;
}

export function getFaceEmotionLabel(faceEmotion) {
  return FACE_EMOTION_LABELS[faceEmotion] || FACE_EMOTION_LABELS.default;
}

export function getFaceEmotionEmoji(faceEmotion) {
  return FACE_EMOTION_EMOJIS[faceEmotion] || FACE_EMOTION_EMOJIS.default;
}
