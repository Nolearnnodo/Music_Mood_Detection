import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, Brain, ListMusic, Loader2, MessageCircle, Play, Send, Sparkles
} from 'lucide-react';

import { useAppState } from '../contexts/AppStateContext';

const SUGGESTIONS = [
  '今天有点焦虑,想听点能让我平静下来的歌',
  '工作累了一天,需要放松',
  '心情很好,想听点带劲的',
  '失眠想听些温柔的'
];

function getLLMConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem('llm_config') || '{}');
    return {
      base_url: stored.base_url || 'https://api.deepseek.com/v1',
      api_key: stored.api_key || '',
      model: stored.model || 'deepseek-chat'
    };
  } catch {
    return { base_url: 'https://api.deepseek.com/v1', api_key: '', model: 'deepseek-chat' };
  }
}

function ChatPage() {
  const { handleChatRecommendation, emotionPlaylist, handleEmotionPlay } = useAppState();
  const [messages, setMessages] = useState([]); // { role, content, mood?, target?, tracks? }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setError('');

    const cfg = getLLMConfig();
    if (!cfg.api_key) {
      setError('还没填 LLM API Key。请到 /settings 配置后再试。');
      return;
    }

    const newUserMsg = { role: 'user', content: text };
    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      // 只把最近 6 条上下文丢给 LLM,省 token
      const ctx = newMessages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res = await axios.post('/api/chat', {
        messages: ctx,
        config: cfg
      });
      const data = res.data;
      if (data.error) {
        setError(data.hint ? `${data.error} (${data.hint})` : data.error);
        setLoading(false);
        return;
      }

      // 触发推荐(handleChatRecommendation 会写 emotionPlaylist)
      await handleChatRecommendation(data);

      const assistantMsg = {
        role: 'assistant',
        content: data.reply || '',
        mood: data.mood,
        target: data.target
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || '请求失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4 h-full pb-36">
      <div className="glass border border-mood-border rounded-xl p-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle size={18} className="text-mood-accent transition-colors duration-500"/>
          <h1 className="font-display text-xl text-mood-text tracking-wide">聊天推荐</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          描述你现在的状态,我会识别情绪并从本地曲库挑歌。Key 在 <Link to="/settings" className="text-mood-accent hover:underline">设置页</Link> 配置。
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-[200px] overflow-y-auto custom-scrollbar flex flex-col gap-3 px-1"
      >
        {messages.length === 0 && (
          <div className="glass border border-mood-border rounded-xl p-6 text-center flex flex-col items-center gap-3">
            <Sparkles size={28} className="text-mood-accent transition-colors duration-500"/>
            <div className="text-mood-text font-medium">从下面这些开始试试</div>
            <div className="flex flex-col gap-2 w-full max-w-md">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-mood-border bg-slate-50/40 dark:bg-slate-800/40 hover:bg-mood-accent-soft hover:border-mood-accent/60 text-mood-text transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="self-end max-w-[80%] rounded-2xl rounded-br-md px-4 py-2 bg-mood-accent text-mood-accent-on text-sm shadow-[0_0_18px_-6px_var(--mood-accent-glow)]">
              {m.content}
            </div>
          ) : (
            <div key={i} className="self-start max-w-[90%] flex flex-col gap-2">
              <div className="glass border border-mood-border rounded-2xl rounded-bl-md px-4 py-3 text-sm text-mood-text">
                {m.content}
              </div>
              {m.mood && m.target && (
                <div className="glass border border-mood-accent/30 rounded-xl px-3 py-2 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span><Brain size={11} className="inline mr-1 text-mood-accent"/>识别 <strong className="text-mood-text">{m.mood.label}</strong> ({(m.mood.confidence * 100).toFixed(0)}%)</span>
                  <span>目标 <span className="font-mono text-mood-text">V {m.target.valence.toFixed(1)} / A {m.target.arousal.toFixed(1)}</span></span>
                  <span>策略 {m.target.strategy === 'comfort' ? '安抚' : '匹配'}</span>
                </div>
              )}
            </div>
          )
        ))}

        {loading && (
          <div className="self-start glass border border-mood-border rounded-2xl rounded-bl-md px-4 py-3 text-sm text-mood-text flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-mood-accent"/> 思考中...
          </div>
        )}

        {error && (
          <div className="self-stretch bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14}/> {error}
          </div>
        )}

        {/* 当 LLM 推完后,emotionPlaylist 已经有歌。给一个一键播放的快捷入口 */}
        {!loading && lastAssistant && emotionPlaylist.length > 0 && (
          <div className="self-start max-w-[90%] glass border border-mood-accent/30 rounded-xl p-3 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <ListMusic size={12}/> 推荐歌单 ({emotionPlaylist.length} 首)
              </span>
              <button
                onClick={() => handleEmotionPlay(0)}
                className="text-mood-accent hover:underline flex items-center gap-1"
              >
                <Play size={12}/> 一键播放
              </button>
            </div>
            <div className="max-h-32 overflow-y-auto custom-scrollbar border border-mood-border rounded-md">
              {emotionPlaylist.slice(0, 8).map((t, idx) => (
                <button
                  key={`${t.id}-${idx}`}
                  onClick={() => handleEmotionPlay(idx)}
                  className="w-full text-left px-2 py-1.5 text-[11px] border-b last:border-b-0 border-mood-border hover:bg-mood-accent-soft text-mood-text transition-colors"
                  title={t.title || t.path}
                >
                  <span className="font-mono opacity-60 mr-1.5">{idx + 1}.</span>
                  {t.title || t.path}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(); }}
        className="glass border border-mood-border rounded-xl p-2 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="今天感觉怎么样?"
          disabled={loading}
          className="flex-1 bg-transparent text-mood-text px-3 py-2 text-sm focus:outline-none placeholder:text-slate-400"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3 py-2 rounded-lg bg-mood-accent text-mood-accent-on hover:brightness-110 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:hover:brightness-100 transition-all duration-300 shadow-[0_0_18px_-4px_var(--mood-accent-glow)]"
          aria-label="发送"
        >
          {loading ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
        </button>
      </form>
    </div>
  );
}

export default ChatPage;
