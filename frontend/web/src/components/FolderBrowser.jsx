import axios from 'axios';

import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUp, Check, File, Folder, HardDrive, Loader2, X } from 'lucide-react';

function FolderBrowser({ isOpen, onClose, onSelect, initialPath }) {
  const [currentPath, setCurrentPath] = useState(''); // 实际生效的路径
  const [inputPath, setInputPath] = useState(''); // 输入框里的文本
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // 初始化：打开时加载初始路径
  useEffect(() => {
    if (isOpen) {
      const p = initialPath || '';
      setCurrentPath(p);
      setInputPath(p);
    }
  }, [isOpen]); // 注意：这里不要依赖 initialPath，只在 open 变动时触发

  const loadPath = async path => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/fs/browse?path=${encodeURIComponent(path)}`);

      // 排序逻辑：.. 最前 -> 文件夹 -> 文件
      const sorted = res.data.sort((a, b) => {
        if (a.name === '..') return -1;
        if (b.name === '..') return 1;
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setItems(sorted);
    } catch (e) {
      console.error('Failed to load path', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // 监听 currentPath 变化并加载数据
  useEffect(() => {
    if (!isOpen) return;
    loadPath(currentPath);
    setInputPath(currentPath); // 同步更新输入框
  }, [currentPath, isOpen]);

  const handleNavigate = item => {
    if (item.is_dir) {
      // 如果是 ".."，后端返回的 path 已经是上一级路径了，直接用即可
      // 如果是盘符列表里的项，直接用
      setCurrentPath(item.path);
    }
  };

  // 手动输入路径后跳转
  const handleManualGo = () => {
    let p = inputPath.trim();
    // 简单的格式修正，比如把 \ 换成 /
    p = p.replaceAll('\\', '/');
    if (p.endsWith('/')) p = p.slice(0, -1);
    setCurrentPath(p);
  };

  // 向上按钮逻辑
  const handleUpLevel = () => {
    if (!currentPath) return; // 已经在盘符列表

    // 检查是否是 Windows 根目录 (例如 "C:/" 或 "C:")
    if (/^[a-z]:\/?$/i.test(currentPath)) {
      setCurrentPath(''); // 回到盘符选择
      return;
    }

    // 检查是否是 Linux 根目录
    if (currentPath === '/') {
      setCurrentPath(''); // 回到空（或者保持不变，视需求而定）
      return;
    }

    // 其他情况：尝试去上一级
    // 优先寻找列表里的 ".." 项，因为那是后端计算好的准确父路径
    const parentItem = items.find(i => i.name === '..');
    if (parentItem) {
      setCurrentPath(parentItem.path);
    } else {
      // 如果列表中没有 ".." (比如空文件夹)，则进行字符串截取
      const parts = currentPath.split('/');
      parts.pop(); // 移除最后一级
      const newPath = parts.join('/') || (currentPath.startsWith('/') ? '/' : '');
      setCurrentPath(newPath);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
      <div
        className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 dark:border-slate-600 flex flex-col h-[80vh]">

        {/* 1. Header & Toolbar */}
        <div className="p-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 rounded-t-xl flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h3 className="text-gray-900 dark:text-white font-bold flex items-center gap-2">
              <Folder size={18} className="text-blue-500 dark:text-blue-400"/>
              选择文件夹
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white"><X size={20}/></button>
          </div>

          {/* 地址栏区域 */}
          <div className="flex gap-2">
            <button
              onClick={handleUpLevel}
              className="p-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded text-gray-600 dark:text-slate-300 disabled:opacity-50"
              title="向上"
              disabled={!currentPath}
            >
              <ArrowUp size={16}/>
            </button>

            <div className="flex-1 relative">
              <input
                type="text"
                value={inputPath}
                onChange={e => setInputPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualGo()}
                className="w-full bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none font-mono"
                placeholder="在此输入路径..."
              />
            </div>

            <button
              onClick={handleManualGo}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              title="跳转"
            >
              <ArrowRight size={16}/>
            </button>
          </div>
        </div>

        {/* 2. File List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-white dark:bg-slate-800">
          {loading ? (
            <div className="flex h-full items-center justify-center text-gray-500 dark:text-slate-500 gap-2">
              <Loader2 className="animate-spin"/> 加载中...
            </div>
          ) : (
            <>
              {items.length === 0 && !loading && (
                <div
                  className="text-center text-gray-500 dark:text-slate-500 py-10 select-none">此文件夹为空或无法访问</div>
              )}

              {items.map((item, idx) => {
                const isParent = item.name === '..';
                return (
                  <div
                    key={idx}
                    onClick={() => handleNavigate(item)}
                    className={`
                                    flex items-center gap-3 p-2 rounded cursor-pointer transition-colors border border-transparent
                                    ${item.is_dir ? 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200' : 'opacity-50 cursor-default text-gray-400 dark:text-slate-500'}
                                    ${isParent ? 'bg-gray-100/50 dark:bg-slate-700/50 border-gray-200 dark:border-slate-700 mb-1' : ''}
                                `}
                  >
                    {/* 图标逻辑 */}
                    <div className="shrink-0 w-6 flex justify-center">
                      {isParent ? (
                        <ArrowUp className="text-blue-600 dark:text-blue-400" size={18}/>
                      ) : currentPath
                        ? item.is_dir
                          ? (
                            <Folder className="text-yellow-600 dark:text-yellow-500" size={18}/>
                          )
                          : (
                            <File size={16}/>
                          )
                        : (
                          <HardDrive className="text-emerald-600 dark:text-emerald-500" size={18}/>
                        )}
                    </div>

                    <span className="text-sm truncate flex-1 font-medium">
                      {isParent ? '返回上一级' : item.name}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* 3. Footer */}
        <div
          className="p-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 rounded-b-xl flex justify-between items-center">
          <div className="text-xs text-gray-500 dark:text-slate-500 truncate max-w-[50%]">
            {currentPath || '此电脑'}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white">取消
            </button>
            <button
              onClick={() => onSelect(currentPath)}
              disabled={!currentPath}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:text-gray-500 dark:disabled:text-slate-500 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Check size={16}/> 确定选择
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FolderBrowser;
