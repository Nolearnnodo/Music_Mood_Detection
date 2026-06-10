#include <iostream>
#include <filesystem>
#include <string>
#include "core/EmotionPredictor.h"
#include "db/DatabaseManager.h"
#include "scanner/LibraryScanner.h"
#include "server/WebServer.h"

void print_help(const char *prog_name) {
    std::cout << "Usage: " << prog_name << " [options]\n"
            << "Options:\n"
            << "  --host <ip>       Listen address (default: 127.0.0.1)\n"
            << "  --port <port>     Listen port (default: 8080)\n"
            << "  --vk-index <idx>  Vulkan device index (default: 0)\n"
            << "  --no-vulkan       Disable Vulkan GPU acceleration\n"
            << "  --read-only       Disable folder modification APIs\n"
            << "  --api-only        Start API server without serving built frontend files\n"
            << "  --web-root <dir>  Static frontend directory (default: ./web)\n"
            << "  --model-dir <dir> AI model directory (default: ./models)\n"
            << "  --help            Show this help\n";
}

int main(int argc, char *argv[]) {
    // 默认配置
    std::string model_dir = "./models";
    std::string web_root = "./web";
    std::string db_path = "music_mood.db";
    std::string host = "127.0.0.1";
    int port = 8080;
    int vk_device_index = 0;
    bool use_vulkan = true;
    bool read_only = false;
    bool api_only = false;

    // 简单的参数解析
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--host" && i + 1 < argc) {
            host = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        } else if (arg == "--vk-index" && i + 1 < argc) {
            vk_device_index = std::stoi(argv[++i]);
        } else if (arg == "--no-vulkan") {
            use_vulkan = false;
        } else if (arg == "--read-only") {
            read_only = true;
        } else if (arg == "--api-only") {
            api_only = true;
        } else if (arg == "--web-root" && i + 1 < argc) {
            web_root = argv[++i];
        } else if (arg == "--model-dir" && i + 1 < argc) {
            model_dir = argv[++i];
        } else if (arg == "--help") {
            print_help(argv[0]);
            return 0;
        } else {
            std::cerr << "Unknown argument: " << arg << std::endl;
            print_help(argv[0]);
            return 1;
        }
    }

    std::cout << "--- Configuration ---\n"
            << "Host: " << host << "\n"
            << "Port: " << port << "\n"
            << "Vulkan: " << (use_vulkan ? "Enabled" : "Disabled") << "\n"
            << "Read-Only: " << (read_only ? "Yes" : "No") << "\n";
    std::cout << "API Only: " << (api_only ? "Yes" : "No") << "\n"
            << "Model Dir: " << model_dir << "\n";
    if (!api_only) {
        std::cout << "Web Root: " << web_root << "\n";
    }
    if (use_vulkan) {
        std::cout << "Vulkan Device Index: " << vk_device_index << "\n";
    }
    std::cout << "---------------------\n";

    // 1. 初始化数据库
    std::cout << "Initializing Database..." << std::endl;
    DatabaseManager db(db_path);

    // 2. 初始化 AI 模型
    std::cout << "Loading AI Models from " << model_dir << "..." << std::endl;
    try {
        // 传入 Vulkan 配置
        EmotionPredictor predictor(model_dir, use_vulkan, vk_device_index);

        // 3. 初始化扫描器
        LibraryScanner scanner(db, predictor);

        // 4. 启动 Web 服务器 (阻塞运行)
        // 传入 host 和 port, read_only
        WebServer server(db, scanner, web_root, host, port, read_only, !api_only);
    } catch (const std::exception &e) {
        std::cerr << "Fatal Error: " << e.what() << std::endl;
        return -1;
    }

    return 0;
}
