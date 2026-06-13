import axios from 'axios';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mood_user';

const ADJ = ['困倦的', '雀跃的', '安静的', '温柔的', '深夜的', '清晨的', '走神的',
              '微醺的', '想睡的', '在听歌的', '路过的', '哼歌的', '失眠的', '专注的'];
const NOUN = ['薄荷', '小猫', '月光', '海风', '北极星', '橘子', '黑胶', '蓝鲸',
               '咖啡因', '青苔', '雨滴', '糖霜', '云朵', '夜鹰'];

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  // 兜底
  return [...Array(32)].map(() =>
    Math.floor(Math.random() * 16).toString(16)).join('');
}

function randomNickname() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return a + n;
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveStored(u) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); } catch {}
}

export function useUser() {
  const [user, setUser] = useState(() => loadStored());
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) return;
    // 首次访问:在本地生成 uuid + 昵称,向后端登记
    const fresh = { uuid: uuid(), nickname: randomNickname() };
    axios.post('/api/user/register', fresh)
      .then(res => {
        const u = {
          user_id:  res.data.user_id,
          uuid:     res.data.uuid,
          nickname: res.data.nickname
        };
        saveStored(u);
        setUser(u);
      })
      .catch(e => setError(e.message));
  }, [user]);

  // 改昵称(只改本地,服务端目前不支持改名)
  const renameLocal = (nick) => {
    if (!user) return;
    const u = { ...user, nickname: nick };
    saveStored(u);
    setUser(u);
  };

  return { user, error, renameLocal };
}
