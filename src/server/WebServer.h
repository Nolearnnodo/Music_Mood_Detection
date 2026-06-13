#pragma once
#include <httplib.h>
#include <nlohmann/json.hpp>
#include "../db/DatabaseManager.h"
#include "../scanner/LibraryScanner.h"
#include "../core/AudioDecoder.h"
#include "../utils/Encoding.h"
#include <ctime>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <iostream>
#include <set>
#include <mutex>
#include <thread>
#include <algorithm>
#include <atomic>
#include <climits>
#include <cstdlib>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

using json = nlohmann::json;

class WebServer {
    httplib::Server svr;
    DatabaseManager &db;
    LibraryScanner &scanner;
    std::string web_root;
    std::string music_dir;          // 用户上传音乐固定目录 (UTF-8)
    std::string db_path;            // SQLite 数据库路径(相对/绝对都行,传给 Python 用环境变量)
    bool is_read_only;
    bool serve_static_files;

    std::mutex sse_mtx;
    std::set<httplib::DataSink *> sse_clients;

    std::vector<std::string> active_directories;

    // Reanalyze (Python 子进程) 状态,避免并发
    std::atomic<bool> reanalyze_running{false};

    // 启动时定位到的 scripts 目录(绝对路径,带反斜杠)
    std::string project_root;           // .../ (含 scripts/、models/、music_mood.db)
    std::string scripts_dir;            // .../scripts
    std::string python_exe;             // .../scripts/.venv/Scripts/python.exe
    std::string script_analyze_all;     // .../scripts/analyze_all.py
    std::string script_llm_chat;        // .../scripts/llm_chat.py

    // 从 CWD 起向上 5 级目录,查找含 scripts/.venv 的项目根。返回是否成功。
    bool locate_scripts_dir() {
        std::error_code ec;
        auto cwd = std::filesystem::current_path(ec);
        if (ec) return false;
        for (int i = 0; i < 5; ++i) {
            auto candidate = cwd / "scripts" / ".venv" / "Scripts" / "python.exe";
            if (std::filesystem::exists(candidate, ec)) {
                project_root       = cwd.string();
                scripts_dir        = (cwd / "scripts").string();
                python_exe         = candidate.string();
                script_analyze_all = (cwd / "scripts" / "analyze_all.py").string();
                script_llm_chat    = (cwd / "scripts" / "llm_chat.py").string();
                std::cout << "[Init] Project root: " << project_root << std::endl;
                std::cout << "[Init] Scripts dir : " << scripts_dir << std::endl;
                return true;
            }
            if (!cwd.has_parent_path() || cwd == cwd.parent_path()) break;
            cwd = cwd.parent_path();
        }
        std::cerr << "[Warning] scripts/.venv not found within 5 parent dirs. "
                  << "Chat and reanalyze will fail until you create it. "
                  << "Run from project root or 'uv venv --python 3.12 scripts/.venv'." << std::endl;
        return false;
    }

    // 把命令包成可执行(转义双引号),适用于 std::system + Windows cmd.exe。
    static std::string quote(const std::string &s) {
        return std::string("\"") + s + "\"";
    }

