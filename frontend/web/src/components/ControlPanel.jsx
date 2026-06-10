import axios from 'axios';

import { useEffect, useState, useRef } from 'react';
import {
  ChevronDown, ChevronUp, CloudRain, Coffee, Flame, FolderOpen, Frown,
  Moon, Plus, Settings, Smile, Sun, Trash2, Zap, RefreshCw, Check
} from 'lucide-react';

import FolderBrowser from './FolderBrowser';

function ControlPanel({ onAddFolder, scanStatus, onExport, onOpenSettings, readOnly, isScanning }) {
  const [path, setPath] = useState('');
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [showScanTooltip, setShowScanTooltip] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // 预设区域折叠状态
  const [showPresets, setShowPresets] = useState(false);
  const tooltipRef = useRef(null);

  const loadDirectories = async () => {
    try {
      const res = await axios.get('/api/config/folders');
      setDirectories(res.data);
    } catch (e) {
      console.error('Failed to load directories', e);
    }
  };

  useEffect(() => {
    loadDirectories();
  }, []);

  const handleAddClick = async () => {
    if (!path) return;
    setIsAdding(true);
    const success = await onAddFolder(path);
    setIsAdding(false);
    if (success) {
      setPath('');
      loadDirectories();
    } else {
      alert('添加失败');
    }
  };

  const handleDelete = async id => {
    if (readOnly) return;
    if (!confirm('确定要移除该目录吗？(已扫描的歌曲暂不会删除)')) return;
    try {
      await axios.delete(`/api/config/folders?id=${id}`);
      loadDirectories();
    } catch {
      alert('删除失败');
    }
  };

  const handleRetry = async () => {
    if (readOnly || isRetrying) return;
    setIsRetrying(true);
    try {
      // 重新扫描所有已添加的目录（会重置已完成的歌曲状态并重新分析）
      const dirs = await axios.get('/api/config/folders');
      for (const d of dirs.data) {
        await axios.post('/api/config/folders', { path: d.path });
      }
    } catch (e) {
      console.error('Retry scan failed', e);
    } finally {
      setIsRetrying(false);
    }
  };

  const presets = [
    { label: '晨间', icon: <Sun size={14}/>, params: { time_hour: 8 } },
    { label: '午后', icon: <Flame size={14}/>, params: { time_hour: 14 } },
    { label: '傍晚', icon: <Coffee size={14}/>, params: { time_hour: 20 } },
    { label: '深夜', icon: <Moon size={14}/>, params: { time_hour: 23 } },
    { label: '快乐', icon: <Smile size={14}/>, params: { v: 8, a: 6.5 } },
    { label: '悲伤', icon: <CloudRain size={14}/>, params: { v: 2, a: 3 } },
    { label: '愤怒', icon: <Zap size={14}/>, params: { v: 3, a: 8 } },
    { label: '平静', icon: <Frown size={14}/>, params: { v: 5, a: 2 } }
  ];

  const completed = scanStatus.done + scanStatus.failed;
  const remaining = scanStatus.total > 0 ? scanStatus.total - completed : 0;

  // 点击外部关闭 tooltip
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setShowScanTooltip(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-lg mb-4 border border-gray-200 dark:border-slate-700">
        <div className="flex flex-col gap-4">
          {/* 添加目录 */}
          {/* 只读模式下隐藏添加功能 */}
          {!readOnly && (
            <div>
              <div className="flex gap-2 items-center mb-2">
                <div className="relative flex-1 group">
                  <FolderOpen
                    className="absolute left-3 top-2.5 text-gray-400 dark:text-slate-400 w-5 h-5 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors pointer-events-none"/>

                  <input
                    type="text"
                    placeholder="点击选择文件夹..."
                    value={path}
                    onClick={() => setIsBrowserOpen(true)}
                    readOnly
                    className="w-full bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-300 pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 focus:outline-none focus:border-blue-500 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  />
                </div>
                <button onClick={handleAddClick} disabled={isAdding}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-1">
                  {isAdding ? '...' : <><Plus size={16}/> 添加</>}
                </button>
              </div>

              {/* 已添加目录列表 */}
              <div className="max-h-24 overflow-y-auto space-y-1 mb-2 custom-scrollbar">
                {directories.map(d => (
                  <div key={d.id}
                    className="flex justify-between items-center bg-gray-100 dark:bg-slate-800/50 px-2 py-1 rounded text-xs text-gray-600 dark:text-slate-400 group hover:bg-gray-200 dark:hover:bg-slate-800">
                    <span className="truncate" title={d.path}>{d.path}</span>
                    <button onClick={() => handleDelete(d.id)}
                      className="text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
                {directories.length === 0
                  && <div className="text-center text-xs text-gray-500 dark:text-slate-600">暂无监控目录</div>}
              </div>
            </div>
          )}

          {/* 预设 (可折叠) */}
          <div className="border-t border-gray-200 dark:border-slate-700 pt-2">
            <div className="flex justify-between items-center mb-2">
              <div
                className="flex flex-1 items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded transition-colors select-none p-1"
                onClick={() => setShowPresets(!showPresets)}
              >
                {showPresets ? <ChevronUp size={14} className="text-gray-500 dark:text-slate-500"/>
                  : <ChevronDown size={14} className="text-gray-500 dark:text-slate-500"/>}
                <span className="text-xs text-gray-500 dark:text-slate-400 font-bold">快速预设导出</span>
              </div>

              <div className="flex items-center gap-1">
                {/* 扫描状态按钮 */}
                <div className="relative" ref={tooltipRef}>
                  <button
                    onClick={() => setShowScanTooltip(!showScanTooltip)}
                    className={`p-1.5 rounded-full transition-colors ${
                      isScanning
                        ? 'animate-spin text-blue-500'
                        : completed >= scanStatus.total && scanStatus.total > 0
                          ? 'text-green-500'
                          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                    title={isScanning ? '扫描中...' : '扫描状态'}
                  >
                    {isScanning ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : completed >= scanStatus.total && scanStatus.total > 0 ? (
                      <Check size={16} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                  </button>

                  {/* 悬浮提示框 */}
                  {showScanTooltip && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 p-3 z-50 animate-in fade-in duration-200">
                      <div className="text-xs font-bold text-gray-700 dark:text-slate-200 mb-2">
                        扫描状态
                      </div>
                      {/* 进度条 */}
                      <div className="bg-gray-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden flex mb-2">
                        {scanStatus.total > 0 && (
                          <>
                            <div
                              className="bg-green-500 h-full transition-all duration-300"
                              style={{ width: `${(scanStatus.done / scanStatus.total) * 100}%` }}
                            />
                            <div
                              className="bg-red-500 h-full transition-all duration-300"
                              style={{ width: `${(scanStatus.failed / scanStatus.total) * 100}%` }}
                            />
                          </>
                        )}
                      </div>
                      {/* 统计信息 */}
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-gray-600 dark:text-slate-400">
                          <span>总任务</span>
                          <span className="font-medium">{scanStatus.total}</span>
                        </div>
                        <div className="flex justify-between text-green-600 dark:text-green-400">
                          <span>成功</span>
                          <span className="font-medium">{scanStatus.done}</span>
                        </div>
                        <div className="flex justify-between text-red-500 dark:text-red-400">
                          <span>失败</span>
                          <span className="font-medium">{scanStatus.failed}</span>
                        </div>
                        {remaining > 0 && (
                          <div className="flex justify-between text-blue-600 dark:text-blue-400">
                            <span>剩余</span>
                            <span className="font-medium">{remaining}</span>
                          </div>
                        )}
                      </div>
                      {/* 重试按钮 */}
                      {completed >= scanStatus.total && scanStatus.total > 0 && !readOnly && (
                        <button
                          onClick={() => { handleRetry(); setShowScanTooltip(false); }}
                          disabled={isRetrying}
                          className="w-full mt-2 py-1.5 px-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1"
                        >
                          {isRetrying ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <RefreshCw size={12} />
                          )}
                          {scanStatus.failed > 0 ? '重试失败项' : '重新扫描'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button onClick={onOpenSettings} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500 dark:text-slate-400" title="设置">
                  <Settings size={16} />
                </button>
              </div>
            </div>

            {showPresets && (
              <div className="grid grid-cols-4 gap-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                {presets.map((p, i) => (
                  <button key={i} onClick={() => onExport({ ...p.params })}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-2 rounded text-xs flex items-center justify-center gap-2 text-gray-700 dark:text-slate-200 transition-colors whitespace-nowrap overflow-hidden">
                    {p.icon} <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!readOnly && (
        <FolderBrowser
          isOpen={isBrowserOpen}
          initialPath={path}
          onClose={() => setIsBrowserOpen(false)}
          onSelect={selectedPath => {
            setPath(selectedPath);
            setIsBrowserOpen(false);
          }}
        />
      )}
    </>
  );
}

export default ControlPanel;
