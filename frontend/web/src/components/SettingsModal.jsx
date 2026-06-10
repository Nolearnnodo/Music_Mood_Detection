import React, { useState } from 'react';

import { Save, X } from 'lucide-react';

function SettingsModal({ isOpen, onClose, onSave, initialSettings }) {
  const [settings, setSettings] = useState(initialSettings);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-xl shadow-2xl border border-gray-200 dark:border-slate-600 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">生成设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Limit Count */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
              最大歌曲数量 (Limit)
            </label>
            <input
              type="number" min="5" max="5000"
              value={settings.limit}
              onChange={e => handleChange('limit', Number.parseInt(e.target.value, 10) || 50)}
              className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Duration Limit */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
              最大播放时长 (分钟, 0为不限制)
            </label>
            <input
              type="number" min="0" max="600"
              value={settings.durationLimit}
              onChange={e => handleChange('durationLimit', Number.parseInt(e.target.value, 10) || 0)}
              className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded px-3 py-2 text-sm"
            />
            <p className="text-[10px] text-gray-500">将按相似度优先选取，直到总时长超过设定值。</p>
          </div>

          {/* Default Radius */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
              默认相似半径 (Radius)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range" min="0.1" max="4.0" step="0.1"
                value={settings.defaultRadius}
                onChange={e => handleChange('defaultRadius', Number.parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-sm font-mono w-8">{settings.defaultRadius.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white">取消</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
            <Save size={16}/> 保存设置
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
