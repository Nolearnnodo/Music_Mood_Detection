#pragma once

#include <vector>
#include <string>
#include <stdexcept>
#include <iostream>
#include <cstring>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswresample/swresample.h>
#include <libavutil/opt.h>
#include <libavutil/channel_layout.h>
#include <libavutil/log.h>
}

// 简单的元数据结构
struct TrackMetadata {
    std::string artist;
    std::string album;
    std::string title; // ID3 中的标题，可能比文件名更准确
    std::vector<uint8_t> cover_data; // 图片原始二进制
    std::string cover_mime; // 图片类型 (image/jpeg, image/png)
};

class AudioDecoder {
public:
    // 将任意音频解码为 PCM Float32, Mono, target_sr Hz
    static std::vector<float> load_audio(const std::string &filepath, int target_sr) {
        av_log_set_level(AV_LOG_ERROR); // 屏蔽 FFmpeg 内部啰嗦的日志

        // 初始化网络组件（对于新版 FFmpeg 某些协议可能需要）
        avformat_network_init();

        AVFormatContext *format_ctx = nullptr;
        // 打开文件
        if (avformat_open_input(&format_ctx, filepath.c_str(), nullptr, nullptr) != 0) {
            throw std::runtime_error("Failed to open audio file: " + filepath);
        }

        // 获取流信息
        if (avformat_find_stream_info(format_ctx, nullptr) < 0) {
            avformat_close_input(&format_ctx);
            throw std::runtime_error("Failed to find stream info: " + filepath);
        }

        // 寻找音频流
        int stream_index = -1;
        for (unsigned int i = 0; i < format_ctx->nb_streams; i++) {
            if (format_ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
                stream_index = i;
                break;
            }
        }

        if (stream_index == -1) {
            avformat_close_input(&format_ctx);
            throw std::runtime_error("No audio stream found: " + filepath);
        }

        // 准备解码器
        AVCodecParameters *codecpar = format_ctx->streams[stream_index]->codecpar;
        const AVCodec *codec = avcodec_find_decoder(codecpar->codec_id);
        AVCodecContext *codec_ctx = avcodec_alloc_context3(codec);
        avcodec_parameters_to_context(codec_ctx, codecpar);

        if (avcodec_open2(codec_ctx, codec, nullptr) < 0) {
            avcodec_free_context(&codec_ctx);
            avformat_close_input(&format_ctx);
            throw std::runtime_error("Failed to open codec: " + filepath);
        }

        // 准备重采样上下文 (SwrContext)
        // 目标：单声道，Target SR，Float32 格式
        SwrContext *swr_ctx = swr_alloc();

        if (codecpar->sample_rate <= 0 || codecpar->ch_layout.nb_channels <= 0) {
            avcodec_free_context(&codec_ctx);
            avformat_close_input(&format_ctx);
            swr_free(&swr_ctx);
            throw std::runtime_error("Invalid audio parameters in: " + filepath);
        }

        av_opt_set_chlayout(swr_ctx, "in_chlayout", &codecpar->ch_layout, 0);
        av_opt_set_int(swr_ctx, "in_sample_rate", codecpar->sample_rate, 0);
        av_opt_set_sample_fmt(swr_ctx, "in_sample_fmt", (AVSampleFormat) codecpar->format, 0);

        // 设置输出参数
        AVChannelLayout mono_layout = AV_CHANNEL_LAYOUT_MONO;
        av_opt_set_chlayout(swr_ctx, "out_chlayout", &mono_layout, 0);
        av_opt_set_int(swr_ctx, "out_sample_rate", target_sr, 0);
        av_opt_set_sample_fmt(swr_ctx, "out_sample_fmt", AV_SAMPLE_FMT_FLT, 0);

        if (swr_init(swr_ctx) < 0) {
            // 清理并抛出异常
            avcodec_free_context(&codec_ctx);
            avformat_close_input(&format_ctx);
            swr_free(&swr_ctx);
            throw std::runtime_error("Failed to init resampling context for: " + filepath);
        }

        std::vector<float> audio_buffer;
        AVPacket *packet = av_packet_alloc();
        AVFrame *frame = av_frame_alloc();
        AVFrame *frame_converted = av_frame_alloc();

        // 读取循环
        while (av_read_frame(format_ctx, packet) >= 0) {
            if (packet->stream_index == stream_index) {
                int ret = avcodec_send_packet(codec_ctx, packet);
                if (ret < 0 && ret != AVERROR(EAGAIN) && ret != AVERROR_EOF) {
                    std::cerr << "[Error] Corrupted packet found in: " << filepath << std::endl;
                    av_packet_unref(packet);
                    break;
                }

                while (ret >= 0) {
                    ret = avcodec_receive_frame(codec_ctx, frame);
                    if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
                        break;
                    }
                    if (ret < 0) {
                        std::cerr << "[Error] Decoding frame failed in: " << filepath << std::endl;
                        break;
                    }

                    if (frame->nb_samples <= 0) continue;

                    try {
                        int dst_nb_samples = av_rescale_rnd(
                            swr_get_delay(swr_ctx, codec_ctx->sample_rate) + frame->nb_samples,
                            target_sr, codec_ctx->sample_rate, AV_ROUND_UP);

                        if (dst_nb_samples > 0) {
                            if (frame_converted->nb_samples < dst_nb_samples) {
                                av_frame_unref(frame_converted);
                                frame_converted->format = AV_SAMPLE_FMT_FLT;
                                frame_converted->ch_layout = mono_layout;
                                frame_converted->nb_samples = dst_nb_samples;
                                av_frame_get_buffer(frame_converted, 0);
                            }

                            int converted_samples = swr_convert(swr_ctx,
                                                                frame_converted->data, dst_nb_samples,
                                                                (const uint8_t **) frame->data, frame->nb_samples);

                            if (converted_samples > 0) {
                                float *output_data = (float *) frame_converted->data[0];
                                audio_buffer.insert(audio_buffer.end(), output_data, output_data + converted_samples);
                            }
                        }
                    } catch (...) {
                        std::cerr << "[Error] Resample exception in: " << filepath << std::endl;
                    }
                }
            }
            av_packet_unref(packet);
        }

