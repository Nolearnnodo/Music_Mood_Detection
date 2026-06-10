#pragma once

#include <vector>
#include <cmath>
#include <algorithm>
#include <Eigen/Dense>
#include <fftw3.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

class FeatureExtractor {
    int sr;
    int n_fft;
    int hop_length;
    int n_mels;
    Eigen::MatrixXf mel_basis;
    std::vector<float> window;

public:
    FeatureExtractor(int sr = 16000, int n_fft = 512, int hop_length = 256, int n_mels = 96)
        : sr(sr), n_fft(n_fft), hop_length(hop_length), n_mels(n_mels) {
        // 初始化 Hann 窗函数
        window.resize(n_fft);
        for (int i = 0; i < n_fft; ++i) {
            window[i] = 0.5f * (1.0f - std::cos(2.0f * (float) M_PI * i / n_fft));
        }
        create_mel_basis_slaney();
    }

    // 计算 Mel 频谱
    // 返回矩阵：[FrameCount, n_mels] (注意这里为了方便模型输入，做了转置)
    Eigen::MatrixXf compute_melspectrogram(const std::vector<float> &raw_audio) {
        if (raw_audio.empty()) return Eigen::MatrixXf(0, 0);

        // 1. Padding (Center Padding)
        int pad_len = n_fft / 2;
        std::vector<float> audio(raw_audio.size() + 2 * pad_len, 0.0f);
        std::copy(raw_audio.begin(), raw_audio.end(), audio.begin() + pad_len);

        int n_frames = (int) ((audio.size() - n_fft) / hop_length) + 1;
        if (n_frames <= 0) return Eigen::MatrixXf(0, 0);

        int n_freqs = n_fft / 2 + 1;
        Eigen::MatrixXf magnitudes(n_freqs, n_frames);

        // 2. STFT using FFTW
        fftwf_complex *out = (fftwf_complex *) fftwf_malloc(sizeof(fftwf_complex) * n_freqs);
        float *in = (float *) fftwf_malloc(sizeof(float) * n_fft);

        // 创建 Plan (FFTW_ESTIMATE 更快初始化)
        fftwf_plan p = fftwf_plan_dft_r2c_1d(n_fft, in, out, FFTW_ESTIMATE);

        for (int t = 0; t < n_frames; ++t) {
            // 加窗
            for (int i = 0; i < n_fft; ++i) {
                in[i] = audio[t * hop_length + i] * window[i];
            }
            fftwf_execute(p);

            // 计算功率谱 Power Spectrum
            for (int i = 0; i < n_freqs; ++i) {
                magnitudes(i, t) = (out[i][0] * out[i][0] + out[i][1] * out[i][1]);
            }
        }

        fftwf_destroy_plan(p);
        fftwf_free(in);
        fftwf_free(out);

        // 3. Mel 映射与对数压缩
        // mel_spec: [n_mels, n_frames]
        Eigen::MatrixXf mel_spec = mel_basis * magnitudes;

        // 转置为 [n_frames, n_mels] 以便行切片
        Eigen::MatrixXf mel_spec_t = mel_spec.transpose();

        // Log10 (dB-like compression)
        for (int i = 0; i < mel_spec_t.rows(); ++i) {
            for (int j = 0; j < mel_spec_t.cols(); ++j) {
                // log10(1 + 10000 * x)
                mel_spec_t(i, j) = std::log10(10000.0f * mel_spec_t(i, j) + 1.0f);
            }
        }
        return mel_spec_t;
    }

private:
    // Slaney 风格的 Mel 滤波器组生成 (librosa 默认风格)
    void create_mel_basis_slaney() {
        float fmin = 0.0f;
        float fmax = float(sr) / 2.0f;

        // 频率到 Mel 的转换以及间隔
        float min_log_hz = 1000.0f;
        float min_log_mel = (min_log_hz - fmin) / (200.0f / 3.0f);
        float logstep = std::log(6.4f) / 27.0f;
        float f_sp = 200.0f / 3.0f;

        auto hz_to_mel = [&](float f) -> float {
            if (f < min_log_hz) return (f - fmin) / f_sp;
            return min_log_mel + std::log(f / min_log_hz) / logstep;
        };

        auto mel_to_hz = [&](float m) -> float {
            if (m < min_log_mel) return fmin + m * f_sp;
            return min_log_hz * std::exp(logstep * (m - min_log_mel));
        };

        float max_mel = hz_to_mel(fmax);

        int n_points = n_mels + 2;
        std::vector<float> mel_freqs(n_points);
        for (int i = 0; i < n_points; ++i) {
            mel_freqs[i] = mel_to_hz(i * max_mel / (n_points - 1));
        }

        int n_freqs = n_fft / 2 + 1;
        mel_basis = Eigen::MatrixXf::Zero(n_mels, n_freqs);

        for (int i = 0; i < n_mels; ++i) {
            float f_prev = mel_freqs[i];
            float f_curr = mel_freqs[i + 1];
            float f_next = mel_freqs[i + 2];

            for (int j = 0; j < n_freqs; ++j) {
                float f = (float) j * sr / n_fft;

                if (f >= f_prev && f <= f_curr) {
                    mel_basis(i, j) = (f - f_prev) / (f_curr - f_prev);
                } else if (f > f_curr && f <= f_next) {
                    mel_basis(i, j) = (f_next - f) / (f_next - f_curr);
                }
            }

            // Slaney Norm
            float enorm = 2.0f / (mel_freqs[i + 2] - mel_freqs[i]);
            mel_basis.row(i) *= enorm;
        }
    }
};
