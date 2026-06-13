import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  Filter, Info, ListMusic, Loader2, Play,
  RefreshCw, Search, ThumbsDown, ThumbsUp, Trash2, X
} from 'lucide-react';

import VinylDisc from '../components/VinylDisc';
import { useAppState } from '../contexts/AppStateContext';

const QUADRANTS = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'happy', label: '高愉悦/高能量', test: t => t.v >= 5 && t.a >= 5 },
  { id: 'angry', label: '低愉悦/高能量', test: t => t.v < 5 && t.a >= 5 },
  { id: 'sad', label: '低愉悦/低能量', test: t => t.v < 5 && t.a < 5 },
  { id: 'calm', label: '高愉悦/低能量', test: t => t.v >= 5 && t.a < 5 }
];

function LibraryPage() {
  const { tracks, handleChartClick, scanStatus, fetchTracks } = useAppState();
  const [search, setSearch] = useState('');
  const [quadrant, setQuadrant] = useState('all');
  const [selected, setSelected] = useState(null);    // {id, title, v, a, ...}
  const [detail, setDetail] = useState(null);        // 详情 API 返回
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    axios.get('/api/feedback').then(res => setFeedbackMap(res.data || {})).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const test = (QUADRANTS.find(q => q.id === quadrant) || QUADRANTS[0]).test;
    const q = search.trim().toLowerCase();
    return tracks
      .filter(t => test(t))
      .filter(t => !q || (t.title || '').toLowerCase().includes(q));
  }, [tracks, search, quadrant]);

  const handlePlay = idx => {
    const realIndex = tracks.indexOf(filtered[idx]);
    if (realIndex >= 0) handleChartClick(realIndex);
  };

  const handleDetailKeyDown = (event, track) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openDetail(track);
  };

  const openDetail = async (t) => {
    setSelected(t);
    setDetail(null);
    setDetailLoading(true);
    setActionMsg('');
    try {
      const res = await axios.get(`/api/track/detail?id=${t.id}`);
      setDetail(res.data);
    } catch {
      setDetail({ error: '加载详情失败' });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => { setSelected(null); setDetail(null); setActionMsg(''); };

  const sendFeedback = async (kind) => {
    if (!selected) return;
    const next = feedbackMap[selected.id] === kind ? 'clear' : kind;
    try {
      await axios.post('/api/feedback', { track_id: selected.id, kind: next });
      setFeedbackMap(prev => {
        const m = { ...prev };
        if (next === 'clear') delete m[selected.id];
        else m[selected.id] = next;
        return m;
      });
    } catch {}
  };

  const reanalyzeOne = async () => {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    setActionMsg('正在重新分析,几秒后完成...');
    try {
      await axios.post(`/api/music/${selected.id}/reanalyze`);
      // poll
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const s = await axios.get('/api/music/reanalyze/status');
        if (!s.data?.running) break;
      }
      await fetchTracks();
      setActionMsg('重新分析完成');
    } catch (e) {
      setActionMsg('触发失败: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionBusy(false);
    }
  };

  const deleteOne = async (alsoFile) => {
    if (!selected) return;
    const confirm = window.confirm(
      alsoFile
        ? `确定从库里删除「${selected.title}」并删除文件?`
        : `确定从库里删除「${selected.title}」?(文件保留)`
    );
    if (!confirm) return;
    setActionBusy(true);
    try {
      await axios.delete(`/api/music/${selected.id}${alsoFile ? '?delete_file=true' : ''}`);
      await fetchTracks();
      closeDetail();
    } catch (e) {
      setActionMsg('删除失败: ' + (e.response?.data?.error || e.message));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto flex flex-col gap-4 pb-32">
      <div className="glass border border-mood-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <ListMusic size={18} className="text-mood-accent transition-colors duration-500"/>
          <h1 className="font-display text-xl text-mood-text tracking-wide">音乐库</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          已分析 {scanStatus.done} 首 · 失败 {scanStatus.failed} 首 · 总计 {scanStatus.total} 首
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        <div className="glass border border-mood-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none"/>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="按歌名搜索..."
                aria-label="按歌名搜索"
                className="w-full bg-slate-50/60 dark:bg-slate-800/60 text-mood-text pl-9 pr-9 py-2 rounded-lg border border-mood-border focus:outline-none focus:border-mood-accent focus:ring-2 focus:ring-mood-accent-soft text-sm transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 p-0.5 rounded text-slate-400 hover:text-mood-text hover:bg-mood-accent-soft transition-colors"
                  aria-label="清空搜索"
                >
                  <X size={14}/>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="按情绪象限筛选">
              <Filter size={14} className="text-slate-400"/>
              {QUADRANTS.map(q => (
                <button
                  type="button"
                  key={q.id}
                  onClick={() => setQuadrant(q.id)}
                  aria-pressed={quadrant === q.id}
                  className={`text-xs px-2 py-1 rounded-md border transition-all duration-300 ${
                    quadrant === q.id
                      ? 'bg-mood-accent text-mood-accent-on border-mood-accent shadow-[0_0_14px_-4px_var(--mood-accent-glow)]'
                      : 'bg-slate-50/60 dark:bg-slate-800/60 border-mood-border text-mood-text hover:bg-mood-accent-soft'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            共 {filtered.length} 首匹配 · 点行打开详情
          </div>

          <div className="border border-mood-border rounded-lg overflow-hidden">
            {filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-500">还没有匹配的歌曲</div>
            )}
            {filtered.map((t, idx) => {
              const fb = feedbackMap[t.id];
              const isSelected = selected?.id === t.id;
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  aria-selected={isSelected}
                  className={`flex items-center gap-3 px-4 py-2 text-sm border-b last:border-b-0 border-mood-border transition-colors cursor-pointer ${
                    isSelected ? 'bg-mood-accent-soft' : 'hover:bg-mood-accent-soft/40'
                  }`}
                  onClick={() => openDetail(t)}
                  onKeyDown={(event) => handleDetailKeyDown(event, t)}
                  title={t.title}
                >
                  <span className="font-mono text-xs opacity-50 w-8 shrink-0">{idx + 1}</span>
                  <span className="flex-1 truncate text-mood-text">{t.title}</span>
                  {fb === 'like' && <ThumbsUp size={11} className="text-mood-accent shrink-0"/>}
                  {fb === 'dislike' && <ThumbsDown size={11} className="text-red-500 shrink-0"/>}
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    V {t.v?.toFixed(1)} / A {t.a?.toFixed(1)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePlay(idx); }}
                    className="p-1 rounded text-mood-accent hover:bg-mood-accent-soft shrink-0"
                    title="播放"
                    aria-label={`播放 ${t.title || '曲目'}`}
                  >
                    <Play size={14}/>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 详情面板 */}
        {selected && (
          <div className="glass border border-mood-border rounded-xl p-4 flex flex-col gap-3 lg:sticky lg:top-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-mood-text">
                <Info size={14} className="text-mood-accent transition-colors duration-500"/>
                曲目详情
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="p-1 rounded text-slate-400 hover:text-mood-text hover:bg-mood-accent-soft"
                aria-label="关闭"
                title="关闭详情"
              >
                <X size={14}/>
              </button>
            </div>

            <div className="text-mood-text text-sm font-medium leading-snug break-words">{selected.title}</div>

            {detailLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 size={12} className="animate-spin"/> 加载中
              </div>
            )}

            {detail && !detail.error && (
              <>
                <div className="flex justify-center py-2">
                  <VinylDisc
                    trackId={selected.id}
                    cover={detail.cover || undefined}
                    playing={false}
                    size={220}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-100/60 dark:bg-slate-800/60 rounded-md px-2 py-1">
                    <div className="text-[10px] text-slate-500">艺术家</div>
                    <div className="text-mood-text truncate">{detail.artist}</div>
                  </div>
                  <div className="bg-slate-100/60 dark:bg-slate-800/60 rounded-md px-2 py-1">
                    <div className="text-[10px] text-slate-500">专辑</div>
                    <div className="text-mood-text truncate">{detail.album}</div>
                  </div>
                  <div className="bg-slate-100/60 dark:bg-slate-800/60 rounded-md px-2 py-1">
                    <div className="text-[10px] text-slate-500">Valence</div>
                    <div className="font-mono text-mood-text">{selected.v?.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-100/60 dark:bg-slate-800/60 rounded-md px-2 py-1">
                    <div className="text-[10px] text-slate-500">Arousal</div>
                    <div className="font-mono text-mood-text">{selected.a?.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-100/60 dark:bg-slate-800/60 rounded-md px-2 py-1 sm:col-span-2">
                    <div className="text-[10px] text-slate-500">文件</div>
                    <div className="font-mono text-mood-text text-[10px] truncate" title={detail.path}>{detail.path}</div>
                  </div>
                </div>
              </>
            )}

            {detail?.error && (
              <div className="text-xs text-red-500">{detail.error}</div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => sendFeedback('like')}
                aria-pressed={feedbackMap[selected.id] === 'like'}
                className={`text-xs px-3 py-1.5 rounded-md border flex items-center gap-1 justify-center transition-all duration-300 ${
                  feedbackMap[selected.id] === 'like'
                    ? 'bg-mood-accent text-mood-accent-on border-mood-accent'
                    : 'border-mood-border text-mood-text hover:bg-mood-accent-soft'
                }`}
              >
                <ThumbsUp size={12}/> 喜欢
              </button>
              <button
                type="button"
                onClick={() => sendFeedback('dislike')}
                aria-pressed={feedbackMap[selected.id] === 'dislike'}
                className={`text-xs px-3 py-1.5 rounded-md border flex items-center gap-1 justify-center transition-all duration-300 ${
                  feedbackMap[selected.id] === 'dislike'
                    ? 'bg-red-500 text-white border-red-500'
                    : 'border-mood-border text-mood-text hover:bg-red-500/10'
                }`}
              >
                <ThumbsDown size={12}/> 不喜欢
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { const realIdx = tracks.findIndex(t => t.id === selected.id); if (realIdx >= 0) handleChartClick(realIdx); }}
                className="text-xs px-3 py-1.5 rounded-md bg-mood-accent text-mood-accent-on hover:brightness-110 flex items-center gap-1 justify-center transition-all duration-300 shadow-[0_0_18px_-4px_var(--mood-accent-glow)]"
              >
                <Play size={12}/> 播放
              </button>
              <button
                type="button"
                onClick={reanalyzeOne}
                disabled={actionBusy}
                className="text-xs px-3 py-1.5 rounded-md border border-mood-border text-mood-text hover:bg-mood-accent-soft disabled:opacity-50 flex items-center gap-1 justify-center transition-colors"
              >
                {actionBusy ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} 重新分析
              </button>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => deleteOne(false)}
                  disabled={actionBusy}
                  className="flex-1 text-xs px-3 py-1.5 rounded-md border border-mood-border text-mood-text hover:bg-red-500/10 hover:border-red-500/40 disabled:opacity-50 flex items-center gap-1 justify-center transition-colors"
                >
                  <Trash2 size={12}/> 从库删除
                </button>
                <button
                  type="button"
                  onClick={() => deleteOne(true)}
                  disabled={actionBusy}
                  className="flex-1 text-xs px-3 py-1.5 rounded-md border border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50 flex items-center gap-1 justify-center transition-colors"
                >
                  <Trash2 size={12}/> 删除文件
                </button>
              </div>
            </div>

            {actionMsg && (
              <div className="text-xs text-slate-500 dark:text-slate-400">{actionMsg}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LibraryPage;
