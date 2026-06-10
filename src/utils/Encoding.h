#pragma once

#include <string>
#include <filesystem>
#include <vector>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <winsock2.h>
#include <windows.h>
#endif

namespace Encoding {
#ifdef _WIN32
    // Windows: UTF-8 std::string <-> std::wstring
    inline std::wstring utf8_to_wstring(const std::string &utf8_str) {
        if (utf8_str.empty()) return L"";
        int size_needed = MultiByteToWideChar(CP_UTF8, 0, utf8_str.c_str(), (int) utf8_str.size(), nullptr, 0);
        std::wstring wstr(size_needed, 0);
        MultiByteToWideChar(CP_UTF8, 0, utf8_str.c_str(), (int) utf8_str.size(), &wstr[0], size_needed);
        return wstr;
    }

    inline std::string wstring_to_utf8(const std::wstring &wstr) {
        if (wstr.empty()) return "";
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int) wstr.size(), nullptr, 0, nullptr,
                                              nullptr);
        std::string str(size_needed, 0);
        WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int) wstr.size(), &str[0], size_needed, nullptr, nullptr);
        return str;
    }

    // Windows: 路径互转辅助
    // 1. 从 UTF-8 字符串创建 fs::path (内部存储为 wstring)
    inline std::filesystem::path to_fs_path(const std::string &utf8_path) {
        return std::filesystem::path(utf8_to_wstring(utf8_path));
    }

    // 2. 从 fs::path 获取 UTF-8 字符串
    inline std::string to_utf8_string(const std::filesystem::path &path) {
        return wstring_to_utf8(path.wstring());
    }
#else
    // Linux/macOS: 默认就是 UTF-8，直接透传
    inline std::filesystem::path to_fs_path(const std::string &utf8_path) {
        return std::filesystem::path(utf8_path);
    }

    inline std::string to_utf8_string(const std::filesystem::path &path) {
        return path.string();
    }
#endif

    inline std::string base64_encode(const unsigned char *data, size_t len) {
        static const char *base64_chars =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                "abcdefghijklmnopqrstuvwxyz"
                "0123456789+/";

        std::string ret;
        int i = 0;
        int j = 0;
        unsigned char char_array_3[3];
        unsigned char char_array_4[4];

        while (len--) {
            char_array_3[i++] = *(data++);
            if (i == 3) {
                char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
                char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
                char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
                char_array_4[3] = char_array_3[2] & 0x3f;

                for (i = 0; (i < 4); i++)
                    ret += base64_chars[char_array_4[i]];
                i = 0;
            }
        }

        if (i) {
            for (j = i; j < 3; j++)
                char_array_3[j] = '\0';

            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;

            for (j = 0; (j < i + 1); j++)
                ret += base64_chars[char_array_4[j]];

            while (i++ < 3)
                ret += '=';
        }

        return ret;
    }
}
