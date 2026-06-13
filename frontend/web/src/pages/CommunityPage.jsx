import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Edit3, Headphones, RefreshCw, Sparkles, Users } from 'lucide-react';

import { FACE_EMOTION_EMOJIS, FACE_EMOTION_LABELS } from '../emotionMapping';
import { useAppState } from '../contexts/AppStateContext';

// 服务端返回的 mood_label 可能是 face emotion key (happy/sad/...) 或中文 (开心/平静/...),全部归一
function normalizeLabel(raw) {
  if (!raw) return { key: 'unknown', label: '未指定', emoji: '🌫️' };
  if (FACE_EMOTION_LABELS[raw]) {
    return { key: raw, label: FACE_EMOTION_LABELS[raw], emoji: FACE_EMOTION_EMOJIS[raw] || '🌫️' };
  }
  // 中文 → 推测对应的 face emotion key
  const cnToFace = {
    '开心': 'happy', '快乐': 'happy', '兴奋': 'happy',
    '平静': 'neutral', '专注': 'neutral', '放松': 'neutral',
    '低落': 'sad', '伤心': 'sad', '难过': 'sad', '疲惫': 'sad',
    '生气': 'angry', '愤怒': 'angry',
    '焦虑': 'fearful', '紧张': 'fearful', '惊讶': 'surprised'
  };
  const k = cnToFace[raw];
  return { key: k || 'unknown', label: raw, emoji: k ? FACE_EMOTION_EMOJIS[k] : '🌫️' };
}

function CommunityPage() {
  const { user, renameLocal, handleChartClick, tracks } = useAppState();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/presence/summary');
      setSummary(res.data);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchSummary();
    const id = setInterval(fetchSummary, 10_000);
    return () => clearInterval(id);
  }, []);

  const totalWithMood = useMemo(() =>
    (summary?.moods || []).reduce((sum, m) => sum + m.count, 0), [summary]);

  const playTopTrack = (trackId) => {
    const idx = tracks.findIndex(t => t.id === trackId);
    if (idx >= 0) handleChartClick(idx);
  };

  const [renaming, setRenaming] = useState(false);
  const [draftNick, setDraftNick] = useState('');
  const startRename = () => { setDraftNick(user?.nickname || ''); setRenaming(true); };
  const saveRename = () => {
    const t = draftNick.trim().slice(0, 16);
    if (t) renameLocal(t);
    setRenaming(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4 pb-32">
      <div className="glass border border-mood-border rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-30 blur-3xl"
             style={{ background: 'var(--mood-accent-glow)' }}/>
        <div className="relative flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-mood-accent transition-colors duration-500"/>
            <h1 className="font-display text-2xl text-mood-text tracking-wide">群体此刻</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            匿名展示当下其他用户的情绪与正在听的歌。每 10 秒刷新一次。
          </p>
          {user && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">你的身份</span>
              {renaming ? (
                <>
                  <input
                    autoFocus
                    value={draftNick}
                    onChange={e => setDraftNick(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
                    className="bg-slate-50/60 dark:bg-slate-800/60 px-2 py-0.5 rounded border border-mood-border text-mood-text"
                  />
                  <button onClick={saveRename} className="text-mood-accent hover:underline">保存</button>
                </>
              ) : (
                <>
                  <span className="text-mood-text font-medium">{user.nickname}</span>
                  <button onClick={startRename} className="text-slate-400 hover:text-mood-accent" title="改昵称">
                    <Edit3 size={11}/>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 当前活跃用户数 */}
      <div className="glass border border-mood-border rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-mood-accent-soft flex items-center justify-center">
            <Sparkles size={20} className="text-mood-accent"/>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">当前在线</div>
            <div className="text-2xl font-display text-mood-text">
              {summary?.active_users ?? '—'}
              <span className="text-sm font-sans ml-1 text-slate-500">人</span>
            </div>
          </div>
        </div>
        <button
          onClick={fetchSummary}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-md border border-mood-border text-mood-text hover:bg-mood-accent-soft disabled:opacity-50 flex items-center gap-1 transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''}/> 刷新
        </button>
      </div>

      {/* 情绪分布 */}
      <div className="glass border border-mood-border rounded-xl p-4 flex flex-col gap-3">
        <div className="text-sm font-bold text-mood-text flex items-center gap-2">
          <Sparkles size={14} className="text-mood-accent"/> 情绪分布
        </div>
        {!summary?.moods?.length ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
            目前没人选择情绪。试试让朋友也打开 Mood Radio。
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {summary.moods.map(m => {
              const { label, emoji } = normalizeLabel(m.label);
              const pct = totalWithMood > 0 ? Math.round(m.count / totalWithMood * 100) : 0;
              return (
                <div key={m.label} className="flex items-center gap-3 text-sm">
                  <span className="text-xl leading-none w-6 text-center">{emoji}</span>
                  <span className="text-mood-text w-16 shrink-0">{label}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-200/40 dark:bg-slate-800/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: 'var(--mood-accent)' }}
                    />
                  </div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 w-12 text-right">
                    {m.count} 人
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top tracks */}
      <div className="glass border border-mood-border rounded-xl p-4 flex flex-col gap-3">
        <div className="text-sm font-bold text-mood-text flex items-center gap-2">
          <Headphones size={14} className="text-mood-accent"/> 此刻最多人听
        </div>
        {!summary?.top_tracks?.length ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
            还没有曲目同时被多人收听。
          </div>
        ) : (
          <div className="flex flex-col">
            {summary.top_tracks.map((t, idx) => (
              <button
                key={t.track_id}
                onClick={() => playTopTrack(t.track_id)}
                className="w-full flex items-center gap-3 px-2 py-2 text-left text-sm border-b last:border-b-0 border-mood-border hover:bg-mood-accent-soft transition-colors rounded-md"
              >
                <span className="font-mono text-xs opacity-50 w-6 shrink-0">{idx + 1}.</span>
                <span className="flex-1 truncate text-mood-text" title={t.title}>{t.title || `Track #${t.track_id}`}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  {t.count} 人在听
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {err && <div className="text-xs text-red-500">{err}</div>}
    </div>
  );
}

export default CommunityPage;
