import { useMemo, useState } from 'react';
import { Filter, ListMusic, Play, Search } from 'lucide-react';

import { useAppState } from '../contexts/AppStateContext';

const QUADRANTS = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'happy', label: '高愉悦/高能量', test: t => t.v >= 5 && t.a >= 5 },
  { id: 'angry', label: '低愉悦/高能量', test: t => t.v < 5 && t.a >= 5 },
  { id: 'sad', label: '低愉悦/低能量', test: t => t.v < 5 && t.a < 5 },
  { id: 'calm', label: '高愉悦/低能量', test: t => t.v >= 5 && t.a < 5 }
];

function LibraryPage() {
  const { tracks, handleChartClick, scanStatus } = useAppState();
  const [search, setSearch] = useState('');
  const [quadrant, setQuadrant] = useState('all');

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

      <div className="glass border border-mood-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none"/>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="按歌名搜索..."
              className="w-full bg-slate-50/60 dark:bg-slate-800/60 text-mood-text pl-9 pr-3 py-2 rounded-lg border border-mood-border focus:outline-none focus:border-mood-accent focus:ring-2 focus:ring-mood-accent-soft text-sm transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-slate-400"/>
            {QUADRANTS.map(q => (
              <button
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

        <div className="text-xs text-slate-500 dark:text-slate-400">
          共 {filtered.length} 首匹配
        </div>

        <div className="border border-mood-border rounded-lg overflow-hidden">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-500">还没有匹配的歌曲</div>
          )}
          {filtered.map((t, idx) => (
            <button
              key={t.id}
              onClick={() => handlePlay(idx)}
              className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm hover:bg-mood-accent-soft border-b last:border-b-0 border-mood-border transition-colors"
              title={t.title}
            >
              <span className="font-mono text-xs opacity-50 w-8 shrink-0">{idx + 1}</span>
              <span className="flex-1 truncate text-mood-text">{t.title}</span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                V {t.v?.toFixed(1)} / A {t.a?.toFixed(1)}
              </span>
              <Play size={14} className="text-mood-accent shrink-0 transition-colors duration-500"/>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LibraryPage;
