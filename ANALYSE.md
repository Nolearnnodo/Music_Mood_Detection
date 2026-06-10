# Music Mood Detection 项目分析

## 1. 项目主要做什么

本项目是一个本地音乐情绪分析与播放工具。它会扫描用户指定的本地音乐目录，使用 C++ 后端调用 FFmpeg 解码音频、提取 Mel 频谱特征，再用 ncnn 加载本地深度学习模型预测每首歌的 Valence（愉悦度）和 Arousal（能量值）。分析结果会保存到 SQLite 数据库中，前端 React 页面再把歌曲显示到二维情绪象限图上，并提供播放、相似歌单生成、播放列表导出等功能。

整体架构是前后端分离：

- 后端：C++17 单可执行程序 `MusicMoodCLI`，负责模型推理、数据库、目录扫描、音频流、REST API、SSE 进度推送和静态文件服务。
- 前端：React + Vite + TailwindCSS，负责文件夹选择、扫描状态展示、情绪散点图、播放器、相似歌单和设置界面。
- 模型：项目内置 MusicNN 特征模型和 DEAM 情绪回归模型，既保留 ncnn 格式用于实际推理，也保留 ONNX 格式作为原始/中间模型文件。

## 2. 核心运行流程

1. 用户运行 `MusicMoodCLI.exe`，后端读取命令行参数，初始化 SQLite 数据库和 ncnn 模型。
2. Web 服务器启动，默认监听 `127.0.0.1:8080`，可以直接服务已构建前端，也可以用 `--api-only` 配合 Vite 开发服务器。
3. 用户在前端选择音乐文件夹。
4. 后端递归扫描该目录，识别常见音频格式文件，并把待分析任务放入线程安全队列。
5. 后台 worker 解码音频，生成 Mel 频谱，按滑动窗口送入两个 ncnn 模型，得到随时间变化的 Valence/Arousal 轨迹。
6. 后端用几何中位数汇总整首歌的全局情绪坐标，并把结果和轨迹 BLOB 写入 SQLite。
7. 前端通过 `/api/tracks` 获取已完成歌曲，通过 Chart.js 展示到 0-10 的二维情绪图中。
8. 用户点击散点后，前端拉取歌曲详情和轨迹，通过 `/api/stream` 播放音频，并根据当前播放时间在情绪图上移动播放位置。
9. 用户可以按情绪半径生成相似歌单，并导出为 `m3u`、`pls` 或 `txt`。

## 3. 根目录文件和目录

### `README.md`

项目说明文档。介绍项目特性、快速开始、源码构建方式、技术栈、模型说明、许可证和第三方组件。它描述的功能与代码基本对应：本地 AI 推理、情绪象限图、目录扫描、Web 播放器、SQLite 持久化和播放列表导出。

### `LICENSE`

AGPLv3 开源许可证全文。项目 README 中也明确说明项目采用 AGPLv3 授权。

### `CMakeLists.txt`

C++ 后端构建配置。它定义项目名 `MusicMoodCLI`，要求 C++17，在 Windows 下默认使用 `x64-windows-static` vcpkg triplet，并查找和链接这些依赖：

- `Eigen3`：矩阵运算。
- `FFTW3f`：快速傅里叶变换，用于频谱计算。
- `FFMPEG`：音频解码、元数据读取和转码。
- `ncnn`：神经网络推理。
- `httplib`：HTTP 服务器。
- `nlohmann_json`：JSON 读写。
- `sqlite3`：数据库。

当前只把 `src/main.cpp` 和 `src/core/EmotionPredictor.cpp` 作为编译单元，其它后端逻辑大多写在头文件中。

### `vcpkg.json`

C++ 依赖清单，使用 vcpkg manifest 模式。声明项目名 `music-mood-cli`，并指定依赖 `eigen3`、`fftw3`、`openssl`、`cpp-httplib`、`nlohmann-json`、`sqlite3`、启用 `vulkan` feature 的 `ncnn`，以及启用 `avcodec`、`avfilter`、`avformat`、`swresample` feature 的 `ffmpeg`。

### `models/`

模型资源目录。后端默认从 `./models` 加载 ncnn 模型文件；命令行参数 `--model-dir` 可以指定其它目录。