    // 用于让 std::system 调用的 Python 看到正确 CWD + MOOD_DB_PATH 环境变量。
    // 返回 cmd /c "set MOOD_DB_PATH=... && cd /d <root> && <inner> "
    std::string wrap_python_cmd(const std::string &inner) const {
        std::error_code ec;
        std::string abs_db = std::filesystem::absolute(
            Encoding::to_fs_path(db_path), ec).string();
        return std::string("cmd /c \"set \"MOOD_DB_PATH=") + abs_db + "\" && " +
               "cd /d " + quote(project_root) + " && " + inner + "\"";
    }

public:
    WebServer(DatabaseManager &_db, LibraryScanner &_sc, const std::string &_web_root,
              const std::string &_music_dir, const std::string &_db_path,
              const std::string &host, int port, bool read_only, bool serve_static = true)
        : db(_db), scanner(_sc), web_root(_web_root), music_dir(_music_dir),
          db_path(_db_path), is_read_only(read_only), serve_static_files(serve_static) {

        // 确保上传目录存在
        try {
            std::filesystem::path mp = Encoding::to_fs_path(music_dir);
            std::error_code ec;
            std::filesystem::create_directories(mp, ec);
            music_dir = Encoding::to_utf8_string(std::filesystem::absolute(mp, ec));
            std::cout << "[Init] Music upload directory: " << music_dir << std::endl;
        } catch (const std::exception &e) {
            std::cerr << "[Warning] Failed to prepare music directory: " << e.what() << std::endl;
        }

        auto dirs = db.get_directories();
        std::cout << "[Init] Checking configured directories..." << std::endl;

        for (const auto& d : dirs) {
            std::filesystem::path p = Encoding::to_fs_path(d.path);
            std::error_code ec;
            if (std::filesystem::exists(p, ec) && std::filesystem::is_directory(p, ec)) {
                active_directories.push_back(d.path);
            } else {
                std::cerr << "[Warning] Configured directory NOT found: " << d.path
                          << ". Tracks will be hidden from UI but kept in DB." << std::endl;
            }
        }

        // 把 Music_Directory 自动注册为扫描目录（如果尚未注册）
        if (!music_dir.empty() && !is_read_only) {
            bool already_active = false;
            for (const auto &p : active_directories) {
                if (p == music_dir) { already_active = true; break; }
            }
            if (!already_active) {
                std::cout << "[Init] Registering Music_Directory: " << music_dir << std::endl;
                db.add_directory(music_dir);
                active_directories.push_back(music_dir);
            }
        }

        if (!active_directories.empty()) {
            std::cout << "[Init] Pruning missing files in " << active_directories.size() << " active directories..." << std::endl;
            db.prune_missing_tracks(active_directories);
        } else {
            std::cout << "[Init] No active directories found. Skipping prune." << std::endl;
        }

        scanner.start_workers(3);
        // 注:ncnn 推理路径目前会输出异常 V/A,默认不再自动恢复扫描或自动扫描 Music_Directory。
        // 上传或 Music_Directory 中的文件改由 /api/music/reanalyze 调用 Python 脚本处理。
        // scanner.resume_scans();
        // if (!music_dir.empty() && !is_read_only) scanner.add_folder_async(music_dir);

        // 启动时把 Music_Directory 里已有的歌登记进数据库 (status=0),供 reanalyze 使用
        if (!music_dir.empty() && !is_read_only) {
            std::thread([this]() {
                try {
                    std::filesystem::path root = Encoding::to_fs_path(music_dir);
                    if (!std::filesystem::is_directory(root)) return;
                    int n = 0;
                    for (auto &entry : std::filesystem::recursive_directory_iterator(
                             root, std::filesystem::directory_options::skip_permission_denied)) {
                        if (!entry.is_regular_file()) continue;
                        std::string ext = Encoding::to_utf8_string(entry.path().extension());
                        std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
                        if (ext == ".mp3" || ext == ".wav" || ext == ".flac" ||
                            ext == ".m4a" || ext == ".ogg" || ext == ".aac" ||
                            ext == ".ape" || ext == ".wma" || ext == ".wv" || ext == ".aiff") {
                            auto [id, is_new] = scanner.register_single_file(
                                Encoding::to_utf8_string(entry.path()));
                            if (is_new) n++;
                        }
                    }
                    if (n > 0) std::cout << "[Init] Registered " << n
                                         << " new files in Music_Directory (pending reanalyze)" << std::endl;
                } catch (const std::exception &e) {
                    std::cerr << "[Init] Music_Directory scan failed: " << e.what() << std::endl;
                }
            }).detach();
        }

        scanner.set_event_callback([this](const std::string &msg) {
            std::lock_guard<std::mutex> lock(sse_mtx);
            auto it = sse_clients.begin();
            while (it != sse_clients.end()) {
                bool ok = (*it)->write(msg.c_str(), msg.size());
                if (!ok) {
                    it = sse_clients.erase(it);
                } else {
                    ++it;
                }
            }
        });

        locate_scripts_dir();
        setup_routes();

        std::cout << "Server trying to listen at http://" << host << ":" << port << std::endl;

        // 检查端口是否被占用 (listen 返回 false 表示失败)
        if (!svr.listen(host.c_str(), port)) {
            // 抛出异常，让 main 函数处理
            throw std::runtime_error("Failed to bind to " + host + ":" + std::to_string(port) +
                                     ". Port might be in use or permission denied.");
        }
    }

private:
    void broadcast_event(const std::string &event, const std::string &data) {
        std::string msg = "event: " + event + "\ndata: " + data + "\n\n";
        std::lock_guard<std::mutex> lock(sse_mtx);
        auto it = sse_clients.begin();
        while (it != sse_clients.end()) {
            if (!(*it)->write(msg.c_str(), msg.size())) it = sse_clients.erase(it);
            else ++it;
        }
    }

    void broadcast_status(const std::string &text) {
        json j; j["msg"] = text;
        broadcast_event("status", j.dump());
    }

