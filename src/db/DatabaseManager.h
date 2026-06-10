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
            CREATE INDEX IF NOT EXISTS idx_va ON tracks(valence, arousal);
        )";
        char *errMsg = 0;
        sqlite3_exec(db, sql, 0, 0, &errMsg);
        sqlite3_exec(db, "ALTER TABLE tracks ADD COLUMN trajectory_data BLOB;", 0, 0, 0);
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

    std::vector<PlaylistTrack> get_playlist(float v, float a, float r, int limit = 50) {
        std::vector<PlaylistTrack> list;
        std::string sql = "SELECT id, filepath, filename, valence, arousal, duration FROM tracks WHERE status=2 AND "
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