- `models/msd_musicnn_1.ncnn.param`：MusicNN 第一阶段模型的 ncnn 网络结构文件。
- `models/msd_musicnn_1.ncnn.bin`：MusicNN 第一阶段模型的 ncnn 权重文件。
- `models/deam_msd_musicnn_2.ncnn.param`：DEAM 情绪回归第二阶段模型的 ncnn 网络结构文件。
- `models/deam_msd_musicnn_2.ncnn.bin`：DEAM 情绪回归第二阶段模型的 ncnn 权重文件。
- `models/msd-musicnn-1.onnx`：MusicNN 第一阶段模型的 ONNX 版本，当前代码不直接加载。
- `models/deam-msd-musicnn-2.onnx`：DEAM 情绪回归模型的 ONNX 版本，当前代码不直接加载。

### `src/`

C++ 后端源码目录。承担项目的主要业务逻辑，包括命令行入口、音频处理、模型推理、数据库、扫描器、HTTP API 和编码工具。

### `frontend/`

前端项目目录。当前实际应用在 `frontend/web/` 下，是一个 React + Vite 单页应用。

### `build/`

CMake/MSVC/vcpkg 生成目录，包含 Visual Studio 工程文件、编译中间文件、可执行文件、vcpkg 安装依赖和 CMake 缓存。它不是手写业务代码，但反映该项目已在本机配置/构建过。该目录目前在 Git 状态中显示为未跟踪。

### `.git/`

Git 仓库元数据目录，用于版本控制，不属于项目业务逻辑。

## 4. 后端源码文件

### `src/main.cpp`

后端程序入口。主要职责：

- 解析命令行参数：`--host`、`--port`、`--vk-index`、`--no-vulkan`、`--read-only`、`--api-only`、`--web-root`、`--model-dir`、`--help`。
- 设置默认配置：模型目录 `./models`、静态前端目录 `./web`、数据库 `music_mood.db`、监听地址 `127.0.0.1:8080`。
- 初始化 `DatabaseManager`。
- 初始化 `EmotionPredictor` 并加载模型。
- 初始化 `LibraryScanner`。
- 创建 `WebServer` 并阻塞运行。

### `src/core/EmotionTypes.h`

定义情绪分析数据结构：

- `EmotionPoint`：单个时间点的情绪数据，包含 `time_sec`、`valence`、`arousal`。
- `AnalysisResult`：单首歌的完整分析结果，包含文件路径、全局 Valence/Arousal、时长和轨迹数组。

### `src/core/AudioDecoder.h`

音频解码和元数据读取工具，基于 FFmpeg。主要提供三个静态方法：

- `load_audio(filepath, target_sr)`：把任意支持格式解码为单声道 Float32 PCM，并重采样到目标采样率。情绪模型分析时使用它，当前目标采样率为 16000 Hz。
- `transcode_to_wav(filepath)`：把浏览器不一定能原生播放的音频转码成内存中的 WAV，用于 `/api/stream` 兜底播放。
- `extract_metadata(filepath)`：读取音频文件元数据，包括 artist、album、title 和内嵌封面图，并返回 `TrackMetadata`。

### `src/core/FeatureExtractor.h`

音频特征提取器，负责把 PCM 波形转换成模型输入需要的 Mel 频谱。主要逻辑：

- 使用 Hann 窗。
- 使用 FFTW 计算 STFT 功率谱。
- 构造 Slaney 风格 Mel 滤波器组。
- 生成 `[FrameCount, n_mels]` 形状的对数 Mel 频谱。

默认参数与模型保持一致：`sr=16000`、`n_fft=512`、`hop_length=256`、`n_mels=96`。

### `src/core/EmotionPredictor.h`

情绪预测器声明。它持有两个 ncnn 网络和一个 `FeatureExtractor`：

- `net1`：MusicNN 模型，用于从 Mel 频谱提取 embedding。
- `net2`：DEAM 回归模型，用于把 embedding 映射到 Valence/Arousal。
- `analyze(filepath)`：分析单首歌曲并返回 `AnalysisResult`。
- `calculate_geometric_median(points)`：根据轨迹点计算全局情绪坐标。

### `src/core/EmotionPredictor.cpp`

情绪推理核心实现。主要步骤：

