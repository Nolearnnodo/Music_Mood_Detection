import { NavLink } from 'react-router-dom';
import {
  Laptop, ListMusic, MessageCircle, Moon, Music, NotebookText, Radio,
  Settings as SettingsIcon, Sparkles, Sun, Upload, Users
} from 'lucide-react';
import clsx from 'clsx';

import { useAppState } from '../contexts/AppStateContext';

const NAV_ITEMS = [
  { to: '/radio', label: '电台', icon: Radio },
  { to: '/chat', label: '聊天', icon: MessageCircle },
  { to: '/library', label: '音乐库', icon: ListMusic },
  { to: '/upload', label: '上传', icon: Upload },
  { to: '/mood', label: '情绪图谱', icon: Sparkles },
  { to: '/journal', label: '心情日志', icon: NotebookText },
  { to: '/community', label: '群体此刻', icon: Users },
  { to: '/settings', label: '设置', icon: SettingsIcon }
];

function TopNav() {
  const { theme, toggleTheme, scanStatus, isScanningUI } = useAppState();
  const completed = scanStatus.done + scanStatus.failed;
  const percentage = scanStatus.total > 0 ? Math.round((completed / scanStatus.total) * 100) : 0;
  const themeLabel = theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统';

  return (
    <header className="glass border-b border-mood-border px-3 sm:px-4 md:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-10">
      <div className="flex items-center gap-2 shrink-0">
        <Music className="text-mood-accent transition-colors duration-500" size={22}/>
        <span className="font-display text-lg text-mood-text whitespace-nowrap tracking-wide">
          Mood Radio
        </span>
      </div>

      <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto overscroll-x-contain custom-scrollbar px-1 -mx-1" aria-label="主导航">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            aria-label={label}
            className={({ isActive }) => clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors duration-300 whitespace-nowrap shrink-0',
              isActive
                ? 'bg-mood-accent text-mood-accent-on shadow-[0_0_18px_-2px_var(--mood-accent-glow)]'
                : 'text-mood-text hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
            )}
          >
            <Icon size={14}/>
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-3 shrink-0">
        {scanStatus.total > 0 && (
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{isScanningUI ? '扫描中' : '曲库'}</span>
            <div
              className="w-20 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={scanStatus.total}
              aria-valuenow={completed}
              aria-label="曲库扫描进度"
            >
              <div className="h-full bg-mood-accent transition-all duration-500"
                style={{ width: `${percentage}%` }}/>
            </div>
            <span className="font-mono">{completed}/{scanStatus.total}</span>
          </div>
        )}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-mood-card border border-mood-border hover:bg-mood-accent-soft active:scale-95 transition-all"
          title={`切换主题，当前${themeLabel}`}
          aria-label={`切换主题，当前${themeLabel}`}
        >
          {theme === 'light' && <Sun size={16}/>}
          {theme === 'dark' && <Moon size={16}/>}
          {theme === 'system' && <Laptop size={16}/>}
        </button>
      </div>
    </header>
  );
}

export default TopNav;
