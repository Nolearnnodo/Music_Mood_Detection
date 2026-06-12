import { MessageCircle, Sparkles } from 'lucide-react';

function ChatPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto flex flex-col gap-4 pb-32">
      <div className="glass border border-mood-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle size={18} className="text-mood-accent transition-colors duration-500"/>
          <h1 className="font-display text-xl text-mood-text tracking-wide">聊天推荐</h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          后续会接入大模型：根据你的描述识别情绪并从本地曲库推荐歌单。
        </p>
      </div>

      <div className="glass border border-mood-border rounded-xl p-6 flex flex-col items-center gap-3 text-center">
        <Sparkles size={28} className="text-mood-accent transition-colors duration-500"/>
        <div className="text-mood-text font-medium">敬请期待</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
          该页面为 Phase 3 计划：将聊天输入转换为 valence/arousal 推荐参数，
          并接入本地歌单。配置 API Key 后即可使用。
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
