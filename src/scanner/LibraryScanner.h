#pragma once
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include <filesystem>
#include <queue>
#include <functional>
#include <vector>
#include <iostream>
#include <algorithm>
#include "../db/DatabaseManager.h"
#include "../core/EmotionPredictor.h"
#include "../utils/Encoding.h"

namespace fs = std::filesystem;

// 简单的线程安全队列
template<typename T>
class SafeQueue {
    std::queue<T> q;
    std::mutex m;
    std::condition_variable cv;
    bool closed = false;

public:
    void push(T item) {
        std::lock_guard<std::mutex> lock(m);
        q.push(item);
        cv.notify_one();
    }

    bool pop(T &item) {
        std::unique_lock<std::mutex> lock(m);
        cv.wait(lock, [this] { return !q.empty() || closed; });
        if (q.empty() && closed) return false;
        item = q.front();
        q.pop();
        return true;
    }

    void close() {
        std::lock_guard<std::mutex> lock(m);
        closed = true;
        cv.notify_all();
    }

    void open() {
        std::lock_guard<std::mutex> lock(m);
        closed = false;
    }

    size_t size() {
        std::lock_guard<std::mutex> lock(m);
        return q.size();
    }
};

struct ScanTask {
    int id;
    std::string path;
};

class LibraryScanner {
    DatabaseManager &db;
    EmotionPredictor &predictor;

    std::vector<std::thread> workers;
    SafeQueue<ScanTask> task_queue;
    std::atomic<bool> running;

    std::function<void(const std::string &)> event_callback;

public:
    LibraryScanner(DatabaseManager &_db, EmotionPredictor &_pred)
        : db(_db), predictor(_pred), running(false) {
    }

    ~LibraryScanner() {
        stop();
    }

    void set_event_callback(std::function<void(const std::string &)> cb) {
        event_callback = cb;
    }

    void start_workers(int num_threads = 2) {
        if (running) return;
        running = true;
        task_queue.open();

        int n = num_threads > 0 ? num_threads : std::thread::hardware_concurrency() / 2;
        if (n < 1) n = 1;

        std::cout << "Starting " << n << " worker threads..." << std::endl;
        for (int i = 0; i < n; ++i) {
            workers.emplace_back(&LibraryScanner::worker_loop, this);
        }
    }

    void stop() {
        running = false;
        task_queue.close();
        for (auto &t: workers) {
            if (t.joinable()) t.join();
        }
        workers.clear();
    }

    void resume_scans() {
        std::thread([this]() {
            // 给 UI 一点时间建立连接，以便看到“Resuming”提示
            std::this_thread::sleep_for(std::chrono::milliseconds(500));

            auto pending_tracks = db.get_incomplete_tracks();
            if (pending_tracks.empty()) return;

            std::cout << "Resuming " << pending_tracks.size() << " interrupted tasks..." << std::endl;
            notify_sse("status", "{\"msg\": \"Resuming interrupted scans...\"}");

            for (const auto &item: pending_tracks) {
                // 重置状态为 0 (以防它是 1) - 这一步是可选的，因为 worker 会覆盖状态
                // 但为了严谨，worker 取走时才变 1

                // 推入队列
                task_queue.push({item.first, item.second});
            }

            // 立即广播一次进度
            broadcast_progress();
        }).detach();
    }

    // 把单个文件加入分析队列。返回 {track_id, queued}。
    // queued=false 表示文件之前已分析完成，未重新入队。
    std::pair<int, bool> enqueue_single_file(const std::string &utf8_file_path) {
        auto [id, is_new] = db.add_or_get_track(utf8_file_path);
        if (is_new) {
            task_queue.push({id, utf8_file_path});
            broadcast_progress();
        }
        return {id, is_new};
    }

