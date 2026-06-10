# 🎵 Music Mood

[![Nightly Build](https://github.com/Sg4Dylan/MusicMood/actions/workflows/release.yml/badge.svg)](https://github.com/Sg4Dylan/MusicMood/releases)
![License](https://img.shields.io/badge/license-AGPLv3-blue)
![C++](https://img.shields.io/badge/C++-17-00599C?logo=c%2B%2B)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)

**Music Mood** 是一个基于深度学习的本地音乐情绪分析与播放工具。

它能够扫描你的本地音乐库，利用 AI 模型分析每一首歌曲的 **Valence (愉悦度)** 和 **Arousal (能量值)**，并将它们映射到一个二维情绪象限图中。你可以通过点击图表上的点来探索音乐，或者圈选特定情绪区域生成智能播放列表。

## ✨ 主要特性 (Features)

*   **🧠 本地 AI 推理**: 使用 `ncnn` 框架在本地 CPU/GPU 上运行深度学习模型，无需上传文件，保护隐私。
*   **📊 情绪象限可视化**:
    *   基于 Russell 情绪环状模型 (Circumplex Model) 展示音乐情绪分布。
    *   **实时轨迹追踪**: 播放时在图表上实时显示歌曲当前的情绪落点。
    *   **歌单高亮**: 生成相似歌单后，在图谱上高亮显示涉及的歌曲。
*   **📂 智能扫描**: 支持递归扫描文件夹，**完美支持中文/日文等 Unicode 路径**。
*   **🎧 现代 Web 播放器**:
    *   支持无缝流式播放 (Range Requests)。
    *   **系统级集成**: 支持 Media Session API，可在系统控制中心显示封面、歌手信息。
    *   内置播放列表、进度条拖拽、音量控制。
    *   自动根据情绪距离推荐相似歌曲。
*   **🌓 深色模式**: 基于 TailwindCSS 的自适应深色/浅色主题。
*   **💾 数据持久化**: 使用 SQLite 存储分析结果，一次分析，永久使用。
*   **📑 播放列表导出**: 支持将生成的歌单导出为 `.m3u`、`.pls` 或 `.txt` 文件。

## 🚀 快速开始 (Quick Start)

### 下载运行
请前往 [Releases](https://github.com/Sg4Dylan/MusicMood/releases) 页面下载最新的 **Nightly Build**。

1.  解压 `MusicMood-Windows-x64-yyyymmdd.zip`。
2.  确保 `models` 文件夹位于 `MusicMoodCLI.exe` 同级目录下。
3.  双击运行 `MusicMoodCLI.exe`。
4.  浏览器会自动打开（或手动访问 `http://localhost:8080`）。

### 使用指南
1.  在左侧控制面板点击输入框，选择你的音乐文件夹并添加。
2.  等待后台扫描与 AI 分析完成（Web 界面会通过 SSE 实时显示进度）。
3.  点击右侧图表中的任意散点，开始播放。
4.  调整左侧的 **Similarity Radius** 滑块，生成特定情绪范围的歌单。

## 🛠️ 从源码构建 (Build from Source)

本项目采用前后端分离架构，构建需要分别处理。

### 环境要求
*   **C++**: CMake 3.21+, 支持 C++17 的编译器 (MSVC 2019/2022, GCC, Clang)。
*   **Frontend**: Node.js 或 [Bun](https://bun.sh) (推荐)。
*   **Package Manager**: [vcpkg](https://github.com/microsoft/vcpkg) (用于 C++ 依赖)。

### 1. 克隆仓库
```bash
git clone --recursive https://github.com/Sg4Dylan/MusicMood.git
cd MusicMood
```

### 2. 编译前端 (Web)
```bash
cd frontend/web
bun install
bun run build
# 构建产物将生成在 frontend/web/dist 目录
cd ../..
```

### 3. 编译后端 (C++)
本项目使用 `vcpkg` 的 Manifest 模式管理依赖，无需手动安装库。

```bash
# 配置 CMake (假设 vcpkg 安装在 C:/vcpkg)
cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE="C:/vcpkg/scripts/buildsystems/vcpkg.cmake" -DVCPKG_TARGET_TRIPLET=x64-windows-static

# 编译 (Release 模式)
cmake --build build --config Release
```

### 4. 运行准备
编译完成后，需要将以下资源放入可执行文件同级目录：
1.  `web/` 文件夹：来自 `frontend/web/dist`。
2.  `models/` 文件夹：包含 ncnn 模型文件 (`.param` 和 `.bin`)。

### 开发模式：不编译前端启动后端
前端开发时可以直接运行 Vite，不需要先执行 `bun run build` 生成 `frontend/web/dist`。
后端只提供 API，前端通过 `frontend/web/vite.config.js` 中的 `/api -> http://localhost:8080` 代理访问后端。

```bash
# 终端 1：从仓库根目录启动后端 API
./build/Release/MusicMoodCLI.exe --api-only --model-dir ./models

# 终端 2：启动前端开发服务器
cd frontend/web
bun install
bun run dev
```

如果需要使用其它端口：
```bash
./build/Release/MusicMoodCLI.exe --api-only --port 8090 --model-dir ./models
```
同时把 `frontend/web/vite.config.js` 中的代理目标改成对应端口。

## 🧩 技术栈 (Tech Stack)

### Backend (C++)
*   **Web Server**: `cpp-httplib` (REST API, SSE, Static file serving).
*   **AI Inference**: `ncnn` (High-performance neural network inference framework).
*   **Audio Processing**: `ffmpeg` (Decoding), `fftw3` (Spectrogram generation).
*   **Database**: `sqlite3` (Metadata & vector storage).
*   **Utils**: `nlohmann/json`, `Eigen3`.

### Frontend (React)
*   **Framework**: React 18 + Vite.
*   **UI/Styling**: TailwindCSS, Lucide React (Icons).
*   **Visualization**: Chart.js + chartjs-plugin-annotation + chartjs-plugin-zoom.
*   **Audio**: react-h5-audio-player.

## 🤖 模型说明 (Models)
本项目使用了预训练的音乐情绪分析模型：
*   **MusicNN**: 用于提取音频的高维特征。
*   **DEAM Regressor**: 将特征映射到 Valence/Arousal 值。

## ⚖️ 开源协议 (License)

### Project License
This project is licensed under the **AGPLv3 License** - see the [LICENSE](LICENSE) file for details.  
本项目遵循 **AGPLv3** 开源授权协议 - 详情请参阅 [LICENSE](LICENSE) 文件。

### AI Disclosure & Disclaimer
Parts of this project are generated or optimized by AI coding tools. While the maintainers strive for quality, the AI-generated code is provided **"AS IS" without warranty of any kind**, express or implied. The authors do not guarantee the absolute accuracy, security, or reliability of the AI-contributed logic. Users are encouraged to review the source code independently. In no event shall the authors be liable for any claim, damages, or other liability arising from the use of AI-generated content.  
本项目部分代码由 AI 工具生成或优化。尽管维护者努力确保代码质量，但 AI 生成的代码均以 **“原样（AS IS）”** 提供，不附带任何形式的明示或暗示保证。作者不保证 AI 贡献逻辑的绝对准确性、安全性或可靠性。建议用户在使用前自行审查源代码。在任何情况下，作者均不对因使用 AI 生成内容而产生的任何索赔、损害或其他责任负责。

### Third-party Software Notices
本项目集成或使用了以下开源组件，在此向原作者表示感谢：

#### Backend (C++)
| Component | License | Usage |
| :--- | :--- | :--- |
| [cpp-httplib](https://github.com/yhirose/cpp-httplib) | MIT | Web Server |
| [ncnn](https://github.com/Tencent/ncnn) | BSD 3-Clause | AI Inference |
| [FFmpeg](https://ffmpeg.org/) | LGPL v2.1+ | Audio Decoding |
| [FFTW3](https://www.fftw.org/) | GPL v2+ | Spectrogram generation |
| [SQLite3](https://www.sqlite.org/) | Public Domain | Database |
| [nlohmann/json](https://github.com/nlohmann/json) | MIT | JSON Parsing |
| [Eigen3](https://eigen.tuxfamily.org/) | MPL2 | Linear Algebra |

#### Frontend (React)
| Component | License | Usage |
| :--- | :--- | :--- |
| [React](https://reactjs.org/) | MIT | Framework |
| [Vite](https://vitejs.dev/) | MIT | Build Tool |
| [TailwindCSS](https://tailwindcss.com/) | MIT | Styling |
| [Lucide React](https://lucide.dev/) | ISC | Icons |
| [Chart.js](https://www.chartjs.org/) | MIT | Visualization |
| [react-h5-audio-player](https://github.com/lhz516/react-h5-audio-player) | MIT | Audio Player |

#### Models & Data
*   **MusicNN**: Licensed under [Apache 2.0](https://github.com/jordipons/musicnn).
*   **DEAM Dataset**: Used for research and development purposes.

---

Designed for Local Music Libraries. 🎵  
Copyright (c) 2026-Present Sg4Dylan and project contributors. All rights reserved.  
Licensed under the AGPLv3 License.