- 初始化 ncnn 网络。
- 根据参数决定是否启用 Vulkan，并可指定 Vulkan 设备 index。
- 从模型目录加载四个 ncnn 文件：两个 `.param` 和两个 `.bin`。
- 调用 `AudioDecoder::load_audio` 解码音频。
- 调用 `FeatureExtractor::compute_melspectrogram` 生成 Mel 频谱。
- 使用 187 帧窗口和约 1 秒重叠进行滑动窗口推理。
- 第一阶段输出 `out1` embedding，第二阶段输出 `out0` 的两个值，即 Valence 和 Arousal。
- 将窗口中心时间作为轨迹时间戳。
- 使用 Weiszfeld 算法计算轨迹点的几何中位数，作为整首歌全局情绪坐标。

### `src/db/DatabaseManager.h`

SQLite 数据库管理器。负责建表、目录管理、歌曲记录、分析结果保存、查询和播放列表生成。主要内容：

- 建表：
  - `tracks`：保存歌曲路径、文件名、状态、Valence、Arousal、时长和轨迹 BLOB。
  - `directories`：保存用户添加的音乐目录。
  - `idx_va`：Valence/Arousal 索引。
- 目录 API：`add_directory`、`remove_directory`、`get_directories`。
- 歌曲 API：`add_or_get_track`、`save_analysis`、`get_track_detail`、`mark_error`。
- 清理能力：`prune_missing_tracks` 删除活跃目录下已经不存在的文件记录。
- 查询能力：
  - `get_all_finished_filtered`：取可展示的已完成歌曲。
  - `get_nearest_neighbors`：按情绪坐标欧氏距离找近邻。
  - `get_playlist`：在指定情绪半径内生成歌单。
  - `get_progress_stats`：统计扫描进度。
  - `get_incomplete_tracks`：恢复未完成或中断任务。

### `src/scanner/LibraryScanner.h`

音乐库扫描和后台分析任务调度器。主要组件：

- `SafeQueue<T>`：线程安全队列，用于 worker 线程取任务。
- `ScanTask`：单个待分析任务，包含数据库 id 和文件路径。
- `start_workers`：启动后台分析线程。
- `stop`：停止队列并 join worker。
- `resume_scans`：把数据库中未完成的任务重新放入队列。
- `add_folder_async`：异步添加目录、递归扫描音频文件、写入数据库并创建分析任务。
- `worker_loop`：持续从队列取任务，调用 `EmotionPredictor::analyze`，成功则保存分析结果，失败则标记错误。
- SSE 回调：通过 `event_callback` 向 Web 层推送 `progress` 和 `status` 事件。

支持的音频扩展名包括 `.mp3`、`.wav`、`.flac`、`.m4a`、`.ogg`、`.aac`、`.ape`、`.wma`、`.wv`、`.aiff`。

### `src/server/WebServer.h`

HTTP 服务器和 API 路由实现，基于 `cpp-httplib`。主要职责：

- 启动时读取数据库中的目录，检查哪些目录仍然存在，只展示活跃目录中的歌曲。
- 启动扫描 worker，并恢复中断的扫描任务。
- 可挂载静态前端目录，也可在 `--api-only` 模式下只提供 API。
- 管理 SSE 客户端集合，向前端推送扫描进度。

主要 API：

- `GET /api/events`：SSE 进度流。
- `POST /api/config/folders`：添加目录并开始扫描。
- `GET /api/config/folders`：列出已添加目录。
- `DELETE /api/config/folders?id=...`：删除目录配置。
- `GET /api/status`：返回扫描进度和只读状态。
- `GET /api/tracks`：返回已分析完成的歌曲散点数据。
- `GET /api/track/detail?id=...`：返回单曲详情、轨迹、元数据和封面。
- `GET /api/stream?id=...`：音频流接口。对浏览器原生支持格式直接 range streaming，对不常见格式转码为 WAV。
- `GET /api/playlist/generate`：按种子歌曲、情绪坐标或时间预设生成歌单，可返回 JSON 或导出 `m3u`、`pls`、`txt`。
- `GET /api/fs/browse?path=...`：文件夹浏览接口，用于前端选择音乐目录。

### `src/utils/Encoding.h`

跨平台编码和路径工具。主要解决 Windows 中文/日文等 Unicode 路径问题：