    // 仅把文件登记进数据库 (status=0),不入 ncnn 队列。
    // 用于由外部分析器 (例如 scripts/analyze_all.py) 接管推理的场景。
    std::pair<int, bool> register_single_file(const std::string &utf8_file_path) {
        auto [id, is_new] = db.add_or_get_track(utf8_file_path);
        if (is_new) broadcast_progress();
        return {id, is_new};
    }

    void add_folder_async(const std::string &utf8_folder_path) {
        // 复制一份 path 避免 lambda 引用失效
        std::string folder_path_copy = utf8_folder_path;

        std::thread([this, folder_path_copy]() {
            // 1. 存入数据库的是 UTF-8 字符串
            db.add_directory(folder_path_copy);

            notify_sse("status", "{\"msg\": \"Pruning missing files...\"}");

            std::vector<std::string> target_dirs;
            target_dirs.push_back(folder_path_copy);
            db.prune_missing_tracks(target_dirs);

            notify_sse("status", "{\"msg\": \"Scanning directory...\"}");

            int added_count = 0;

            // 2. 构造 fs::path (Windows 下会自动转 wstring，防止乱码)
            fs::path root = Encoding::to_fs_path(folder_path_copy);

            std::error_code ec;
            if (!fs::exists(root, ec)) {
                // 打印时需注意，控制台可能不支持 UTF-8，但这里为了调试先打印 UTF-8
                std::cerr << "Directory not found: " << folder_path_copy << std::endl;
                return;
            }

            // 递归迭代器
            auto it = fs::recursive_directory_iterator(root, fs::directory_options::skip_permission_denied, ec);
            auto end = fs::recursive_directory_iterator();

            if (ec) {
                std::cerr << "Failed to open iterator: " << ec.message() << std::endl;
                return;
            }

            while (it != end && running) {
                try {
                    const auto &entry = *it;

                    if (entry.is_regular_file(ec)) {
                        // 3. 获取扩展名 (Windows 下从 wstring 获取并转 UTF-8，避免 ANSI 转换异常)
                        std::string ext = Encoding::to_utf8_string(entry.path().extension());
                        std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);

                        if (ext == ".mp3" || ext == ".wav" || ext == ".flac" ||
                            ext == ".m4a" || ext == ".ogg" || ext == ".aac" ||
                            ext == ".ape" || ext == ".wma" || ext == ".wv" || ext == ".aiff") {
                            // 4. 获取完整路径 (安全转换)
                            std::string path_u8 = Encoding::to_utf8_string(entry.path());

                            auto [id, is_new] = db.add_or_get_track(path_u8);
                            if (is_new) {
                                task_queue.push({id, path_u8});
                                added_count++;
                            }
                        }
                    }

                    it.increment(ec);
                } catch (const std::exception &e) {
                    std::cerr << "Scan exception: " << e.what() << ". Skipping." << std::endl;
                    it.increment(ec);
                }
            }

            std::cout << "Added " << added_count << " tasks from " << folder_path_copy << std::endl;
            broadcast_progress();
        }).detach();
    }

private:
    void worker_loop() {
        ScanTask task;
        while (running && task_queue.pop(task)) {
            try {
                auto result = predictor.analyze(task.path);
                db.save_analysis(task.id, result);
                broadcast_progress();
            } catch (const std::exception &e) {
                std::cerr << "Error analyzing ID " << task.id << ": " << e.what() << std::endl;
                db.mark_error(task.id);
                broadcast_progress();
            }
        }
    }

    void broadcast_progress() {
        auto [done, failed, total] = db.get_progress_stats();
        std::string json = "{\"done\":" + std::to_string(done) +
                           ", \"failed\":" + std::to_string(failed) +
                           ", \"total\":" + std::to_string(total) +
                           ", \"percentage\":" + std::to_string(total > 0 ? (float) (done + failed) / total * 100.0 : 0.0) + "}";
        notify_sse("progress", json);
    }

    void notify_sse(const std::string &event, const std::string &data) {
        if (event_callback) {
            event_callback("event: " + event + "\ndata: " + data + "\n\n");
        }
    }
};
