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
#include <climits>
#include <memory>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

using json = nlohmann::json;

class WebServer {
    httplib::Server svr;
    DatabaseManager &db;
    LibraryScanner *scanner;
    std::string web_root;
    bool is_read_only;
    bool serve_static_files;

    std::mutex sse_mtx;
    std::set<httplib::DataSink *> sse_clients;

    std::vector<std::string> active_directories;

public:
    WebServer(DatabaseManager &_db, LibraryScanner *_sc, const std::string &_web_root,
              const std::string &host, int port, bool read_only, bool serve_static = true)
        : db(_db), scanner(_sc), web_root(_web_root), is_read_only(read_only || _sc == nullptr),
          serve_static_files(serve_static) {

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

        if (!active_directories.empty()) {
            std::cout << "[Init] Pruning missing files in " << active_directories.size() << " active directories..." << std::endl;
            db.prune_missing_tracks(active_directories);
        } else {
            std::cout << "[Init] No active directories found. Skipping prune." << std::endl;
        }

        if (scanner) {
            scanner->start_workers(3);
            scanner->resume_scans();

            scanner->set_event_callback([this](const std::string &msg) {
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
        } else {
            std::cout << "[Init] Analysis disabled. Running with existing database only." << std::endl;
        }

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
                if (!scanner) {
                    res.status = 403;
                    res.set_content("{\"error\":\"Analysis disabled\"}", "application/json");
                    return;
                }
                scanner->add_folder_async(path);

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

                // 1. 获取列表
                auto tracks = db.get_playlist(v, a, r, query_limit);

                // 2. K-NN 重心回退机制
                if (tracks.empty()) {
                    auto neighbors = db.get_nearest_neighbors(v, a, 50);
                    if (!neighbors.empty()) {
                        float sum_v = 0, sum_a = 0;
                        for(const auto& n : neighbors) {
                            sum_v += n.v;
                            sum_a += n.a;
                        }
                        v = sum_v / neighbors.size();
                        a = sum_a / neighbors.size();
                        tracks = db.get_playlist(v, a, r, query_limit);
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
                    for (const auto &t: tracks)
                        j.push_back({
                            {"id", t.id}, {"title", t.title}, {"v", t.v}, {"a", t.a},
                            {"path", t.filepath}, {"duration", t.duration}
                        });
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
