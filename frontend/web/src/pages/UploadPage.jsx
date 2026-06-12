import axios from 'axios';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, FolderOpen, Loader2, Upload } from 'lucide-react';

import { useAppState } from '../contexts/AppStateContext';

const ALLOWED_EXTS = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.ape', '.wma', '.wv', '.aiff'];
const MAX_FILE_MB = 100;

function isAllowed(name) {
  const lower = name.toLowerCase();
  return ALLOWED_EXTS.some(ext => lower.endsWith(ext));
}

function UploadPage() {
  const inputRef = useRef(null);
  const { fetchTracks, refreshScanStatus } = useAppState();
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState([]); // { name, status: pending|uploading|done|error, msg }
  const [busy, setBusy] = useState(false);

  const addFiles = files => {
    const next = [];
    for (const f of files) {
      if (!isAllowed(f.name)) {
        next.push({ name: f.name, file: f, status: 'error', msg: '不支持的格式' });
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        next.push({ name: f.name, file: f, status: 'error', msg: `超过 ${MAX_FILE_MB}MB` });
        continue;
      }
      next.push({ name: f.name, file: f, status: 'pending', msg: '' });
    }
    setItems(prev => [...prev, ...next]);
  };

  const handleDrop = e => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  };

  const handlePick = e => {
    if (e.target.files?.length) addFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleUpload = async () => {
    const queue = items.filter(it => it.status === 'pending');
    if (!queue.length) return;
    setBusy(true);

    for (const item of queue) {
      setItems(prev => prev.map(it => it === item ? { ...it, status: 'uploading' } : it));
      try {
        const form = new FormData();
        form.append('file', item.file, item.name);
        const res = await axios.post('/api/music/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setItems(prev => prev.map(it => it === item ? {
          ...it,
          status: 'done',
          msg: res.data?.relative_path || '已加入分析队列'
        } : it));
      } catch (e) {
        const msg = e.response?.data?.error || e.message || '上传失败';
        setItems(prev => prev.map(it => it === item ? { ...it, status: 'error', msg } : it));
      }
    }

    setBusy(false);
    await fetchTracks();
    refreshScanStatus();
  };

  const handleClear = () => setItems([]);
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const doneCount = items.filter(i => i.status === 'done').length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <div className="bg-mood-card border border-mood-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Upload size={18} className="text-blue-500"/>
          <h1 className="text-lg font-bold text-mood-text">上传音乐</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          上传后会保存到项目内 <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">Music_Directory/</code>，并自动加入分析队列。
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-mood-border bg-mood-card hover:bg-slate-50 dark:hover:bg-slate-800/50'
        }`}
      >
        <FolderOpen size={32} className="mx-auto text-blue-500 mb-3"/>
        <div className="text-sm text-mood-text font-medium mb-1">点击或拖拽文件到此处</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          支持 {ALLOWED_EXTS.join(' / ')}，单文件 ≤ {MAX_FILE_MB}MB
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTS.join(',')}
          className="hidden"
          onChange={handlePick}
        />
      </div>

      {items.length > 0 && (
        <div className="bg-mood-card border border-mood-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-mood-text">
              待上传 {pendingCount} · 已完成 {doneCount} · 共 {items.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClear}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-md border border-mood-border text-mood-text hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                清空
              </button>
              <button
                onClick={handleUpload}
                disabled={busy || pendingCount === 0}
                className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 flex items-center gap-1"
              >
                {busy && <Loader2 size={12} className="animate-spin"/>}
                开始上传
              </button>
            </div>
          </div>

          <div className="border border-mood-border rounded-lg overflow-hidden">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 border-mood-border text-sm"
              >
                <div className="w-5 shrink-0">
                  {it.status === 'pending' && <span className="text-slate-400 text-xs">等待</span>}
                  {it.status === 'uploading' && <Loader2 size={14} className="text-blue-500 animate-spin"/>}
                  {it.status === 'done' && <CheckCircle2 size={14} className="text-emerald-500"/>}
                  {it.status === 'error' && <AlertCircle size={14} className="text-red-500"/>}
                </div>
                <span className="flex-1 truncate text-mood-text" title={it.name}>{it.name}</span>
                <span className={`text-xs shrink-0 ${
                  it.status === 'error' ? 'text-red-500' :
                    it.status === 'done' ? 'text-emerald-500' :
                      'text-slate-500'
                }`} title={it.msg}>
                  {it.msg || it.status}
                </span>
              </div>
            ))}
          </div>

          {doneCount > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              已加入分析队列。可前往
              <Link to="/library" className="text-blue-600 dark:text-blue-400 hover:underline mx-1">音乐库</Link>
              查看进度，或回到
              <Link to="/radio" className="text-blue-600 dark:text-blue-400 hover:underline mx-1">电台</Link>
              。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadPage;