- Windows 下提供 UTF-8 `std::string` 与 UTF-16 `std::wstring` 转换。
- `to_fs_path`：把 UTF-8 字符串转换成 `std::filesystem::path`。
- `to_utf8_string`：把 `std::filesystem::path` 转回 UTF-8。
- `base64_encode`：把封面图二进制编码成 Data URL 所需的 Base64 字符串。

## 5. 前端工程文件

### `frontend/web/package.json`

前端依赖与脚本配置。脚本包括：

- `dev`：启动 Vite 开发服务器。
- `build`：构建生产前端。
- `lint`：运行 ESLint。
- `preview`：预览构建产物。

核心依赖包括 React 19、axios、Chart.js、chartjs 插件、lucide-react、react-h5-audio-player、Tailwind 相关工具等。

### `frontend/web/bun.lock`

Bun 包管理器生成的依赖锁文件，固定前端依赖版本，确保不同机器安装结果一致。

### `frontend/web/vite.config.js`

Vite 配置。使用 React 插件，并在开发模式把 `/api` 代理到 `http://localhost:8080`，方便前端 dev server 访问 C++ 后端。

### `frontend/web/tailwind.config.js`

TailwindCSS 配置。指定扫描 `index.html` 和 `src/**/*`，使用 `class` 模式暗色主题，并扩展了语义颜色：

- `mood-bg`
- `mood-card`
- `mood-text`
- `mood-border`

这些颜色来自 CSS 变量，方便亮色/暗色模式切换。

### `frontend/web/postcss.config.js`

PostCSS 配置，加载 TailwindCSS 和 Autoprefixer。

### `frontend/web/eslint.config.js`

ESLint 配置。基于 `eslint-config-kaho`，并启用 React Hooks 推荐规则，同时调整了一些项目内规则。

### `frontend/web/.npmrc`

npm registry 配置，指向 `https://registry.npmmirror.com`，便于国内网络环境安装依赖。

### `frontend/web/.gitignore`

前端子项目的忽略规则，忽略日志、`node_modules`、`dist`、编辑器文件等。

### `frontend/web/README.md`

Vite React 模板自带说明，介绍 React + Vite 的基础开发信息。它不是当前业务功能文档。

### `frontend/web/index.html`

前端 HTML 入口。提供 `#root` 容器，并加载 `/src/main.jsx`。

### `frontend/web/index.css`

全局 CSS 变量文件，定义亮色和暗色模式下的背景、卡片、文字、边框颜色，并设置 body 基础颜色与过渡。注意项目同时还有 `src/index.css`，当前 `main.jsx` 实际导入的是 `src/index.css`，这个根级 `index.css` 目前看起来没有被入口直接引用。

### `frontend/web/public/vite.svg`

Vite 默认图标资源，当前 `index.html` 用它作为 favicon。

### `frontend/web/node_modules/`

前端依赖安装目录，由包管理器生成。里面包含 React、Vite、Chart.js、Tailwind、lucide 等大量第三方包，不是项目手写源码。

## 6. 前端源码文件

### `frontend/web/src/main.jsx`

React 应用入口。创建 React root，并在 `React.StrictMode` 下渲染 `App`。

### `frontend/web/src/App.jsx`

前端主组件，负责全局状态和页面布局。主要功能：

- 保存歌曲列表、扫描状态、当前歌曲、播放轨迹、当前播放时间、歌单项。
- 管理主题：`light`、`dark`、`system`，并把结果写入 `localStorage`。
- 管理歌单生成设置：数量限制、时长限制、默认相似半径。
- 初始化时调用 `/api/tracks` 和 `/api/status`。
- 使用 EventSource 连接 `/api/events`，实时更新扫描进度。
- 点击情绪图点后调用 `/api/track/detail` 拉取歌曲详情。
- 把状态分发给 `ControlPanel`、`Player`、`MoodChart` 和 `SettingsModal`。

### `frontend/web/src/App.css`

Vite 模板遗留样式，包含默认 logo、card、read-the-docs 等样式。当前 `App.jsx` 没有导入它，实际业务界面主要依赖 Tailwind 类名和其它 CSS 文件。

### `frontend/web/src/index.css`

当前前端实际导入的全局样式。加载 Tailwind 的 base/components/utilities，并设置 `:root` 与 `.dark` 的基础背景、文字颜色和 `color-scheme`。