    void setup_routes() {
        if (serve_static_files) {
            if (!svr.set_mount_point("/", web_root)) {
                std::cerr << "[Warning] Failed to mount web root: " << web_root
                          << ". Use --api-only for Vite development mode." << std::endl;
            }
        } else {
            std::cout << "[Init] API-only mode enabled. Static frontend serving is disabled." << std::endl;
        }

        // SSE
        svr.Get("/api/events", [&](const httplib::Request &, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Cache-Control", "no-cache");
            res.set_chunked_content_provider("text/event-stream",
                                             [&](size_t offset, httplib::DataSink &sink) {
                                                 {
                                                     std::lock_guard<std::mutex> lock(sse_mtx);
                                                     sse_clients.insert(&sink);
                                                 }
                                                 while (true) {
                                                     std::this_thread::sleep_for(std::chrono::seconds(2));
                                                     std::string heartbeat = ": keepalive\n\n";
                                                     std::lock_guard<std::mutex> lock(sse_mtx);
                                                     if (sse_clients.find(&sink) == sse_clients.end()) break;
                                                     if (!sink.write(heartbeat.c_str(), heartbeat.size())) {
                                                         sse_clients.erase(&sink);
                                                         break;
                                                     }
                                                 }
                                                 return true;
                                             });
        });

        // Config API
        svr.Post("/api/config/folders", [&](const httplib::Request &req, httplib::Response &res) {
            if (is_read_only) {
                res.status = 403;
                res.set_content("{\"error\":\"Read-only mode\"}", "application/json");
                return;
            }
            try {
                auto j = json::parse(req.body);
                std::string path = j["path"];
                scanner.add_folder_async(path);

                bool exists = false;
                for(const auto& d : active_directories) if(d == path) exists = true;
                if(!exists) active_directories.push_back(path);

                res.set_content("{\"status\":\"ok\"}", "application/json");
            } catch (...) { res.status = 400; }
        });

        svr.Get("/api/config/folders", [&](const httplib::Request &, httplib::Response &res) {
            auto dirs = db.get_directories();
            json j = json::array();
            for (const auto &d: dirs) j.push_back({{"id", d.id}, {"path", d.path}});
            res.set_content(j.dump(), "application/json");
        });

        svr.Delete("/api/config/folders", [&](const httplib::Request &req, httplib::Response &res) {
            if (is_read_only) {
                res.status = 403;
                res.set_content("{\"error\":\"Read-only mode\"}", "application/json");
                return;
            }
            if (!req.has_param("id")) {
                res.status = 400;
                return;
            }
            int id = std::stoi(req.get_param_value("id"));
            db.remove_directory(id);
            res.set_content("{\"status\":\"ok\"}", "application/json");
        });

        // Data API
        svr.Get("/api/status", [&](const httplib::Request &, httplib::Response &res) {
            auto [done, failed, total] = db.get_progress_stats();
            json j;
            j["done"] = done;
            j["failed"] = failed;
            j["total"] = total;
            j["percentage"] = total > 0 ? (float) (done + failed) / total * 100.0 : 0.0;
            j["readOnly"] = is_read_only;
            res.set_content(j.dump(), "application/json");
        });

        svr.Get("/api/tracks", [&](const httplib::Request &, httplib::Response &res) {
            auto tracks = db.get_all_finished_filtered(active_directories);
            json j = json::array();
            for (const auto &t: tracks) j.push_back({{"id", t.id}, {"title", t.name}, {"v", t.v}, {"a", t.a}});
            res.set_content(j.dump(), "application/json");
        });

        svr.Get("/api/track/detail", [&](const httplib::Request &req, httplib::Response &res) {
            if (!req.has_param("id")) return;
            try {
                int id = std::stoi(req.get_param_value("id"));
                auto result = db.get_track_detail(id);
                json j;
                j["path"] = result.filepath;
                j["v"] = result.global_valence;
                j["a"] = result.global_arousal;
                j["duration"] = result.duration_sec;
                j["trajectory"] = json::array();
                for (const auto &p: result.trajectory)
                    j["trajectory"].push_back({
                        {"t", p.time_sec}, {"v", p.valence}, {"a", p.arousal}
                    });
                TrackMetadata meta = AudioDecoder::extract_metadata(result.filepath);

                // 如果 ID3 有标题，优先用 ID3 的，否则前端会用文件名
                if (!meta.title.empty()) j["title"] = meta.title;
                j["artist"] = meta.artist.empty() ? "Unknown Artist" : meta.artist;
                j["album"] = meta.album.empty() ? "Unknown Album" : meta.album;

                if (!meta.cover_data.empty()) {
                    std::string base64_data = Encoding::base64_encode(meta.cover_data.data(), meta.cover_data.size());
                    j["cover"] = "data:" + meta.cover_mime + ";base64," + base64_data;
                } else {
                    j["cover"] = nullptr;
                }

                res.set_content(j.dump(), "application/json");
            } catch (...) { res.status = 500; }
        });

        // =================================================================================
        // Cover image API: 优先匹配 Music_Directory/.covers/<filename>.png,其次 mp3 内嵌封面
        // =================================================================================
        svr.Get("/api/cover", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Cache-Control", "public, max-age=3600");
            if (!req.has_param("id")) { res.status = 400; return; }
            try {
                int id = std::stoi(req.get_param_value("id"));
                std::string path_u8 = db.get_track_path(id);
                if (path_u8.empty()) { res.status = 404; return; }

                // 1. 找 .covers/<basename + 完整扩展>.png
                std::filesystem::path audio = Encoding::to_fs_path(path_u8);
                std::filesystem::path cover_dir = Encoding::to_fs_path(music_dir) / ".covers";
                std::string fname_u8 = Encoding::to_utf8_string(audio.filename());

                static const std::vector<std::string> exts = { ".png", ".jpg", ".jpeg", ".webp" };
                std::filesystem::path found;
                for (const auto &ext : exts) {
                    auto candidate = cover_dir / Encoding::to_fs_path(fname_u8 + ext);
                    std::error_code ec;
                    if (std::filesystem::exists(candidate, ec)) { found = candidate; break; }
                }
                // 也尝试不带 .mp3 后缀的版本
                if (found.empty()) {
                    std::string stem = Encoding::to_utf8_string(audio.stem());
                    for (const auto &ext : exts) {
                        auto candidate = cover_dir / Encoding::to_fs_path(stem + ext);
                        std::error_code ec;
                        if (std::filesystem::exists(candidate, ec)) { found = candidate; break; }
                    }
                }

                if (!found.empty()) {
                    std::string ext = Encoding::to_utf8_string(found.extension());
                    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
                    std::string mime = "image/png";
                    if (ext == ".jpg" || ext == ".jpeg") mime = "image/jpeg";
                    else if (ext == ".webp") mime = "image/webp";

                    std::ifstream ifs(found, std::ios::binary);
                    std::stringstream ss; ss << ifs.rdbuf();
                    res.set_content(ss.str(), mime.c_str());
                    return;
                }

                // 2. 回退到 mp3 内嵌封面
                TrackMetadata meta = AudioDecoder::extract_metadata(path_u8);
                if (!meta.cover_data.empty()) {
                    std::string blob(reinterpret_cast<const char *>(meta.cover_data.data()),
                                     meta.cover_data.size());
                    res.set_content(blob,
                        meta.cover_mime.empty() ? "image/jpeg" : meta.cover_mime.c_str());
                    return;
                }

                res.status = 404;
            } catch (...) { res.status = 500; }
        });

