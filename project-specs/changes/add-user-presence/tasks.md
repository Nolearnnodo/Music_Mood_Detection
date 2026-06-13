# Tasks: User Presence

## Backend

- [x] DB: add `users` + `presence` tables in `DatabaseManager::init_tables`
- [x] DB methods: `register_user(uuid, nickname)`, `update_presence(...)`, `get_active_summary(window_sec, top_n, min_track_listeners)`
- [x] Endpoint: `POST /api/user/register` (idempotent by uuid)
- [x] Endpoint: `POST /api/presence`
- [x] Endpoint: `GET  /api/presence/summary`
- [x] Rebuild MusicMoodCLI.exe

## Frontend

- [x] `useUser` hook: read/persist {user_id, uuid, nickname} from localStorage; call `/api/user/register` on first run
- [x] `AppStateContext` heartbeat: every 60s POST presence with currentMood + currentTrack
- [x] `CommunityPanel` / `/community` page: poll summary every 10s; render mood distribution + top tracks
- [x] Add nav entry

## Tests / QA

- [ ] Manual: open two browser windows, set different moods, verify counts move
- [ ] Stop heartbeat for 6 min, verify user drops out of summary