### `frontend/web/src/player-theme.css`

覆盖 `react-h5-audio-player` 默认样式，使播放器适配项目的亮色/暗色主题。调整了时间显示、进度条、播放按钮、音量条、布局间距和 hover 效果。

### `frontend/web/src/assets/react.svg`

React 模板默认图标资源。当前业务代码没有直接使用它。

### `frontend/web/src/components/ControlPanel.jsx`

左侧控制面板组件。主要功能：

- 添加音乐目录，打开 `FolderBrowser` 选择路径。
- 展示已经添加的目录，并支持删除目录配置。
- 展示扫描进度、成功数、失败数、剩余数。
- 支持重新扫描/重试。
- 提供快速情绪/时间预设导出，包括晨间、午后、傍晚、深夜、快乐、悲伤、愤怒、平静。
- 打开设置弹窗。
- 在只读模式下隐藏目录修改功能。

### `frontend/web/src/components/FolderBrowser.jsx`

自定义文件夹选择弹窗。通过后端 `/api/fs/browse` 浏览本机目录，支持：

- 列出盘符或根目录。
- 进入子目录。
- 返回上一级。
- 手动输入路径跳转。
- 确认选择当前路径。

### `frontend/web/src/components/MoodChart.jsx`

情绪象限图组件，基于 `react-chartjs-2` 和 Chart.js。主要功能：

- 用散点图展示所有歌曲的 Valence/Arousal。
- 用四个背景象限表示快乐、愤怒、悲伤、平静等区域。
- 点击散点触发选择歌曲。
- 显示当前选中歌曲。
- 显示单曲情绪轨迹线。
- 根据播放时间插值计算当前播放点，并以十字标记显示。
- 显示相似歌单高亮点。
- 显示相似半径圆。
- 支持缩放和平移。

### `frontend/web/src/components/Player.jsx`

播放器和相似歌单组件。主要功能：

- 使用 `react-h5-audio-player` 播放 `/api/stream?id=...`。
- 显示歌曲封面、标题、歌手、Valence/Arousal 数值。
- 自动生成并预览相似歌单。
- 根据半径 slider 防抖刷新歌单。
- 支持上一首、下一首、播放结束自动切换。
- 懒加载歌单中歌曲详情。
- 更新 Media Session API，让系统媒体控制中心显示歌曲信息和封面。
- 导出相似歌单为 M3U、PLS 或 TXT。
- 把播放时间回传给 `App`，用于情绪图的实时播放点。

### `frontend/web/src/components/SettingsModal.jsx`

歌单生成设置弹窗。可配置：

- 最大歌曲数量 `limit`。
- 最大播放时长 `durationLimit`，单位分钟，0 表示不限制。
- 默认相似半径 `defaultRadius`。

保存后由 `App` 写入 `localStorage`。

## 7. 数据库和运行时文件

代码运行时会在当前工作目录生成或使用：

- `music_mood.db`：SQLite 数据库文件。当前目录清单中尚未看到该文件，但 `main.cpp` 默认会使用这个路径。
- `web/`：发布运行时的前端静态目录。README 要求把 `frontend/web/dist` 构建产物复制为可执行文件同级的 `web/`。

## 8. 关键设计点

- 本地隐私：音频在本机解码和推理，不需要上传。
- 模型两阶段：先用 MusicNN 提取高维音乐特征，再用 DEAM 回归模型输出情绪坐标。
- 轨迹而非单点：每首歌按滑动窗口推理，既保存全局坐标，也保存随时间变化的情绪轨迹。
- 持久化缓存：分析完成后写入 SQLite，下次不必重复推理。
- SSE 进度：扫描和分析进度通过 `/api/events` 实时推给前端。
- Unicode 路径支持：后端专门处理 Windows UTF-8/UTF-16 路径转换。
- 播放兼容：浏览器原生支持的音频直接 range streaming，不常见格式转 WAV 后播放。
- 相似歌单：以情绪二维坐标的欧氏距离为核心，支持半径筛选、数量限制和总时长限制。

## 9. 当前仓库状态观察

当前工作区中 `build/` 是未跟踪目录，属于本地生成产物。前端 `node_modules/` 也已经存在，属于依赖安装结果。源码和配置文件集中在根目录、`src/`、`models/` 和 `frontend/web/`。
