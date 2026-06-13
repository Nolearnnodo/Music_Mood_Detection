# Design: User Presence

## Architecture

```
[Browser]                                     [C++ MusicMoodCLI]
  localStorage(user_id, nickname)               SQLite
  ── POST /api/user/register ─────────────►   INSERT users
                                              ── 200 {user_id, nickname}
  every 60s:
  ── POST /api/presence ─────────────────►    UPSERT presence
       {user_id, mood, v, a, track_id}        WHERE user_id = ?
                                              ── 200 {status: ok}

  every 10s (when on /community):
  ── GET  /api/presence/summary ─────────►    SELECT FROM presence
                                              WHERE updated_at > now-300s
                                              GROUP BY mood, track_id
                                              ── 200 {moods, top_tracks, active_users}
```

## Data model

```sql
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT UNIQUE NOT NULL,    -- 客户端生成,32 字符
  nickname     TEXT NOT NULL,
  created_at   INTEGER NOT NULL         -- unix sec
);

CREATE TABLE presence (
  user_id        INTEGER PRIMARY KEY,
  mood_label     TEXT DEFAULT '',
  valence        REAL DEFAULT 5,
  arousal        REAL DEFAULT 5,
  current_track_id INTEGER DEFAULT 0,
  source         TEXT DEFAULT '',       -- camera / manual / chat / time / null
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_presence_updated ON presence(updated_at);
```

## Identity

- 浏览器首次进入 `/community`(或 `useAppState` mount 时)调用 `POST /api/user/register`,
  body 带客户端生成的 UUID + 默认随机昵称(中文形容词 + 名词,如「困倦的薄荷」)。
- 服务端 INSERT OR IGNORE,返回数据库 user_id + 昵称。
- localStorage 永久保存 `{user_id, uuid, nickname}`。后续请求只带 user_id。

## Aggregation window

- 「active」 = `updated_at >= now - 300s`(最近 5 分钟有心跳)。
- mood 聚合按 `mood_label` 分组。无 mood 的用户也算 `active` 但不计入分布。
- `top_tracks` 取 `current_track_id != 0` 的分组,按计数倒序前 N(默认 5)。

## Privacy

- 任何返回给前端的聚合结果**只有计数和歌曲信息**,不含 user_id 或昵称列表。
- 单首歌的听众数 `< 3` 时不在 `top_tracks` 中展示(防止人少时反推个人)。

## Polling cadence

- 心跳 60 秒(写)。
- 聚合 10 秒(读)。
- 服务端不主动推送,无 SSE / WebSocket。