        // 清理资源
        av_frame_free(&frame);
        av_frame_free(&frame_converted);
        av_packet_free(&packet);
        avcodec_free_context(&codec_ctx);
        avformat_close_input(&format_ctx);
        swr_free(&swr_ctx);

        return audio_buffer;
    }

    static std::vector<uint8_t> transcode_to_wav(const std::string &filepath) {
        av_log_set_level(AV_LOG_ERROR);

        avformat_network_init();

        AVFormatContext *format_ctx = nullptr;
        if (avformat_open_input(&format_ctx, filepath.c_str(), nullptr, nullptr) != 0) {
            throw std::runtime_error("Transcode: Failed to open: " + filepath);
        }
        if (avformat_find_stream_info(format_ctx, nullptr) < 0) {
            avformat_close_input(&format_ctx);
            throw std::runtime_error("Transcode: Failed to find stream info: " + filepath);
        }

        int stream_index = -1;
        for (unsigned int i = 0; i < format_ctx->nb_streams; i++) {
            if (format_ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
                stream_index = i;
                break;
            }
        }
        if (stream_index == -1) {
            avformat_close_input(&format_ctx);
            throw std::runtime_error("Transcode: No audio stream found in: " + filepath);
        }

        AVCodecParameters *codecpar = format_ctx->streams[stream_index]->codecpar;
        const AVCodec *codec = avcodec_find_decoder(codecpar->codec_id);
        AVCodecContext *codec_ctx = avcodec_alloc_context3(codec);
        avcodec_parameters_to_context(codec_ctx, codecpar);

        if (avcodec_open2(codec_ctx, codec, nullptr) < 0) {
            avcodec_free_context(&codec_ctx);
            avformat_close_input(&format_ctx);
            throw std::runtime_error("Transcode: Failed to open codec for: " + filepath);
        }

        // 配置输出格式：保持原采样率，强制转为 Stereo (2ch)，S16LE (16bit)
        // 这是 WAV 最标准的格式，兼容性最好
        int out_channels = 2;
        int out_sample_rate = codecpar->sample_rate;
        AVSampleFormat out_fmt = AV_SAMPLE_FMT_S16;

        SwrContext *swr_ctx = swr_alloc();

        if (codecpar->sample_rate <= 0 || codecpar->ch_layout.nb_channels <= 0) {
            avcodec_free_context(&codec_ctx);
            avformat_close_input(&format_ctx);
            swr_free(&swr_ctx);
            throw std::runtime_error("Transcode: Invalid parameters in: " + filepath);
        }

        av_opt_set_chlayout(swr_ctx, "in_chlayout", &codecpar->ch_layout, 0);
        av_opt_set_int(swr_ctx, "in_sample_rate", codecpar->sample_rate, 0);
        av_opt_set_sample_fmt(swr_ctx, "in_sample_fmt", (AVSampleFormat) codecpar->format, 0);

        // 输出参数
        AVChannelLayout stereo_layout = AV_CHANNEL_LAYOUT_STEREO;
        av_opt_set_chlayout(swr_ctx, "out_chlayout", &stereo_layout, 0);
        av_opt_set_int(swr_ctx, "out_sample_rate", out_sample_rate, 0);
        av_opt_set_sample_fmt(swr_ctx, "out_sample_fmt", out_fmt, 0);

        if (swr_init(swr_ctx) < 0) {
            avcodec_free_context(&codec_ctx);
            avformat_close_input(&format_ctx);
            swr_free(&swr_ctx);
            throw std::runtime_error("Transcode: Failed to init swr for: " + filepath);
        }

        // 预留 WAV Header (44 bytes)
        std::vector<uint8_t> wav_buffer;
        wav_buffer.resize(44);

        AVPacket *packet = av_packet_alloc();
        AVFrame *frame = av_frame_alloc();
        uint8_t **out_data = nullptr;
        int out_linesize;

        // 解码循环
        while (av_read_frame(format_ctx, packet) >= 0) {
            if (packet->stream_index == stream_index) {
                int ret = avcodec_send_packet(codec_ctx, packet);
                if (ret < 0 && ret != AVERROR(EAGAIN) && ret != AVERROR_EOF) {
                    std::cerr << "[Error] Transcode corrupted packet in: " << filepath << std::endl;
                    av_packet_unref(packet);
                    break;
                }

                while (ret >= 0) {
                    ret = avcodec_receive_frame(codec_ctx, frame);
                    if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
                    if (ret < 0) {
                        std::cerr << "[Error] Transcode frame failed in: " << filepath << std::endl;
                        break;
                    }

                    if (frame->nb_samples <= 0) continue;

                    try {
                        // 计算转换后的样本数
                        int dst_nb_samples = av_rescale_rnd(
                            swr_get_delay(swr_ctx, codec_ctx->sample_rate) + frame->nb_samples,
                            out_sample_rate, codec_ctx->sample_rate, AV_ROUND_UP);

                        if (dst_nb_samples > 0) {
                            // 分配输出 buffer
                            av_samples_alloc_array_and_samples(&out_data, &out_linesize, out_channels,
                                                               dst_nb_samples, out_fmt, 0);

                            int conv_ret = swr_convert(swr_ctx, out_data, dst_nb_samples,
                                                       (const uint8_t **) frame->data, frame->nb_samples);

                            if (conv_ret > 0) {
                                // 计算实际字节数: samples * channels * bytes_per_sample(2 for S16)
                                int data_size = conv_ret * out_channels * 2;
                                size_t current_size = wav_buffer.size();
                                wav_buffer.resize(current_size + data_size);
                                std::memcpy(wav_buffer.data() + current_size, out_data[0], data_size);
                            }

                            if (out_data) {
                                av_freep(&out_data[0]);
                                av_freep(&out_data);
                            }
                        }
                    } catch (...) {
                        std::cerr << "[Error] Transcode resample exception in: " << filepath << std::endl;
                    }
                }
            }
            av_packet_unref(packet);
        }

        // 填充 WAV Header
        uint32_t total_data_len = (uint32_t) (wav_buffer.size() - 44);
        uint32_t riff_len = total_data_len + 36;
        int byte_rate = out_sample_rate * out_channels * 16 / 8;
        int block_align = out_channels * 16 / 8;

        uint8_t *header = wav_buffer.data();

        // RIFF chunk
        memcpy(header, "RIFF", 4);
        memcpy(header + 4, &riff_len, 4); // File size - 8
        memcpy(header + 8, "WAVE", 4);

        // fmt chunk
        memcpy(header + 12, "fmt ", 4);
        uint32_t fmt_chunk_size = 16;
        memcpy(header + 16, &fmt_chunk_size, 4);
        uint16_t audio_format = 1; // PCM
        memcpy(header + 20, &audio_format, 2);
        uint16_t num_channels = (uint16_t) out_channels;
        memcpy(header + 22, &num_channels, 2);
        memcpy(header + 24, &out_sample_rate, 4);
        memcpy(header + 28, &byte_rate, 4);
        memcpy(header + 32, &block_align, 2);
        uint16_t bits_per_sample = 16;
        memcpy(header + 34, &bits_per_sample, 2);

        // data chunk
        memcpy(header + 36, "data", 4);
        memcpy(header + 40, &total_data_len, 4);

        // 清理
        av_frame_free(&frame);
        av_packet_free(&packet);
        avcodec_free_context(&codec_ctx);
        avformat_close_input(&format_ctx);
        swr_free(&swr_ctx);

        return wav_buffer;
    }

    static TrackMetadata extract_metadata(const std::string &filepath) {
        // 1. 降低日志级别，防止刷屏
        av_log_set_level(AV_LOG_ERROR);
        TrackMetadata meta;

        AVFormatContext *format_ctx = nullptr;
        AVPacket *pkt = nullptr;

        try {
            avformat_network_init();

            // 打开文件
            if (avformat_open_input(&format_ctx, filepath.c_str(), nullptr, nullptr) != 0) {
                // 打开失败静默返回
                return meta;
            }

            // 读取流信息 (必要，否则可能找不到 metadata)
            if (avformat_find_stream_info(format_ctx, nullptr) < 0) {
                avformat_close_input(&format_ctx);
                return meta;
            }

            // --- 防御性读取元数据 ---
            if (format_ctx->metadata) {
                AVDictionaryEntry *tag = nullptr;
                if ((tag = av_dict_get(format_ctx->metadata, "artist", nullptr, AV_DICT_IGNORE_SUFFIX)))
                    meta.artist = tag->value;
                if ((tag = av_dict_get(format_ctx->metadata, "album", nullptr, AV_DICT_IGNORE_SUFFIX)))
                    meta.album = tag->value;
                if ((tag = av_dict_get(format_ctx->metadata, "title", nullptr, AV_DICT_IGNORE_SUFFIX)))
                    meta.title = tag->value;
            }

            // --- 查找封面流 (Attached Picture) ---
            int video_stream_idx = -1;
            for (unsigned int i = 0; i < format_ctx->nb_streams; i++) {
                if (format_ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_VIDEO &&
                    (format_ctx->streams[i]->disposition & AV_DISPOSITION_ATTACHED_PIC)) {
                    video_stream_idx = i;
                    break;
                }
            }

            if (video_stream_idx != -1) {
                pkt = av_packet_alloc();
                if (!pkt) throw std::runtime_error("OOM");

                int max_packets_to_scan = 100;
                int packets_read = 0;

                while (packets_read < max_packets_to_scan && av_read_frame(format_ctx, pkt) >= 0) {
                    if (pkt->stream_index == video_stream_idx) {
                        // 找到了图片数据
                        // 检查数据有效性
                        if (pkt->data && pkt->size > 0 && pkt->size < 10 * 1024 * 1024) { // 限制封面最大 10MB
                            meta.cover_data.assign(pkt->data, pkt->data + pkt->size);

                            if (format_ctx->streams[video_stream_idx]->codecpar->codec_id == AV_CODEC_ID_PNG) {
                                meta.cover_mime = "image/png";
                            } else {
                                meta.cover_mime = "image/jpeg";
                            }
                        }
                        av_packet_unref(pkt);
                        break; // 找到即停
                    }
                    av_packet_unref(pkt);
                    packets_read++;
                }
            }

        } catch (const std::exception& e) {
            std::cerr << "[Warning] Metadata extraction failed for " << filepath << ": " << e.what() << std::endl;
        } catch (...) {
            std::cerr << "[Warning] Unknown error during metadata extraction for " << filepath << std::endl;
        }

        if (pkt) av_packet_free(&pkt);
        if (format_ctx) avformat_close_input(&format_ctx);

        return meta;
    }
};
