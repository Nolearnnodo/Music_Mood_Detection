#pragma once
#include "EmotionTypes.h"
#include <string>
#include <memory>
#include <vector>
#include <utility>

// 前向声明
namespace ncnn {
    class Net;
}

class FeatureExtractor;

class EmotionPredictor {
public:
    EmotionPredictor(const std::string &model_dir, bool use_vulkan = true, int device_index = 0);

    ~EmotionPredictor();

    // 核心接口：分析单首歌曲
    AnalysisResult analyze(const std::string &filepath);

private:
    std::unique_ptr<ncnn::Net> net1;
    std::unique_ptr<ncnn::Net> net2;
    std::unique_ptr<FeatureExtractor> extractor;

    bool vk_enabled;

    std::pair<float, float> calculate_geometric_median(const std::vector<EmotionPoint>& points);
};