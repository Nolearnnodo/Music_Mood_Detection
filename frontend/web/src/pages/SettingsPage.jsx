import axios from 'axios';
import { useEffect, useState } from 'react';
import { Brain, CheckCircle2, Eye, EyeOff, Loader2, RefreshCw, Settings as SettingsIcon, Wand2 } from 'lucide-react';

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
    handleSaveSettings,
    fetchTracks
  } = useAppState();
  const [showSettings, setShowSettings] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeMsg, setReanalyzeMsg] = useState('');

  // LLM 配置
  const DEFAULT_LLM = { base_url: 'https://api.deepseek.com/v1', api_key: '', model: 'deepseek-chat' };
  const [llmConfig, setLlmConfig] = useState(() => {
    try { return { ...DEFAULT_LLM, ...JSON.parse(localStorage.getItem('llm_config') || '{}') }; }
    catch { return DEFAULT_LLM; }
  });
  const [showKey, setShowKey] = useState(false);
  const [llmSavedAt, setLlmSavedAt] = useState(0);

  const updateLLM = (key, value) => setLlmConfig(prev => ({ ...prev, [key]: value }));
  const saveLLM = () => {
    localStorage.setItem('llm_config', JSON.stringify(llmConfig));
    setLlmSavedAt(Date.now());
  };

  // 进入页面时同步一次 reanalyze 状态(可能其他页面已经触发了)
  useEffect(() => {
    axios.get('/api/music/reanalyze/status')
      .then(res => setReanalyzing(!!res.data?.running))
      .catch(() => {});
  }, []);

  // 进行中时轮询状态
  useEffect(() => {
    if (!reanalyzing) return;
    const t = setInterval(async () => {
      try {
        const r = await axios.get('/api/music/reanalyze/status');
        if (!r.data?.running) {
          setReanalyzing(false);
          setReanalyzeMsg('全库分析完成');
          await fetchTracks();
        }
      } catch { /* keep trying */ }
    }, 2000);
    return () => clearInterval(t);
  }, [reanalyzing, fetchTracks]);

  const triggerReanalyze = async (full) => {
    try {
      setReanalyzeMsg('');
      await axios.post(`/api/music/reanalyze${full ? '?full=true' : ''}`);
      setReanalyzing(true);
    } catch (e) {
      if (e.response?.status === 409) {
        setReanalyzing(true);
        setReanalyzeMsg('已有分析在进行中');
      } else {
        setReanalyzeMsg(`触发失败:${e.response?.data?.error || e.message}`);
      }
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4 pb-8">
      <div className="glass border border-mood-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <SettingsIcon size={18} className="text-mood-accent transition-colors duration-500"/>
          <h1 className="font-display text-xl text-mood-text tracking-wide">设置</h1>
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

      <div className="glass border border-mood-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-mood-text">
          <Wand2 size={16} className="text-mood-accent transition-colors duration-500"/> 情绪重新分析
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          后端 ncnn 推理目前会写入异常 V/A,所以本应用用 <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">scripts/analyze_all.py</code>
          (ONNX Runtime + librosa) 重新计算。上传后会自动触发增量分析,这里也可以手动触发。
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => triggerReanalyze(false)}
            disabled={reanalyzing}
            className="text-xs px-3 py-1.5 rounded-md bg-mood-accent text-mood-accent-on hover:brightness-110 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:hover:brightness-100 flex items-center gap-1 transition-all duration-300 shadow-[0_0_18px_-4px_var(--mood-accent-glow)]"
          >
            {reanalyzing
              ? <Loader2 size={12} className="animate-spin"/>
              : <RefreshCw size={12}/>}
            只分析待处理曲目
          </button>
          <button
            onClick={() => triggerReanalyze(true)}
            disabled={reanalyzing}
            className="text-xs px-3 py-1.5 rounded-md border border-mood-border text-mood-text hover:bg-mood-accent-soft disabled:opacity-50 flex items-center gap-1 transition-colors"
          >
            重新分析全库
          </button>
        </div>
        {reanalyzeMsg && (
          <div className="text-xs text-slate-500 dark:text-slate-400">{reanalyzeMsg}</div>
        )}
      </div>

      <div className="glass border border-mood-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-mood-text">
          <Brain size={16} className="text-mood-accent transition-colors duration-500"/> AI 聊天大模型配置
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          /chat 页用到的 LLM。支持任何 OpenAI 兼容接口(DeepSeek、智谱、OpenAI、本地 Ollama 等)。
          Key 仅保存在本机 localStorage,不上传服务器,请求时由后端转发到你填写的 Base URL。
        </p>

        <label className="text-xs flex flex-col gap-1">
          <span className="text-slate-500 dark:text-slate-400">Base URL</span>
          <input
            type="text"
            value={llmConfig.base_url}
            onChange={e => updateLLM('base_url', e.target.value)}
            placeholder="https://api.deepseek.com/v1"
            className="bg-slate-50/60 dark:bg-slate-800/60 text-mood-text px-3 py-2 rounded-lg border border-mood-border focus:outline-none focus:border-mood-accent focus:ring-2 focus:ring-mood-accent-soft text-sm transition-colors"
          />
        </label>

        <label className="text-xs flex flex-col gap-1">
          <span className="text-slate-500 dark:text-slate-400">API Key</span>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={llmConfig.api_key}
              onChange={e => updateLLM('api_key', e.target.value)}
              placeholder="sk-..."
              className="w-full bg-slate-50/60 dark:bg-slate-800/60 text-mood-text px-3 py-2 pr-10 rounded-lg border border-mood-border focus:outline-none focus:border-mood-accent focus:ring-2 focus:ring-mood-accent-soft text-sm font-mono transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-mood-accent transition-colors"
              aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
            >
              {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
          </div>
        </label>

        <label className="text-xs flex flex-col gap-1">
          <span className="text-slate-500 dark:text-slate-400">Model</span>
          <input
            type="text"
            value={llmConfig.model}
            onChange={e => updateLLM('model', e.target.value)}
            placeholder="deepseek-chat"
            className="bg-slate-50/60 dark:bg-slate-800/60 text-mood-text px-3 py-2 rounded-lg border border-mood-border focus:outline-none focus:border-mood-accent focus:ring-2 focus:ring-mood-accent-soft text-sm font-mono transition-colors"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={saveLLM}
            className="text-xs px-3 py-1.5 rounded-md bg-mood-accent text-mood-accent-on hover:brightness-110 flex items-center gap-1 transition-all duration-300 shadow-[0_0_18px_-4px_var(--mood-accent-glow)]"
          >
            保存配置
          </button>
          {llmSavedAt > 0 && Date.now() - llmSavedAt < 3000 && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <CheckCircle2 size={12}/> 已保存
            </span>
          )}
        </div>
      </div>

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
