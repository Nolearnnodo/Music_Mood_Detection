#include "EmotionPredictor.h"
#include "FeatureExtractor.h"
#include "AudioDecoder.h"
#include "net.h"  // ncnn
#include "gpu.h"  // ncnn gpu
#include <iostream>
#include <filesystem>
#include <algorithm>
#include <Eigen/Dense>

namespace fs = std::filesystem;

// 硬编码的模型参数
static const int MODEL_SR = 16000;
static const int MODEL_N_FFT = 512;
static const int MODEL_HOP = 256;
static const int MODEL_N_MELS = 96;
static const int MODEL_INPUT_FRAMES = 187;

EmotionPredictor::EmotionPredictor(const std::string &model_dir, bool use_vulkan, int device_index) {
    net1 = std::make_unique<ncnn::Net>();
    net2 = std::make_unique<ncnn::Net>();
    extractor = std::make_unique<FeatureExtractor>(MODEL_SR, MODEL_N_FFT, MODEL_HOP, MODEL_N_MELS);

    vk_enabled = use_vulkan;

    // Vulkan 初始化逻辑
    if (use_vulkan) {
        int gpu_count = ncnn::get_gpu_count();
        if (gpu_count == 0) {
            std::cerr << "[Warning] Vulkan enabled but no GPU found. Falling back to CPU." << std::endl;
            vk_enabled = false;
            net1->opt.use_vulkan_compute = false;
            net2->opt.use_vulkan_compute = false;
        } else {
            if (device_index < 0 || device_index >= gpu_count) {
                std::cerr << "[Warning] Invalid Vulkan device index " << device_index
                        << ". Using default 0." << std::endl;
                device_index = 0;
            }

            // 开启 Vulkan
            net1->opt.use_vulkan_compute = true;
            net2->opt.use_vulkan_compute = true;

            // 指定设备
            net1->set_vulkan_device(device_index);
            net2->set_vulkan_device(device_index);

            std::cout << "[Info] Using Vulkan GPU index: " << device_index << std::endl;
        }
    } else {
        net1->opt.use_vulkan_compute = false;
        net2->opt.use_vulkan_compute = false;
    }

    // 路径拼接
    fs::path dir(model_dir);
    std::string m1_param = (dir / "msd_musicnn_1.ncnn.param").string();
    std::string m1_bin = (dir / "msd_musicnn_1.ncnn.bin").string();
    std::string m2_param = (dir / "deam_msd_musicnn_2.ncnn.param").string();
    std::string m2_bin = (dir / "deam_msd_musicnn_2.ncnn.bin").string();

    if (net1->load_param(m1_param.c_str()) != 0 || net1->load_model(m1_bin.c_str()) != 0) {
        throw std::runtime_error("Failed to load MusicNN model from: " + model_dir);
    }
    if (net2->load_param(m2_param.c_str()) != 0 || net2->load_model(m2_bin.c_str()) != 0) {
        throw std::runtime_error("Failed to load DEAM Regressor model from: " + model_dir);
    }
}

EmotionPredictor::~EmotionPredictor() {
    // ncnn::Net 会自动清理
}

std::pair<float, float> EmotionPredictor::calculate_geometric_median(const std::vector<EmotionPoint>& points) {
    if (points.empty()) return {5.0f, 5.0f}; // 默认 fallback
    if (points.size() == 1) return {points[0].valence, points[0].arousal};

    // 1. 初始化：使用算术平均作为初始猜测点
    Eigen::Vector2f current_estimate(0.0f, 0.0f);
    for (const auto& p : points) {
        current_estimate += Eigen::Vector2f(p.valence, p.arousal);
    }
    current_estimate /= (float)points.size();

    // 2. 迭代参数
    const int max_iterations = 50;
    const float tolerance = 1e-5f;
    const float epsilon = 1e-6f; // 防止除零

    for (int iter = 0; iter < max_iterations; ++iter) {
        Eigen::Vector2f numerator(0.0f, 0.0f);
        float denominator = 0.0f;

        for (const auto& p : points) {
            Eigen::Vector2f point(p.valence, p.arousal);
            float dist = (point - current_estimate).norm();

            // 权重是距离的倒数 w_i = 1 / ||x_i - y||
            // 如果 current_estimate 恰好落在某个点上，dist 会接近 0
            float weight = 1.0f / std::max(dist, epsilon);

            numerator += point * weight;
            denominator += weight;
        }

        if (denominator == 0.0f) break; // 理论上不会发生

        Eigen::Vector2f next_estimate = numerator / denominator;

        // 检查收敛
        if ((next_estimate - current_estimate).norm() < tolerance) {
            current_estimate = next_estimate;
            break;
        }

        current_estimate = next_estimate;
    }

    return {current_estimate.x(), current_estimate.y()};
}