        // =================================================================================
        // Stream API
        // =================================================================================
        svr.Get("/api/stream", [&](const httplib::Request &req, httplib::Response &res) {
            if (!req.has_param("id")) {
                res.status = 400;
                return;
            }

            std::string path_str;
            try {
                int id = std::stoi(req.get_param_value("id"));
                auto info = db.get_track_detail(id);
                path_str = info.filepath;
            } catch (...) {
                res.status = 500;
                return;
            }

            if (path_str.empty()) {
                res.status = 404;
                return;
            }

            // 1. 获取文件大小 (Windows 下使用宽字符路径)
            std::filesystem::path p = Encoding::to_fs_path(path_str);
            std::error_code ec;
            if (!std::filesystem::exists(p, ec)) {
                res.status = 404;
                return;
            }

            // 获取扩展名并判断是否原生支持
            std::string ext = Encoding::to_utf8_string(p.extension());
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);

            // 现代浏览器通常支持的格式 (FLAC 现在支持度很高，故算作原生)
            bool is_native = (ext == ".mp3" || ext == ".wav" || ext == ".flac" ||
                              ext == ".ogg" || ext == ".aac");

            if (is_native) {
                // --- 方案 A: 原生文件流式传输 (无需转码，高效) ---
                auto file_size = std::filesystem::file_size(p, ec);

                std::string content_type = "application/octet-stream";
                if (ext == ".mp3") content_type = "audio/mpeg";
                else if (ext == ".wav") content_type = "audio/wav";
                else if (ext == ".flac") content_type = "audio/flac";
                else if (ext == ".ogg") content_type = "audio/ogg";
                else if (ext == ".aac") content_type = "audio/aac";

                // 3. 告知客户端支持 Range
                res.set_header("Accept-Ranges", "bytes");

                // 4. 设置 Content Provider (核心)
                // 关键：这里传入的是 *完整文件大小* (file_size)
                // httplib 会自动解析 Request 中的 Range 头：
                // - 如果有 Range，它会计算 offset 和 length，设置 Status=206，设置 Content-Range 头
                // - 如果无 Range，它会设置 Content-Length=file_size，Status=200
                // - 然后它会调用下面的 lambda，传入正确的 offset 和 length
                res.set_content_provider(
                    file_size,
                    content_type.c_str(),
                    [p](size_t offset, size_t length, httplib::DataSink &sink) {
                        // 每次回调时打开文件
                        std::ifstream file(p, std::ios::binary);
                        if (!file.is_open()) return false;
                        // 定位到 httplib 计算出的偏移量
                        file.seekg(offset);
                        if (!file) return false;

                        const size_t BUF_SIZE = 16384; // 16KB 缓冲
                        char buffer[BUF_SIZE];
                        size_t remaining = length;
                        while (remaining > 0) {
                            size_t to_read = std::min(remaining, BUF_SIZE);
                            file.read(buffer, to_read);
                            size_t bytes_read = file.gcount();
                            if (bytes_read == 0) break;
                            if (!sink.write(buffer, bytes_read)) return false;
                            remaining -= bytes_read;
                        }
                        return true;
                    }
                );
            } else {
                // --- 方案 B: 内存转码传输 (APE, WMA 等) ---
                // 1. 调用 AudioDecoder 将全曲转码为 WAV Buffer
                try {
                    // 注意：这会将整首歌曲解码到 RAM，对于超大文件可能占用几百 MB 内存
                    // 对于本地单用户应用通常可以接受
                    auto wav_data = std::make_shared<std::vector<uint8_t> >(
                        AudioDecoder::transcode_to_wav(path_str)
                    );

                    // 2. 将数据作为 WAV 提供
                    // 使用 shared_ptr 捕获 wav_data，确保在回调执行期间数据存在
                    res.set_header("Accept-Ranges", "bytes");
                    res.set_content_provider(
                        wav_data->size(),
                        "audio/wav",
                        [wav_data](size_t offset, size_t length, httplib::DataSink &sink) {
                            // 检查越界
                            if (offset >= wav_data->size()) return true;

                            size_t available = wav_data->size() - offset;
                            size_t to_send = std::min(available, length);

                            // 直接发送内存片段
                            if (!sink.write(reinterpret_cast<const char *>(wav_data->data() + offset), to_send)) {
                                return false;
                            }
                            return true;
                        }
                    );
                } catch (const std::exception &e) {
                    std::cerr << "Transcode failed: " << e.what() << std::endl;
                    res.status = 500;
                    res.set_content("Transcoding failed", "text/plain");
                }
            }
        });

        // Export Playlist
        svr.Get("/api/playlist/generate", [&](const httplib::Request &req, httplib::Response &res) {
            float v = 5.0f, a = 5.0f, r = 1.0f;
            int limit = 50;
            float max_duration_mins = -1.0f;

            try {
                if (req.has_param("limit")) {
                    limit = std::stoi(req.get_param_value("limit"));
                }
                if (req.has_param("duration_limit")) {
                    max_duration_mins = std::stof(req.get_param_value("duration_limit"));
                }

                if (req.has_param("seed_id")) {
                    int id = std::stoi(req.get_param_value("seed_id"));
                    auto info = db.get_track_detail(id);
                    v = info.global_valence;
                    a = info.global_arousal;
                } else if (req.has_param("time_hour")) {
                    int hour = std::stoi(req.get_param_value("time_hour"));
                    if (hour >= 6 && hour < 12) { v = 7.5f; a = 7.0f; }
                    else if (hour >= 12 && hour < 18) { v = 6.0f; a = 8.0f; }
                    else if (hour >= 18 && hour < 22) { v = 5.0f; a = 3.0f; }
                    else { v = 3.0f; a = 2.0f; }
                } else {
                    if (req.has_param("v")) v = std::stof(req.get_param_value("v"));
                    if (req.has_param("a")) a = std::stof(req.get_param_value("a"));
                }

                if (req.has_param("r")) {
                    r = std::stof(req.get_param_value("r"));
                }

                // 如果有时长限制，我们先获取比较多的数量，然后在内存中截断
                int query_limit = (max_duration_mins > 0) ? std::max(limit, 500) : limit;

                // 0. 收集要硬排除的歌曲。
                //    v2 推荐里 dislike 已在 SQL 内过滤,但若用户显式设了 exclude_recent_min
                //    且 >0,仍然做硬排除(用户偏好压过软惩罚)。
                std::vector<int> exclude_ids;
                if (req.has_param("exclude_recent_min")) {
                    int mins = std::stoi(req.get_param_value("exclude_recent_min"));
                    if (mins > 0) {
                        auto recent = db.get_recently_played(mins);
                        exclude_ids.insert(exclude_ids.end(), recent.begin(), recent.end());
                    }
                }

                // v1 = 旧版距离单一目标;v2 = 综合排序(距离+喜欢+新鲜度)
                bool use_v2 = !req.has_param("rank") ||
                              req.get_param_value("rank") != "v1";
                bool want_score = req.has_param("debug_score") &&
                                  req.get_param_value("debug_score") == "true";

                std::vector<PlaylistTrack> tracks;
                std::vector<DatabaseManager::RankedTrack> ranked_full;

                if (use_v2) {
                    ranked_full = db.get_playlist_ranked(v, a, r, query_limit, exclude_ids);
                    if (ranked_full.empty()) {
                        // KNN 重心回退
                        auto neighbors = db.get_nearest_neighbors(v, a, 50);
                        if (!neighbors.empty()) {
                            float sum_v = 0, sum_a = 0;
                            for (const auto &n : neighbors) { sum_v += n.v; sum_a += n.a; }
                            v = sum_v / neighbors.size();
                            a = sum_a / neighbors.size();
                            ranked_full = db.get_playlist_ranked(v, a, r, query_limit, exclude_ids);
                            if (ranked_full.empty()) {
                                ranked_full = db.get_playlist_ranked(v, a, r, query_limit);
                            }
                        }
                    }
                    for (auto &rt : ranked_full) tracks.push_back(rt.track);
                } else {
                    // 旧路径
                    if (!req.has_param("include_disliked") ||
                        req.get_param_value("include_disliked") != "true") {
                        auto disliked = db.get_disliked();
                        exclude_ids.insert(exclude_ids.end(), disliked.begin(), disliked.end());
                    }
                    tracks = db.get_playlist(v, a, r, query_limit, exclude_ids);
                    if (tracks.empty()) {
                        auto neighbors = db.get_nearest_neighbors(v, a, 50);
                        if (!neighbors.empty()) {
                            float sum_v = 0, sum_a = 0;
                            for(const auto& n : neighbors) { sum_v += n.v; sum_a += n.a; }
                            v = sum_v / neighbors.size();
                            a = sum_a / neighbors.size();
                            tracks = db.get_playlist(v, a, r, query_limit, exclude_ids);
                            if (tracks.empty())
                                tracks = db.get_playlist(v, a, r, query_limit);
                        }
                    }
                }

                // 3. 处理时长限制
                std::vector<PlaylistTrack> final_tracks;
                if (max_duration_mins > 0) {
                    float total_sec = 0;
                    float max_sec = max_duration_mins * 60.0f;
                    for (const auto& t : tracks) {
                        if (total_sec + t.duration > max_sec) break;
                        final_tracks.push_back(t);
                        total_sec += t.duration;
                        if (final_tracks.size() >= limit) break; // 同时也满足数量限制
                    }
                    tracks = final_tracks;
                } else {
                    // 如果没有时长限制，确保数量限制生效（SQL可能已经做了，但再次确保）
                     if (tracks.size() > limit) {
                         tracks.resize(limit);
                     }
                }

                std::string format = req.get_param_value("format");

                if (format == "json") {
                    json j = json::array();
                    if (use_v2 && want_score && !ranked_full.empty() && tracks.size() <= ranked_full.size()) {
                        for (size_t i = 0; i < tracks.size(); ++i) {
                            const auto &rt = ranked_full[i];
                            const auto &t  = tracks[i];
                            int now_ts = (int) std::time(nullptr);
                            int mins_ago = rt.last_played > 0 ? (now_ts - rt.last_played) / 60 : -1;
                            j.push_back({
                                {"id", t.id}, {"title", t.title}, {"v", t.v}, {"a", t.a},
                                {"path", t.filepath}, {"duration", t.duration},
                                {"score", rt.score}, {"dist", rt.dist},
                                {"feedback", rt.fb},
                                {"last_played_min_ago", mins_ago}
                            });
                        }
                    } else {
                        for (const auto &t: tracks)
                            j.push_back({
                                {"id", t.id}, {"title", t.title}, {"v", t.v}, {"a", t.a},
                                {"path", t.filepath}, {"duration", t.duration}
                            });
                    }
                    res.set_content(j.dump(), "application/json");
                    return;
                }
                std::stringstream ss;
                if (format == "m3u") {
                    ss << "#EXTM3U\n";
                    for (const auto &t: tracks) {
                        ss << "#EXTINF:" << (int)t.duration << "," << t.title << "\n" << t.filepath << "\n";
                    }
                    res.set_header("Content-Disposition", "attachment; filename=playlist.m3u");
                } else if (format == "pls") {
                    // PLS 格式实现 (INI-style)
                    ss << "[playlist]\n";
                    int idx = 1;
                    for (const auto &t: tracks) {
                        ss << "File" << idx << "=" << t.filepath << "\n";
                        ss << "Title" << idx << "=" << t.title << "\n";
                        ss << "Length" << idx << "=" << (int)t.duration << "\n";
                        idx++;
                    }
                    ss << "NumberOfEntries=" << tracks.size() << "\n";
                    ss << "Version=2\n";
                    res.set_header("Content-Disposition", "attachment; filename=playlist.pls");
                } else {
                    // 默认为纯文本 (TXT)
                    for (const auto &t: tracks) ss << t.filepath << "\n";
                    res.set_header("Content-Disposition", "attachment; filename=playlist.txt");
                }
                res.set_content(ss.str(), "text/plain");
            } catch (...) { res.status = 500; }
        });

        // =================================================================================
        // Music Upload API
        // =================================================================================
        // 设置 multipart 上限以支持音频上传 (默认仅 8MB)
        svr.set_payload_max_length(256 * 1024 * 1024); // 256MB

        svr.Post("/api/music/upload", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            if (is_read_only) {
                res.status = 403;
                res.set_content("{\"error\":\"Read-only mode\"}", "application/json");
                return;
            }
            if (music_dir.empty()) {
                res.status = 500;
                res.set_content("{\"error\":\"Music directory not configured\"}", "application/json");
                return;
            }

            try {
                auto files = req.form.get_files("file");
                if (files.empty()) {
                    res.status = 400;
                    res.set_content("{\"error\":\"No file provided\"}", "application/json");
                    return;
                }

                static const std::vector<std::string> allowed_exts = {
                    ".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac",
                    ".ape", ".wma", ".wv", ".aiff"
                };

                json result_arr = json::array();
                int uploaded = 0, skipped = 0;

                for (const auto &f : files) {
                    json item;
                    item["original_name"] = f.filename;

                    // 1. 取出基础文件名 (防止路径穿越)
                    std::filesystem::path src_name(f.filename);
                    std::string base_name = Encoding::to_utf8_string(src_name.filename());
                    if (base_name.empty() || base_name == "." || base_name == "..") {
                        item["status"] = "error";
                        item["error"] = "Invalid filename";
                        result_arr.push_back(item);
                        skipped++;
                        continue;
                    }

                    // 2. 扩展名校验
                    std::string ext = Encoding::to_utf8_string(std::filesystem::path(base_name).extension());
                    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
                    bool ext_ok = false;
                    for (const auto &e : allowed_exts) if (e == ext) { ext_ok = true; break; }
                    if (!ext_ok) {
                        item["status"] = "error";
                        item["error"] = "Unsupported extension";
                        result_arr.push_back(item);
                        skipped++;
                        continue;
                    }

                    // 3. 解决重名 (foo.mp3, foo_1.mp3, foo_2.mp3 ...)
                    std::filesystem::path target_dir = Encoding::to_fs_path(music_dir);
                    std::filesystem::path stem = std::filesystem::path(base_name).stem();
                    std::filesystem::path final_path = target_dir / base_name;
                    int counter = 1;
                    std::error_code ec;
                    while (std::filesystem::exists(final_path, ec) && counter < 10000) {
                        std::string candidate = Encoding::to_utf8_string(stem) + "_" +
                                                std::to_string(counter) + ext;
                        final_path = target_dir / Encoding::to_fs_path(candidate);
                        counter++;
                    }

                    // 4. 写入文件 (二进制)
                    std::ofstream ofs(final_path, std::ios::binary);
                    if (!ofs) {
                        item["status"] = "error";
                        item["error"] = "Cannot write file";
                        result_arr.push_back(item);
                        skipped++;
                        continue;
                    }
                    ofs.write(f.content.data(), static_cast<std::streamsize>(f.content.size()));
                    ofs.close();

                    // 5. 仅登记,不入 ncnn 队列。后续由 /api/music/reanalyze 调用 Python 分析
                    std::string saved_u8 = Encoding::to_utf8_string(final_path);
                    auto [tid, registered] = scanner.register_single_file(saved_u8);

                    item["status"] = "ok";
                    item["track_id"] = tid;
                    item["filename"] = Encoding::to_utf8_string(final_path.filename());
                    item["relative_path"] = std::string("Music_Directory/") +
                                            Encoding::to_utf8_string(final_path.filename());
                    item["registered"] = registered;
                    result_arr.push_back(item);
                    uploaded++;
                }

                json out;
                out["uploaded"] = uploaded;
                out["skipped"] = skipped;
                out["items"] = result_arr;
                res.set_content(out.dump(), "application/json");
            } catch (const std::exception &e) {
                res.status = 500;
                json err;
                err["error"] = std::string("Upload failed: ") + e.what();
                res.set_content(err.dump(), "application/json");
            }
        });

        // =================================================================================
        // Reanalyze API (spawns Python scripts/analyze_all.py)
        // =================================================================================
        svr.Post("/api/music/reanalyze", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            if (is_read_only) {
                res.status = 403;
                res.set_content("{\"error\":\"Read-only mode\"}", "application/json");
                return;
            }
            bool expected = false;
            if (!reanalyze_running.compare_exchange_strong(expected, true)) {
                res.status = 409;
                res.set_content("{\"error\":\"Reanalysis already running\"}", "application/json");
                return;
            }

            bool full = req.has_param("full") && req.get_param_value("full") == "true";

            if (python_exe.empty()) {
                reanalyze_running.store(false);
                res.status = 500;
                res.set_content("{\"error\":\"scripts/.venv not found, see server log\"}",
                                "application/json");
                return;
            }

            std::thread([this, full]() {
                std::string inner = quote(python_exe) + " " + quote(script_analyze_all) +
                                    " --apply --preproc cpp";
                if (!full) inner += " --only-pending";
                std::string cmd = wrap_python_cmd(inner);

                std::cout << "[Reanalyze] $ " << cmd << std::endl;
                broadcast_status("Reanalyzing tracks...");
                int rc = std::system(cmd.c_str());
                std::cout << "[Reanalyze] exit=" << rc << std::endl;

                // 完成后广播一次进度,让前端刷新
                auto [done, failed, total] = db.get_progress_stats();
                std::string j = "{\"done\":" + std::to_string(done) +
                                ",\"failed\":" + std::to_string(failed) +
                                ",\"total\":" + std::to_string(total) +
                                ",\"percentage\":" +
                                std::to_string(total > 0 ? (float)(done + failed) / total * 100.0 : 0.0) +
                                ",\"reanalyzed\":true}";
                broadcast_event("progress", j);
                reanalyze_running.store(false);
            }).detach();

            res.set_content("{\"status\":\"started\"}", "application/json");
        });

        svr.Get("/api/music/reanalyze/status", [&](const httplib::Request &, httplib::Response &res) {
            json j;
            j["running"] = reanalyze_running.load();
            res.set_content(j.dump(), "application/json");
        });

        // =================================================================================
        // LLM Chat (proxy to scripts/llm_chat.py)
        // =================================================================================
        svr.Post("/api/chat", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Content-Type", "application/json");

            // 写入临时输入文件
            auto tmp_dir = std::filesystem::temp_directory_path();
            std::string ts = std::to_string(std::time(nullptr)) + "_" +
                             std::to_string((uintptr_t)(&req) & 0xFFFF);
            auto in_path  = tmp_dir / (std::string("mood_chat_in_")  + ts + ".json");
            auto out_path = tmp_dir / (std::string("mood_chat_out_") + ts + ".json");

            try {
                if (python_exe.empty()) {
                    res.status = 500;
                    json err;
                    err["error"] = "scripts/.venv not found at backend startup";
                    err["hint"]  = "请确保从仓库根目录启动 MusicMoodCLI 或在 scripts/ 下创建 .venv";
                    res.set_content(err.dump(), "application/json");
                    return;
                }
                {
                    std::ofstream ofs(in_path, std::ios::binary);
                    if (!ofs) throw std::runtime_error("cannot open temp input file");
                    ofs.write(req.body.data(),
                              static_cast<std::streamsize>(req.body.size()));
                }

                // 让 Python 直接把结果写到 out_path (argv[2]),不依赖 cmd 的 > 重定向。
                std::string inner = quote(python_exe) + " " + quote(script_llm_chat) +
                                    " " + quote(in_path.string()) +
                                    " " + quote(out_path.string());
                std::string cmd = wrap_python_cmd(inner);
                std::cout << "[Chat] $ " << cmd << std::endl;
                int rc = std::system(cmd.c_str());
                std::cout << "[Chat] exit=" << rc << std::endl;

                std::ifstream ifs(out_path, std::ios::binary);
                std::stringstream ss; ss << ifs.rdbuf();
                std::string out = ss.str();

                std::error_code ec;
                std::filesystem::remove(in_path, ec);
                std::filesystem::remove(out_path, ec);

                if (out.empty()) {
                    res.status = 500;
                    json err;
                    err["error"] = "empty response from chat script";
                    err["exit_code"] = rc;
                    err["hint"] = "请确认 scripts/.venv 已创建且 scripts/llm_chat.py 可用";
                    res.set_content(err.dump(), "application/json");
                    return;
                }
                if (rc != 0) res.status = 502;  // Python 已写错误 JSON,转发即可
                res.set_content(out, "application/json");
            } catch (const std::exception &e) {
                std::error_code ec;
                std::filesystem::remove(in_path, ec);
                std::filesystem::remove(out_path, ec);
                res.status = 500;
                json err; err["error"] = std::string("chat proxy failed: ") + e.what();
                res.set_content(err.dump(), "application/json");
            }
        });

        // =================================================================================
        // Play history + feedback
        // =================================================================================
        svr.Post("/api/play_history", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            try {
                auto j = json::parse(req.body);
                int track_id = j.value("track_id", 0);
                std::string source = j.value("source", "");
                float pct = j.value("played_pct", 0.0f);
                if (track_id <= 0) { res.status = 400;
                    res.set_content("{\"error\":\"missing track_id\"}", "application/json");
                    return; }
                db.log_play(track_id, source, pct);
                res.set_content("{\"status\":\"ok\"}", "application/json");
            } catch (...) { res.status = 400; }
        });

        svr.Post("/api/feedback", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            try {
                auto j = json::parse(req.body);
                int track_id = j.value("track_id", 0);
                std::string kind = j.value("kind", "");
                if (track_id <= 0) { res.status = 400;
                    res.set_content("{\"error\":\"missing track_id\"}", "application/json");
                    return; }
                if (kind == "clear") db.clear_feedback(track_id);
                else if (kind == "like" || kind == "dislike") db.set_feedback(track_id, kind);
                else { res.status = 400;
                    res.set_content("{\"error\":\"invalid kind\"}", "application/json");
                    return; }
                res.set_content("{\"status\":\"ok\"}", "application/json");
            } catch (...) { res.status = 400; }
        });

        svr.Get("/api/feedback", [&](const httplib::Request &, httplib::Response &res) {
            auto all = db.get_all_feedback();
            json j;
            for (auto &[id, kind] : all) j[std::to_string(id)] = kind;
            res.set_content(j.dump(), "application/json");
        });

        // =================================================================================
        // Single-track delete + reanalyze
        // =================================================================================
        svr.Delete(R"(/api/music/(\d+))", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            if (is_read_only) { res.status = 403;
                res.set_content("{\"error\":\"Read-only\"}", "application/json"); return; }
            int id = std::stoi(req.matches[1]);
            bool also_file = req.has_param("delete_file") && req.get_param_value("delete_file") == "true";
            std::string path_u8 = db.get_track_path(id);
            db.delete_track(id);
            if (also_file && !path_u8.empty()) {
                try {
                    std::error_code ec;
                    std::filesystem::remove(Encoding::to_fs_path(path_u8), ec);
                } catch (...) {}
            }
            json out; out["status"] = "ok"; out["deleted_file"] = also_file;
            res.set_content(out.dump(), "application/json");
        });

        svr.Post(R"(/api/music/(\d+)/reanalyze)", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            if (is_read_only) { res.status = 403;
                res.set_content("{\"error\":\"Read-only\"}", "application/json"); return; }
            int id = std::stoi(req.matches[1]);
            db.reset_track_for_reanalysis(id);

            bool expected = false;
            if (!reanalyze_running.compare_exchange_strong(expected, true)) {
                res.status = 409;
                res.set_content("{\"error\":\"Reanalysis already running\"}", "application/json");
                return;
            }
            if (python_exe.empty()) {
                reanalyze_running.store(false);
                res.status = 500;
                res.set_content("{\"error\":\"scripts/.venv not found, see server log\"}",
                                "application/json");
                return;
            }
            std::thread([this]() {
                std::string inner = quote(python_exe) + " " + quote(script_analyze_all) +
                                    " --apply --preproc cpp --only-pending";
                std::string cmd = wrap_python_cmd(inner);
                std::cout << "[Reanalyze:single] $ " << cmd << std::endl;
                std::system(cmd.c_str());
                reanalyze_running.store(false);
                auto [done, failed, total] = db.get_progress_stats();
                std::string j = "{\"done\":" + std::to_string(done) +
                                ",\"failed\":" + std::to_string(failed) +
                                ",\"total\":" + std::to_string(total) +
                                ",\"reanalyzed\":true}";
                broadcast_event("progress", j);
            }).detach();
            res.set_content("{\"status\":\"started\"}", "application/json");
        });

        // =================================================================================
        // User identity + Presence
        // =================================================================================
        svr.Post("/api/user/register", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            try {
                auto j = json::parse(req.body);
                std::string uuid = j.value("uuid", "");
                std::string nickname = j.value("nickname", "匿名用户");
                if (uuid.empty() || uuid.size() > 64) {
                    res.status = 400;
                    res.set_content("{\"error\":\"invalid uuid\"}", "application/json");
                    return;
                }
                if (nickname.size() > 32) nickname = nickname.substr(0, 32);
                int id = db.register_user(uuid, nickname);
                if (id <= 0) {
                    res.status = 500;
                    res.set_content("{\"error\":\"failed to register\"}", "application/json");
                    return;
                }
                std::string out_uuid, out_nick;
                db.get_user(id, out_uuid, out_nick);
                json out;
                out["user_id"]  = id;
                out["uuid"]     = out_uuid;
                out["nickname"] = out_nick;
                res.set_content(out.dump(), "application/json");
            } catch (...) { res.status = 400; }
        });

        svr.Post("/api/presence", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            try {
                auto j = json::parse(req.body);
                int user_id = j.value("user_id", 0);
                if (user_id <= 0) {
                    res.status = 400;
                    res.set_content("{\"error\":\"missing user_id\"}", "application/json");
                    return;
                }
                std::string mood   = j.value("mood_label", "");
                float v            = j.value("valence", 5.0f);
                float a            = j.value("arousal", 5.0f);
                int track_id       = j.value("current_track_id", 0);
                std::string source = j.value("source", "");
                db.update_presence(user_id, mood, v, a, track_id, source);
                res.set_content("{\"status\":\"ok\"}", "application/json");
            } catch (...) { res.status = 400; }
        });

        svr.Get("/api/presence/summary", [&](const httplib::Request &req, httplib::Response &res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            int window_sec = 300;
            int top_n = 5;
            int min_listeners = 1; // 演示场景默认门槛 1, ≥ 3 时启用隐私门槛
            if (req.has_param("window")) window_sec = std::max(30, std::stoi(req.get_param_value("window")));
            if (req.has_param("top_n"))  top_n      = std::max(1,  std::stoi(req.get_param_value("top_n")));
            if (req.has_param("min_listeners")) min_listeners = std::max(1, std::stoi(req.get_param_value("min_listeners")));

            int active = db.count_active_users(window_sec);
            auto moods = db.get_active_mood_distribution(window_sec);
            auto tracks = db.get_top_active_tracks(window_sec, top_n, min_listeners);

            json out;
            out["active_users"] = active;
            out["window_sec"] = window_sec;
            json jm = json::array();
            for (auto &m : moods)
                jm.push_back({{"label", m.label}, {"count", m.count},
                              {"sample_valence", m.sample_v}, {"sample_arousal", m.sample_a}});
            out["moods"] = jm;
            json jt = json::array();
            for (auto &t : tracks)
                jt.push_back({{"track_id", t.track_id}, {"title", t.title}, {"count", t.count}});
            out["top_tracks"] = jt;
            res.set_content(out.dump(), "application/json");
        });

        // FS Browse
        svr.Get("/api/fs/browse", [&](const httplib::Request &req, httplib::Response &res) {
             if (is_read_only) {
                res.status = 403;
                return;
            }
            std::string path_u8 = req.has_param("path") ? req.get_param_value("path") : "";
            json result = json::array();
            try {
                if (path_u8.empty()) {
#ifdef _WIN32
                    DWORD drives = GetLogicalDrives();
                    for (int i = 0; i < 26; i++) {
                        if (drives & (1 << i)) {
                            std::string drive = std::string(1, 'A' + i) + ":/";
                            result.push_back({{"name", drive}, {"path", drive}, {"is_dir", true}});
                        }
                    }
#else
                    result.push_back({{"name", "/"}, {"path", "/"}, {"is_dir", true}});
#endif
                } else {
                    std::filesystem::path p = Encoding::to_fs_path(path_u8);
                    std::error_code ec;
                    if (std::filesystem::exists(p, ec) && std::filesystem::is_directory(p, ec)) {
                        if (p.has_parent_path() && p != p.root_path()) {
                            result.push_back({
                                {"name", ".."}, {"path", Encoding::to_utf8_string(p.parent_path())}, {"is_dir", true}
                            });
                        }
                        for (const auto &entry: std::filesystem::directory_iterator(
                                 p, std::filesystem::directory_options::skip_permission_denied)) {
                            try {
                                std::string name_u8 = Encoding::to_utf8_string(entry.path().filename());
                                std::string full_path_u8 = Encoding::to_utf8_string(entry.path());
                                if (name_u8.empty() || name_u8[0] == '.') continue;
                                if (entry.is_directory()) {
                                    result.push_back({{"name", name_u8}, {"path", full_path_u8}, {"is_dir", true}});
                                }
                            } catch (...) { continue; }
                        }
                    }
                }
                res.set_content(result.dump(), "application/json");
            } catch (...) { res.status = 500; }
        });
    }
};
