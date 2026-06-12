"""LLM 聊天代理。

调用方式:
    python scripts/llm_chat.py <input.json>
    python scripts/llm_chat.py < /dev/stdin     (stdin 模式)

输入 JSON 结构:
    {
        "messages": [{"role": "user", "content": "..."}, ...],
        "config": {
            "base_url": "https://api.openai.com/v1",
            "api_key":  "sk-...",
            "model":    "gpt-4o-mini"
        }
    }

输出 JSON 结构(写到 stdout):
    {
        "reply":  "AI 的中文回复",
        "mood":   {"label": "...", "valence": 1-9, "arousal": 1-9, "confidence": 0-1},
        "target": {"valence": 1-9, "arousal": 1-9, "radius": 0.5-3.0, "strategy": "match|comfort"}
    }

只用 stdlib (urllib + json),不要求额外依赖。
"""
import json
import sys
import urllib.request
import urllib.error


SYSTEM_PROMPT = """你是一个情绪音乐推荐助手,任务是根据用户描述的状态判断他们的情绪、并给出本地音乐库推荐目标。

输出严格 JSON,不要 markdown 围栏、不要任何解释文字。结构如下:

{
  "reply": "用 1-2 句中文自然回应用户,体现共情",
  "mood": {
    "label": "中文情绪词,如 焦虑/疲惫/开心/平静/低落/愤怒/兴奋 等",
    "valence": 1-9 的小数,体现用户当前情绪的愉悦度,
    "arousal": 1-9 的小数,体现用户当前情绪的能量水平,
    "confidence": 0-1 的小数
  },
  "target": {
    "valence": 1-9 的小数,推荐音乐的愉悦度目标,
    "arousal": 1-9 的小数,推荐音乐的能量目标,
    "radius":  0.5-3.0 的小数,推荐搜索半径,
    "strategy": "match 或 comfort, match=匹配当前心情, comfort=安抚或提振"
  }
}

策略指引:
- 用户高能量负面(焦虑、生气)→ comfort + 较低 arousal、稍高 valence
- 用户低能量负面(疲惫、低落)→ comfort + 中等 valence/arousal,温和提振
- 用户开心、兴奋 → match,匹配当前 valence/arousal
- 用户平静、专注 → match,匹配平稳低唤醒
- 不确定时倾向 comfort,radius 给大一点 (1.5+)

参考映射(Russell circumplex,1-9 scale):
  开心 V8 A6.5  生气 V3 A8  焦虑 V3 A7  低落 V3 A3  平静 V5.5 A3.5  兴奋 V7 A8  疲惫 V4 A2
"""


def call_llm(base_url, api_key, model, messages):
    """调用 OpenAI 兼容 chat completion endpoint,要求 JSON 输出。"""
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM HTTP {e.code}: {err_body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"LLM URL error: {e.reason}")

    obj = json.loads(body)
    if "choices" not in obj or not obj["choices"]:
        raise RuntimeError(f"LLM no choices: {body[:300]}")
    content = obj["choices"][0]["message"]["content"]
    return content


def validate(parsed):
    """补全 / clamp 字段,容忍 LLM 偶尔少字段。"""
    parsed.setdefault("reply", "")
    mood = parsed.setdefault("mood", {})
    target = parsed.setdefault("target", {})

    def clamp(v, lo, hi, default):
        try: return max(lo, min(hi, float(v)))
        except Exception: return default

    mood["label"] = str(mood.get("label", "未知"))
    mood["valence"] = clamp(mood.get("valence"), 1, 9, 5.0)
    mood["arousal"] = clamp(mood.get("arousal"), 1, 9, 5.0)
    mood["confidence"] = clamp(mood.get("confidence"), 0, 1, 0.5)

    target["valence"] = clamp(target.get("valence"), 1, 9, 5.0)
    target["arousal"] = clamp(target.get("arousal"), 1, 9, 5.0)
    target["radius"]  = clamp(target.get("radius"), 0.3, 5.0, 1.5)
    strat = str(target.get("strategy", "match")).lower()
    target["strategy"] = "comfort" if strat == "comfort" else "match"

    return parsed


def emit(parsed, out_path):
    """把结果 JSON 写出去。优先写到 out_path,同时也打印到 stdout 方便调试。"""
    text = json.dumps(parsed, ensure_ascii=False)
    if out_path:
        try:
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(text)
        except Exception as e:
            sys.stderr.write(f"write {out_path} failed: {e}\n")
    sys.stdout.write(text + "\n")
    sys.stdout.flush()


def main():
    in_arg  = sys.argv[1] if len(sys.argv) > 1 else None
    out_arg = sys.argv[2] if len(sys.argv) > 2 else None

    if in_arg and in_arg not in ("-", ""):
        with open(in_arg, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    messages = data.get("messages") or []
    config = data.get("config") or {}
    base_url = config.get("base_url") or "https://api.openai.com/v1"
    api_key  = config.get("api_key")  or ""
    model    = config.get("model")    or "gpt-4o-mini"

    if not api_key:
        emit({"error": "missing api_key",
              "hint": "请先在 /settings 页填写 LLM API Key 并保存"}, out_arg)
        sys.exit(2)
    if not messages:
        emit({"error": "messages empty"}, out_arg)
        sys.exit(2)

    try:
        content = call_llm(base_url, api_key, model, messages)
    except Exception as e:
        emit({"error": str(e)}, out_arg)
        sys.exit(1)

    try:
        parsed = json.loads(content)
    except Exception:
        s = content.strip()
        if s.startswith("```"):
            s = s.split("```")[1]
            if s.lower().startswith("json"):
                s = s[4:]
        start = s.find("{"); end = s.rfind("}")
        if start == -1 or end == -1:
            emit({"error": "non-json content", "raw": content[:300]}, out_arg)
            sys.exit(3)
        try:
            parsed = json.loads(s[start:end + 1])
        except Exception:
            emit({"error": "json parse failed", "raw": content[:300]}, out_arg)
            sys.exit(3)

    parsed = validate(parsed)
    emit(parsed, out_arg)


if __name__ == "__main__":
    main()
