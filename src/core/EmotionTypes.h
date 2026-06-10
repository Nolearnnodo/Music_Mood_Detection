#pragma once
#include <vector>
#include <string>

// 单个时间点的情绪数据
struct EmotionPoint {
    float time_sec; // 时间戳（秒）
    float valence; // 愉悦度
    float arousal; // 激动度
};

// 完整的分析结果
struct AnalysisResult {
    std::string filepath;
    float global_valence = 0.0f; // 整首歌的平均愉悦度
    float global_arousal = 0.0f; // 整首歌的平均激动度
    float duration_sec = 0.0f; // 歌曲总时长
    std::vector<EmotionPoint> trajectory; // 随时间变化的轨迹
};
