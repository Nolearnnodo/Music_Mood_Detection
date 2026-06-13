#pragma once
#include <sqlite3.h>
#include <string>
#include <vector>
#include <iostream>
#include <filesystem>
#include <cmath>
#include "../core/EmotionTypes.h"
#include "../utils/Encoding.h"

// 用于播放列表生成的简要信息结构
struct PlaylistTrack {
    int id;
    std::string filepath;
    std::string title;
    float v;
    float a;
    float duration;
};

// 用于前端展示已添加的文件夹
struct DirectoryInfo {
    int id;
    std::string path;
};

// 简要信息
struct TrackBrief {
    int id;
    std::string name;
    float v;
    float a;
};

class DatabaseManager {
    sqlite3 *db;

public:
    DatabaseManager(const std::string &db_path) {
        if (sqlite3_open(db_path.c_str(), &db)) {
            std::cerr << "Can't open database: " << sqlite3_errmsg(db) << std::endl;
            exit(1);
        }
        sqlite3_exec(db, "PRAGMA journal_mode=WAL;", 0, 0, 0);
        sqlite3_exec(db, "PRAGMA synchronous=NORMAL;", 0, 0, 0);
        init_tables();
    }

    ~DatabaseManager() {
        sqlite3_close(db);
    }

    void init_tables() {
        const char *sql = R"(
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filepath TEXT UNIQUE,
                filename TEXT,
                status INTEGER DEFAULT 0, -- 0: Pending, 1: Processing, 2: Done, -1: Error
                valence REAL DEFAULT 0,
                arousal REAL DEFAULT 0,
                duration REAL DEFAULT 0,
                trajectory_data BLOB
            );
            CREATE TABLE IF NOT EXISTS directories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE
            );
            CREATE TABLE IF NOT EXISTS play_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                played_at INTEGER NOT NULL,        -- unix epoch (秒)
                played_pct REAL DEFAULT 0,         -- 0..1, 是否听完
                source TEXT DEFAULT ''             -- chat / camera / manual / library / explore
            );
            CREATE INDEX IF NOT EXISTS idx_play_history_ts ON play_history(played_at);
            CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);

            CREATE TABLE IF NOT EXISTS user_feedback (
                track_id INTEGER PRIMARY KEY,      -- 每首歌只保留最新一次反馈
                kind     TEXT NOT NULL,            -- 'like' / 'dislike'
                ts       INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid       TEXT UNIQUE NOT NULL,
                nickname   TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS presence (
                user_id          INTEGER PRIMARY KEY,
                mood_label       TEXT DEFAULT '',
                valence          REAL DEFAULT 5,
                arousal          REAL DEFAULT 5,
                current_track_id INTEGER DEFAULT 0,
                source           TEXT DEFAULT '',
                updated_at       INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_presence_updated ON presence(updated_at);
            CREATE INDEX IF NOT EXISTS idx_va ON tracks(valence, arousal);
        )";
        char *errMsg = 0;
        sqlite3_exec(db, sql, 0, 0, &errMsg);
        sqlite3_exec(db, "ALTER TABLE tracks ADD COLUMN trajectory_data BLOB;", 0, 0, 0);
    }

    // --- 播放历史 / 用户反馈 ---

    void log_play(int track_id, const std::string &source, float played_pct) {
        const char *sql = "INSERT INTO play_history (track_id, played_at, played_pct, source) "
                          "VALUES (?, strftime('%s','now'), ?, ?)";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, track_id);
        sqlite3_bind_double(stmt, 2, played_pct);
        sqlite3_bind_text(stmt, 3, source.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    std::vector<int> get_recently_played(int minutes) {
        std::vector<int> ids;
        const char *sql = "SELECT DISTINCT track_id FROM play_history "
                          "WHERE played_at > strftime('%s','now') - ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, minutes * 60);
        while (sqlite3_step(stmt) == SQLITE_ROW) ids.push_back(sqlite3_column_int(stmt, 0));
        sqlite3_finalize(stmt);
        return ids;
    }

    void set_feedback(int track_id, const std::string &kind) {
        const char *sql = "INSERT INTO user_feedback (track_id, kind, ts) VALUES (?, ?, strftime('%s','now')) "
                          "ON CONFLICT(track_id) DO UPDATE SET kind=excluded.kind, ts=excluded.ts";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, track_id);
        sqlite3_bind_text(stmt, 2, kind.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    void clear_feedback(int track_id) {
        const char *sql = "DELETE FROM user_feedback WHERE track_id = ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, track_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    std::vector<int> get_disliked() {
        std::vector<int> ids;
        const char *sql = "SELECT track_id FROM user_feedback WHERE kind = 'dislike'";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        while (sqlite3_step(stmt) == SQLITE_ROW) ids.push_back(sqlite3_column_int(stmt, 0));
        sqlite3_finalize(stmt);
        return ids;
    }

    // 返回 map<track_id, kind>,前端用于绘制按钮状态
    std::vector<std::pair<int, std::string>> get_all_feedback() {
        std::vector<std::pair<int, std::string>> out;
        const char *sql = "SELECT track_id, kind FROM user_feedback";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            int id = sqlite3_column_int(stmt, 0);
            std::string kind = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
            out.emplace_back(id, kind);
        }
        sqlite3_finalize(stmt);
        return out;
    }

    void delete_track(int track_id) {
        sqlite3_exec(db, "BEGIN TRANSACTION;", 0, 0, 0);
        const char *sql1 = "DELETE FROM tracks WHERE id = ?";
        sqlite3_stmt *s;
        sqlite3_prepare_v2(db, sql1, -1, &s, 0);
        sqlite3_bind_int(s, 1, track_id);
        sqlite3_step(s); sqlite3_finalize(s);

        sqlite3_prepare_v2(db, "DELETE FROM play_history WHERE track_id = ?", -1, &s, 0);
        sqlite3_bind_int(s, 1, track_id);
        sqlite3_step(s); sqlite3_finalize(s);

        sqlite3_prepare_v2(db, "DELETE FROM user_feedback WHERE track_id = ?", -1, &s, 0);
        sqlite3_bind_int(s, 1, track_id);
        sqlite3_step(s); sqlite3_finalize(s);
        sqlite3_exec(db, "COMMIT;", 0, 0, 0);
    }

    void reset_track_for_reanalysis(int track_id) {
        const char *sql = "UPDATE tracks SET status = 0 WHERE id = ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, track_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    // --- 用户系统 ---

    // 注册或获取用户(按 uuid 幂等)。返回 user_id (>0 成功)。
    int register_user(const std::string &uuid, const std::string &nickname) {
        // 1. INSERT OR IGNORE
        const char *ins = "INSERT OR IGNORE INTO users (uuid, nickname, created_at) "
                          "VALUES (?, ?, strftime('%s','now'))";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, ins, -1, &stmt, 0);
        sqlite3_bind_text(stmt, 1, uuid.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, nickname.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        // 2. 查 id + 真实昵称(可能已被改过)
        const char *sel = "SELECT id, nickname FROM users WHERE uuid = ?";
        sqlite3_prepare_v2(db, sel, -1, &stmt, 0);
        sqlite3_bind_text(stmt, 1, uuid.c_str(), -1, SQLITE_TRANSIENT);
        int id = 0;
        if (sqlite3_step(stmt) == SQLITE_ROW) id = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        return id;
    }

    bool get_user(int user_id, std::string &uuid_out, std::string &nickname_out) {
        const char *sql = "SELECT uuid, nickname FROM users WHERE id = ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, user_id);
        bool ok = false;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            uuid_out     = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 0));
            nickname_out = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
            ok = true;
        }
        sqlite3_finalize(stmt);
        return ok;
    }

    void update_presence(int user_id, const std::string &mood_label,
                         float valence, float arousal, int current_track_id,
                         const std::string &source) {
        const char *sql =
            "INSERT INTO presence (user_id, mood_label, valence, arousal, current_track_id, source, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now')) "
            "ON CONFLICT(user_id) DO UPDATE SET "
            "  mood_label=excluded.mood_label, valence=excluded.valence, "
            "  arousal=excluded.arousal, current_track_id=excluded.current_track_id, "
            "  source=excluded.source, updated_at=excluded.updated_at";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, user_id);
        sqlite3_bind_text(stmt, 2, mood_label.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_double(stmt, 3, valence);
        sqlite3_bind_double(stmt, 4, arousal);
        sqlite3_bind_int(stmt, 5, current_track_id);
        sqlite3_bind_text(stmt, 6, source.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    struct PresenceMoodEntry { std::string label; int count; float sample_v; float sample_a; };
    struct PresenceTrackEntry { int track_id; std::string title; int count; };

    int count_active_users(int window_sec) {
        const char *sql = "SELECT COUNT(*) FROM presence WHERE updated_at >= strftime('%s','now') - ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, window_sec);
        int n = 0;
        if (sqlite3_step(stmt) == SQLITE_ROW) n = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        return n;
    }

    std::vector<PresenceMoodEntry> get_active_mood_distribution(int window_sec) {
        std::vector<PresenceMoodEntry> out;
        const char *sql =
            "SELECT mood_label, COUNT(*) AS c, AVG(valence) AS av, AVG(arousal) AS aa "
            "FROM presence WHERE updated_at >= strftime('%s','now') - ? AND mood_label != '' "
            "GROUP BY mood_label ORDER BY c DESC";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, window_sec);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            PresenceMoodEntry e;
            e.label    = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 0));
            e.count    = sqlite3_column_int(stmt, 1);
            e.sample_v = (float) sqlite3_column_double(stmt, 2);
            e.sample_a = (float) sqlite3_column_double(stmt, 3);
            out.push_back(e);
        }
        sqlite3_finalize(stmt);
        return out;
    }

    std::vector<PresenceTrackEntry> get_top_active_tracks(int window_sec, int top_n,
                                                          int min_listeners) {
        std::vector<PresenceTrackEntry> out;
        const char *sql =
            "SELECT p.current_track_id, COALESCE(t.filename, ''), COUNT(*) AS c "
            "FROM presence p LEFT JOIN tracks t ON t.id = p.current_track_id "
            "WHERE p.updated_at >= strftime('%s','now') - ? AND p.current_track_id > 0 "
            "GROUP BY p.current_track_id "
            "HAVING c >= ? "
            "ORDER BY c DESC LIMIT ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, window_sec);
        sqlite3_bind_int(stmt, 2, min_listeners);
        sqlite3_bind_int(stmt, 3, top_n);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            PresenceTrackEntry e;
            e.track_id = sqlite3_column_int(stmt, 0);
            const unsigned char *t = sqlite3_column_text(stmt, 1);
            e.title    = t ? reinterpret_cast<const char *>(t) : "";
            e.count    = sqlite3_column_int(stmt, 2);
            out.push_back(e);
        }
        sqlite3_finalize(stmt);
        return out;
    }

    std::string get_track_path(int track_id) {
        const char *sql = "SELECT filepath FROM tracks WHERE id = ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, track_id);
        std::string out;
        if (sqlite3_step(stmt) == SQLITE_ROW)
            out = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 0));
        sqlite3_finalize(stmt);
        return out;
    }

    // --- 目录管理 API ---

    void add_directory(const std::string &path) {
        std::string sql = "INSERT OR IGNORE INTO directories (path) VALUES (?)";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
        sqlite3_bind_text(stmt, 1, path.c_str(), -1, SQLITE_STATIC);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    void remove_directory(int id) {
        std::string sql = "DELETE FROM directories WHERE id = ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    std::vector<DirectoryInfo> get_directories() {
        std::vector<DirectoryInfo> list;
        const char *sql = "SELECT id, path FROM directories";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            list.push_back({
                sqlite3_column_int(stmt, 0),
                reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1))
            });
        }
        sqlite3_finalize(stmt);
        return list;
    }

    // --- 歌曲管理 API ---

    std::pair<int, bool> add_or_get_track(const std::string &path_utf8) {
        std::string name_utf8;
        try {
            std::filesystem::path p = Encoding::to_fs_path(path_utf8);
            name_utf8 = Encoding::to_utf8_string(p.filename());
        } catch (...) {
            // 降级策略：如果路径极其怪异，直接手动截取
            size_t last_slash = path_utf8.find_last_of("/\\");
            if (last_slash != std::string::npos) name_utf8 = path_utf8.substr(last_slash + 1);
            else name_utf8 = path_utf8;
        }

        sqlite3_stmt *stmt;

        std::string sql = "SELECT id, status FROM tracks WHERE filepath = ?";
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
        sqlite3_bind_text(stmt, 1, path_utf8.c_str(), -1, SQLITE_STATIC);

        int id = -1;
        int status = 0;
        bool exists = false;

        if (sqlite3_step(stmt) == SQLITE_ROW) {
            id = sqlite3_column_int(stmt, 0);
            status = sqlite3_column_int(stmt, 1);
            exists = true;
        }
        sqlite3_finalize(stmt);

        if (exists) {
            if (status == 2) return {id, false};
            // 重置状态
            sql = "UPDATE tracks SET status=0 WHERE id=?";
            sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
            sqlite3_bind_int(stmt, 1, id);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
            return {id, true};
        } else {
            sql = "INSERT INTO tracks (filepath, filename, status) VALUES (?, ?, 0)";
            sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
            sqlite3_bind_text(stmt, 1, path_utf8.c_str(), -1, SQLITE_STATIC);
            sqlite3_bind_text(stmt, 2, name_utf8.c_str(), -1, SQLITE_STATIC);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
            return {(int) sqlite3_last_insert_rowid(db), true};
        }
    }

    void prune_missing_tracks(const std::vector<std::string> &active_directories) {
        if (active_directories.empty()) return;

        std::vector<int> ids_to_delete;
        std::string sql = "SELECT id, filepath FROM tracks WHERE status=2"; // 只检查已完成的，正在扫的由scanner负责
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);

        while (sqlite3_step(stmt) == SQLITE_ROW) {
            int id = sqlite3_column_int(stmt, 0);
            std::string path_str = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));

            // 检查该文件是否属于任何一个活跃目录
            bool is_in_active_dir = false;
            for (const auto &dir: active_directories) {
                // 简单的前缀匹配，实际应用中可能需要更严谨的路径匹配
                if (path_str.find(dir) == 0) {
                    is_in_active_dir = true;
                    break;
                }
            }

            if (is_in_active_dir) {
                try {
                    std::filesystem::path p = Encoding::to_fs_path(path_str);
                    if (!std::filesystem::exists(p)) {
                        ids_to_delete.push_back(id);
                    }
                } catch (...) {
                    ids_to_delete.push_back(id);
                }
            }
        }
        sqlite3_finalize(stmt);

        if (ids_to_delete.empty()) return;

        std::cout << "[DB] Pruning " << ids_to_delete.size() << " missing files from active directories." << std::endl;

        sqlite3_exec(db, "BEGIN TRANSACTION;", 0, 0, 0);
        sql = "DELETE FROM tracks WHERE id = ?";
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
        for (int id: ids_to_delete) {
            sqlite3_bind_int(stmt, 1, id);
            sqlite3_step(stmt);
            sqlite3_reset(stmt);
        }
        sqlite3_finalize(stmt);
        sqlite3_exec(db, "COMMIT;", 0, 0, 0);
    }

    void save_analysis(int track_id, const AnalysisResult &res) {
        // 1. 序列化 Trajectory: [t, v, a, t, v, a, ...]
        std::vector<float> blob_data;
        blob_data.reserve(res.trajectory.size() * 3);
        for (const auto &p: res.trajectory) {
            blob_data.push_back(p.time_sec);
            blob_data.push_back(p.valence);
            blob_data.push_back(p.arousal);
        }

        char *errMsg = 0;
        sqlite3_exec(db, "BEGIN TRANSACTION;", 0, 0, &errMsg);

        // 2. 将 BLOB 存入 tracks 表
        std::string sql = "UPDATE tracks SET status=2, valence=?, arousal=?, duration=?, trajectory_data=? WHERE id=?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);

        sqlite3_bind_double(stmt, 1, res.global_valence);
        sqlite3_bind_double(stmt, 2, res.global_arousal);
        sqlite3_bind_double(stmt, 3, res.duration_sec);
        // Bind BLOB: 指针，字节数，析构函数(这里是瞬态的，用TRANSIENT让sqlite拷贝一份)
        sqlite3_bind_blob(stmt, 4, blob_data.data(), (int) (blob_data.size() * sizeof(float)), SQLITE_TRANSIENT);
        sqlite3_bind_int(stmt, 5, track_id);

        sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        sqlite3_exec(db, "COMMIT;", 0, 0, &errMsg);
    }

    AnalysisResult get_track_detail(int id) {
        AnalysisResult res;
        sqlite3_stmt *stmt;
        // 修改：直接从 tracks 表读取 BLOB
        std::string sql = "SELECT filepath, valence, arousal, duration, trajectory_data FROM tracks WHERE id=?";
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
        sqlite3_bind_int(stmt, 1, id);

        if (sqlite3_step(stmt) == SQLITE_ROW) {
            res.filepath = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 0));
            res.global_valence = (float) sqlite3_column_double(stmt, 1);
            res.global_arousal = (float) sqlite3_column_double(stmt, 2);
            res.duration_sec = (float) sqlite3_column_double(stmt, 3);

            // 3. 反序列化 BLOB
            const void *blob = sqlite3_column_blob(stmt, 4);
            int bytes = sqlite3_column_bytes(stmt, 4);

            if (blob && bytes > 0) {
                const float *ptr = static_cast<const float *>(blob);
                int count = bytes / (sizeof(float) * 3); // 包含多少个点
                res.trajectory.reserve(count);

                for (int i = 0; i < count; ++i) {
                    EmotionPoint p;
                    p.time_sec = ptr[i * 3 + 0];
                    p.valence = ptr[i * 3 + 1];
                    p.arousal = ptr[i * 3 + 2];
                    res.trajectory.push_back(p);
                }
            }
        }
        sqlite3_finalize(stmt);
        return res;
    }

    void mark_error(int track_id) {
        std::string sql = "UPDATE tracks SET status=-1 WHERE id=" + std::to_string(track_id);
        sqlite3_exec(db, sql.c_str(), 0, 0, 0);
    }

    std::vector<TrackBrief> get_all_finished_filtered(const std::vector<std::string> &available_paths) {
        std::vector<TrackBrief> list;
        if (available_paths.empty()) return list;

        const char *sql = "SELECT id, filepath, filename, valence, arousal FROM tracks WHERE status=2";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);

        while (sqlite3_step(stmt) == SQLITE_ROW) {
            std::string path = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));

            bool match = false;
            for (const auto &prefix: available_paths) {
                if (path.find(prefix) == 0) {
                    match = true;
                    break;
                }
            }

            if (match) {
                list.push_back({
                    sqlite3_column_int(stmt, 0),
                    reinterpret_cast<const char *>(sqlite3_column_text(stmt, 2)),
                    (float) sqlite3_column_double(stmt, 3),
                    (float) sqlite3_column_double(stmt, 4)
                });
            }
        }
        sqlite3_finalize(stmt);
        return list;
    }

    // K-NN 查找
    std::vector<TrackBrief> get_nearest_neighbors(float v, float a, int k) {
        std::vector<TrackBrief> list;
        // 按欧氏距离平方排序
        const char *sql = "SELECT id, filename, valence, arousal FROM tracks WHERE status=2 "
                "ORDER BY ((valence - ?) * (valence - ?) + (arousal - ?) * (arousal - ?)) ASC LIMIT ?";

        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, 0);
        sqlite3_bind_double(stmt, 1, v);
        sqlite3_bind_double(stmt, 2, v);
        sqlite3_bind_double(stmt, 3, a);
        sqlite3_bind_double(stmt, 4, a);
        sqlite3_bind_int(stmt, 5, k);

        while (sqlite3_step(stmt) == SQLITE_ROW) {
            list.push_back({
                sqlite3_column_int(stmt, 0),
                reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1)),
                (float) sqlite3_column_double(stmt, 2),
                (float) sqlite3_column_double(stmt, 3)
            });
        }
        sqlite3_finalize(stmt);
        return list;
    }

    std::vector<PlaylistTrack> get_playlist(float v, float a, float r, int limit = 50,
                                            const std::vector<int> &exclude_ids = {}) {
        std::vector<PlaylistTrack> list;
        std::string excl;
        if (!exclude_ids.empty()) {
            excl = " AND id NOT IN (";
            for (size_t i = 0; i < exclude_ids.size(); ++i) {
                if (i > 0) excl += ",";
                excl += std::to_string(exclude_ids[i]);
            }
            excl += ")";
        }
        std::string sql = "SELECT id, filepath, filename, valence, arousal, duration FROM tracks "
                          "WHERE status=2" + excl + " AND "
                          "((valence - ?) * (valence - ?) + (arousal - ?) * (arousal - ?)) <= ? "
                          "ORDER BY ((valence - ?) * (valence - ?) + (arousal - ?) * (arousal - ?)) ASC LIMIT ?";
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
        float r_sq = r * r;
        sqlite3_bind_double(stmt, 1, v);
        sqlite3_bind_double(stmt, 2, v);
        sqlite3_bind_double(stmt, 3, a);
        sqlite3_bind_double(stmt, 4, a);
        sqlite3_bind_double(stmt, 5, r_sq);
        sqlite3_bind_double(stmt, 6, v);
        sqlite3_bind_double(stmt, 7, v);
        sqlite3_bind_double(stmt, 8, a);
        sqlite3_bind_double(stmt, 9, a);
        sqlite3_bind_int(stmt, 10, limit);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            PlaylistTrack track;
            track.id = sqlite3_column_int(stmt, 0);
            track.filepath = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
            track.title = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 2));
            track.v = (float) sqlite3_column_double(stmt, 3);
            track.a = (float) sqlite3_column_double(stmt, 4);
            track.duration = (float) sqlite3_column_double(stmt, 5);
            list.push_back(track);
        }
        sqlite3_finalize(stmt);
        return list;
    }

    // V2 推荐:多目标加权排序
    //   - 情绪距离(平方)负贡献
    //   - 喜欢加分 + 不喜欢直接过滤
    //   - 最近播放扣分(分级惩罚)
    //   - 从未播放过加一点点新鲜度
    //
    // 输出顺序仍按 score 降序;不超出 r 半径,半径外的不进结果。
    struct RankedTrack {
        PlaylistTrack track;
        float score;       // 综合得分
        float dist;        // sqrt(dist_sq),便于前端展示
        std::string fb;    // 'like' / '' (dislike 已过滤掉)
        int last_played;   // 0 表示从未播过
    };

    std::vector<RankedTrack> get_playlist_ranked(float v, float a, float r, int limit,
                                                 const std::vector<int> &exclude_ids = {}) {
        std::vector<RankedTrack> list;
        std::string excl;
        if (!exclude_ids.empty()) {
            excl = " AND t.id NOT IN (";
            for (size_t i = 0; i < exclude_ids.size(); ++i) {
                if (i > 0) excl += ",";
                excl += std::to_string(exclude_ids[i]);
            }
            excl += ")";
        }
        // SQLite 没有 LEAST/GREATEST,用 CASE 分级。score 在 ORDER BY 里直接写表达式。
        std::string sql = std::string(
            "WITH lp AS ("
            "  SELECT track_id, MAX(played_at) AS t FROM play_history GROUP BY track_id"
            ") "
            "SELECT t.id, t.filepath, t.filename, t.valence, t.arousal, t.duration, "
            "  ((t.valence - ?) * (t.valence - ?) + (t.arousal - ?) * (t.arousal - ?)) AS dist_sq, "
            "  COALESCE(uf.kind, '') AS fb, "
            "  COALESCE(lp.t, 0) AS last_played, "
            "  (-((t.valence - ?) * (t.valence - ?) + (t.arousal - ?) * (t.arousal - ?))) "
            "  + CASE WHEN uf.kind = 'like' THEN 1.5 ELSE 0 END "
            "  + CASE WHEN lp.t IS NULL THEN 0.4 ELSE 0 END "
            "  + CASE "
            "      WHEN lp.t > strftime('%s','now') -  1800 THEN -3.0 "
            "      WHEN lp.t > strftime('%s','now') -  7200 THEN -1.4 "
            "      WHEN lp.t > strftime('%s','now') - 21600 THEN -0.7 "
            "      WHEN lp.t > strftime('%s','now') - 86400 THEN -0.2 "
            "      ELSE 0 END AS score "
            "FROM tracks t "
            "LEFT JOIN user_feedback uf ON uf.track_id = t.id "
            "LEFT JOIN lp ON lp.track_id = t.id "
            "WHERE t.status = 2") + excl +
            " AND COALESCE(uf.kind, '') != 'dislike' "
            " AND ((t.valence - ?) * (t.valence - ?) + (t.arousal - ?) * (t.arousal - ?)) <= ? "
            "ORDER BY score DESC LIMIT ?";

        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, 0);
        // dist_sq (SELECT)
        sqlite3_bind_double(stmt, 1, v);
        sqlite3_bind_double(stmt, 2, v);
        sqlite3_bind_double(stmt, 3, a);
        sqlite3_bind_double(stmt, 4, a);
        // -dist_sq 部分(score 表达式里再算一次)
        sqlite3_bind_double(stmt, 5, v);
        sqlite3_bind_double(stmt, 6, v);
        sqlite3_bind_double(stmt, 7, a);
        sqlite3_bind_double(stmt, 8, a);
        // WHERE dist_sq <= r²
        sqlite3_bind_double(stmt, 9, v);
        sqlite3_bind_double(stmt, 10, v);
        sqlite3_bind_double(stmt, 11, a);
        sqlite3_bind_double(stmt, 12, a);
        sqlite3_bind_double(stmt, 13, r * r);
        sqlite3_bind_int(stmt, 14, limit);

        while (sqlite3_step(stmt) == SQLITE_ROW) {
            RankedTrack rt;
            rt.track.id        = sqlite3_column_int(stmt, 0);
            rt.track.filepath  = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
            rt.track.title     = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 2));
            rt.track.v         = (float) sqlite3_column_double(stmt, 3);
            rt.track.a         = (float) sqlite3_column_double(stmt, 4);
            rt.track.duration  = (float) sqlite3_column_double(stmt, 5);
            float dist_sq      = (float) sqlite3_column_double(stmt, 6);
            rt.dist            = std::sqrt(std::max(0.0f, dist_sq));
            const unsigned char *fb_txt = sqlite3_column_text(stmt, 7);
            rt.fb              = fb_txt ? reinterpret_cast<const char *>(fb_txt) : "";
            rt.last_played     = sqlite3_column_int(stmt, 8);
            rt.score           = (float) sqlite3_column_double(stmt, 9);
            list.push_back(rt);
        }
        sqlite3_finalize(stmt);
        return list;
    }

    // 获取进度统计（成功数、失败数、总数）
    std::tuple<int, int, int> get_progress_stats() {
        int total = 0, done = 0, failed = 0;
        sqlite3_stmt *stmt;
        sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM tracks", -1, &stmt, 0);
        if (sqlite3_step(stmt) == SQLITE_ROW) total = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM tracks WHERE status=2", -1, &stmt, 0);
        if (sqlite3_step(stmt) == SQLITE_ROW) done = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM tracks WHERE status=-1", -1, &stmt, 0);
        if (sqlite3_step(stmt) == SQLITE_ROW) failed = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        return {done, failed, total};
    }

    std::vector<std::pair<int, std::string> > get_incomplete_tracks() {
        std::vector<std::pair<int, std::string> > pending;
        // status 0: 等待中
        // status 1: 上次正在处理但被中断（也需要重试）
        const char *sql = "SELECT id, filepath FROM tracks WHERE status IN (0, 1)";
        sqlite3_stmt *stmt;
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, 0) != SQLITE_OK) {
            std::cerr << "Failed to prepare resume sql: " << sqlite3_errmsg(db) << std::endl;
            return pending;
        }

        while (sqlite3_step(stmt) == SQLITE_ROW) {
            int id = sqlite3_column_int(stmt, 0);
            const char *path_txt = reinterpret_cast<const char *>(sqlite3_column_text(stmt, 1));
            if (path_txt) {
                pending.emplace_back(id, std::string(path_txt));
            }
        }
        sqlite3_finalize(stmt);
        return pending;
    }
};
