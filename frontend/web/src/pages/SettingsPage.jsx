import { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

import ControlPanel from '../components/ControlPanel';
import SettingsModal from '../components/SettingsModal';
import { useAppState } from '../contexts/AppStateContext';

function SettingsPage() {
  const {
    scanStatus,
    isScanningUI,
    appSettings,
    handleAddFolder,
    handleExportPreset,
    handleSaveSettings
  } = useAppState();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <div className="bg-mood-card border border-mood-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <SettingsIcon size={18} className="text-blue-500"/>
          <h1 className="text-lg font-bold text-mood-text">设置</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          管理监控目录、推荐参数与隐私选项。新上传的音乐统一保存在
          <code className="mx-1 px-1 rounded bg-slate-200 dark:bg-slate-700">Music_Directory/</code>。
        </p>
      </div>

      <ControlPanel
        onAddFolder={handleAddFolder}
        scanStatus={scanStatus}
        onExport={handleExportPreset}
        onOpenSettings={() => setShowSettings(true)}
        readOnly={scanStatus.readOnly}
        isScanning={isScanningUI}
      />

      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          initialSettings={appSettings}
        />
      )}
    </div>
  );
}

export default SettingsPage;