AnalysisResult EmotionPredictor::analyze(const std::string &filepath) {
    AnalysisResult result;
    result.filepath = filepath;

    // 1. 解码音频
    auto audio_pcm = AudioDecoder::load_audio(filepath, MODEL_SR);
    if (audio_pcm.empty()) throw std::runtime_error("Decoded audio is empty");

    result.duration_sec = (float) audio_pcm.size() / MODEL_SR;

    // 2. 提取特征
    // mel_spec: [Time, Freq] -> [Frames, 96]
    Eigen::MatrixXf mel_spec = extractor->compute_melspectrogram(audio_pcm);

    int total_frames = mel_spec.rows(); // Time axis (Frames)

    if (total_frames < MODEL_INPUT_FRAMES) {
        throw std::runtime_error("Audio is too short for analysis (< 3s)");
    }

    // 3. 滑动窗口推理
    float overlap_seconds = 1.0f;
    int overlap_frames = (int) (overlap_seconds * MODEL_SR / MODEL_HOP);
    int stride = MODEL_INPUT_FRAMES - overlap_frames;
    if (stride <= 0) stride = MODEL_INPUT_FRAMES / 2;

    int last_start = total_frames - MODEL_INPUT_FRAMES + 1;

    const char *input_name1 = "in0";
    const char *output_name1 = "out1"; // MusicNN Embedding output
    const char *input_name2 = "in0";
    const char *output_name2 = "out0"; // Regressor output (V, A)

    for (int start = 0; start < last_start; start += stride) {
        // NCNN Mat 构造与数据填充
        // 原始逻辑：ncnn::Mat(w, h) -> w=MELS(96), h=FRAMES(187)
        // 也就是说：行(Row)代表时间帧，列(Col/w)代表频率特征

        ncnn::Mat in1(MODEL_N_MELS, MODEL_INPUT_FRAMES); // w=96, h=187

        for (int r = 0; r < MODEL_INPUT_FRAMES; ++r) {
            float *ptr = in1.row(r); // 获取第 r 行 (第 r 个时间帧)
            for (int c = 0; c < MODEL_N_MELS; ++c) {
                // mel_spec 是 [Frames, 96]，所以取 (start + r, c)
                ptr[c] = mel_spec(start + r, c);
            }
        }

        // 模型 1 推理
        ncnn::Extractor ex1 = net1->create_extractor();

        ex1.input(input_name1, in1);
        ncnn::Mat embed_out;
        ex1.extract(output_name1, embed_out);

        // 模型 2 推理
        ncnn::Extractor ex2 = net2->create_extractor();

        ex2.input(input_name2, embed_out);
        ncnn::Mat va_out;
        ex2.extract(output_name2, va_out);

        // 收集结果
        float v = va_out[0];
        float a = va_out[1];

        // 计算当前窗口的中心时间点
        float center_frame = start + (MODEL_INPUT_FRAMES / 2.0f);
        float timestamp = center_frame * MODEL_HOP / MODEL_SR;

        EmotionPoint p;
        p.time_sec = timestamp;
        p.valence = v;
        p.arousal = a;
        result.trajectory.push_back(p);
    }

    // 4. 使用 Weiszfeld 算法计算全局质心 (Geometric Median)
    if (!result.trajectory.empty()) {
        std::pair<float, float> median = calculate_geometric_median(result.trajectory);
        result.global_valence = median.first;
        result.global_arousal = median.second;
    }

    return result;
}
