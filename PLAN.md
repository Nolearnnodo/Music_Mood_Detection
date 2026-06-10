# 情绪音乐电台项目搭建方案

## 1. 项目定位

本课程项目拟搭建一个“情绪音乐电台”Web 应用。用户进入 Web 页面后，可以选择自己的本地音乐库文件夹，系统自动分析每首歌的音乐情绪特征；随后用户开启摄像头，系统识别当前面部情绪，并根据识别结果从用户自己的音乐库中推荐符合当前心情的歌曲。

该项目的核心交互闭环是：

1. 用户导入本地音乐库。
2. 系统离线分析歌曲情绪坐标。
3. 用户开启摄像头。
4. 系统识别用户当前面部表情。
5. 系统将面部情绪映射到音乐情绪空间。
6. 系统自动生成并播放推荐歌单。

## 2. 当前已有基础

### 2.1 音乐情绪分析项目

当前根目录项目已经具备较完整的音乐情绪分析能力。

后端能力：

- C++17 后端程序 `MusicMoodCLI`。
- 使用 FFmpeg 解码本地音频。
- 使用 FFTW/Eigen 提取 Mel 频谱。
- 使用 ncnn 加载 MusicNN 与 DEAM 模型。
- 输出每首歌的 Valence 与 Arousal。
- 使用 SQLite 保存歌曲路径、分析状态、全局情绪坐标和情绪轨迹。
- 提供 REST API、SSE 扫描进度和音频流接口。
- 支持本地文件夹浏览和音乐库扫描。

前端能力：

- React + Vite。
- 支持添加音乐目录。
- 支持扫描进度展示。
- 支持情绪散点图展示。
- 支持点击歌曲播放。
- 支持基于情绪半径生成相似歌单。
- 支持 M3U、PLS、TXT 歌单导出。

### 2.2 FacialEmotionDetector 项目

`FacialEmotionDetector` 是一个浏览器端人脸情绪识别项目。

已有能力：

- React 前端页面。
- 使用浏览器摄像头。
- 使用 face-api.js 在浏览器端进行表情识别。
- 支持识别 `neutral`、`happy`、`sad`、`angry`、`fearful`、`disgusted`、`surprised` 等表情。
- 已修复新版 Node.js 下 OpenSSL 兼容问题。
- 已修复摄像头脚本初始化问题。

### 2.3 My_music 音乐库

`My_music` 目录是当前用于测试的本地音乐仓库，可作为第一阶段演示和验收数据源。

当前样例音乐包括：

- `中央民族乐团 - 梁祝_L.ogg`
- `Neru _ 镜音铃 - ロストワンの号哭 (Lost One的号哭)_L.ogg`
- `MyGO!!!!! - 猛独が襲う (Deathly Loneliness Attacks) (COVER版)_L.ogg`
- `Dubravka Tomšič - III_ Rondo (Allegro)_L.ogg`
- `Afterglow - ツナグ、ソラモヨウ (绵延连结的天色)_L.ogg`

## 3. 总体建设思路

建议不把两个项目简单并排运行，而是以当前音乐分析项目作为主项目，将 face-api.js 的摄像头识别能力迁移进 `frontend/web`，形成一个统一 Web 应用。

原因：

- 音乐项目已经有完整后端、数据库、扫描、播放和推荐接口。
- 摄像头识别是纯前端能力，不需要单独保留一个 Create React App 子项目。
- 统一前端可以让“识别情绪”和“推荐音乐”直接共享状态。
- 避免同时维护 Vite 与 Create React App 两套前端运行环境。

最终结构建议：

```text
Music_Mood_Detection/
├── src/                         # C++ 后端，继续负责音乐分析、数据库和 API
├── models/                      # 音乐情绪分析 ncnn/ONNX 模型
├── frontend/web/                # 统一后的主 Web 前端
│   ├── public/
│   │   └── face-models/         # 从 FacialEmotionDetector 迁入的 face-api 模型
│   └── src/
│       ├── components/
│       │   ├── EmotionCamera.jsx
│       │   ├── EmotionRadioPanel.jsx
│       │   ├── ControlPanel.jsx
│       │   ├── Player.jsx
│       │   └── MoodChart.jsx
│       └── emotionMapping.js
├── FacialEmotionDetector/        # 保留为参考项目，不作为最终主入口
├── My_music/                     # 本地测试音乐库
├── README.md
├── README_CN.md                  # 后续可新增总项目中文说明
├── ANALYSE.md
└── PLAN.md
```

## 4. 目标功能拆解

### 4.1 音乐库导入与分析

目标：

- 用户在 Web 页面选择本地音乐文件夹。
- 后端递归扫描音频文件。
- 后端调用音乐分析模型生成每首歌的 Valence/Arousal。
- 分析结果保存到 SQLite。
- 前端实时展示扫描进度。

复用现有能力：

- `ControlPanel.jsx`
- `FolderBrowser.jsx`
- `LibraryScanner`
- `EmotionPredictor`
- `DatabaseManager`
- `/api/config/folders`
- `/api/status`
- `/api/events`
- `/api/tracks`

第一阶段不需要重写这部分，只需要在新 UI 中保留并优化交互入口。

### 4.2 面部情绪识别

目标：

- 用户点击“开启情绪识别”。
- 浏览器请求摄像头权限。
- 前端加载 face-api.js 与表情识别模型。
- 前端实时识别用户当前面部情绪。
- 页面显示当前识别结果、置信度和推荐策略。

拟新增组件：

```text
frontend/web/src/components/EmotionCamera.jsx
```

组件职责：

- 管理摄像头视频流。
- 加载 face-api 模型。
- 定时检测表情。
- 输出当前表情结果。
- 输出每类情绪概率。
- 支持开始、暂停、重新检测。
- 组件卸载时释放摄像头。

建议输出数据结构：

```js
{
  label: "happy",
  confidence: 0.86,
  scores: {
    neutral: 0.02,
    happy: 0.86,
    sad: 0.01,
    angry: 0.03,
    fearful: 0.01,
    disgusted: 0.00,
    surprised: 0.07
  },
  timestamp: 1710000000000
}
```

### 4.3 面部情绪到音乐情绪空间的映射

音乐分析模型输出的是 Valence/Arousal 二维坐标，范围约为 0-10。

face-api.js 输出的是离散表情类别。需要设计一个映射表，把用户表情映射到音乐推荐目标坐标。

建议初始映射：

| 面部表情 | 中文含义 | 推荐目标 Valence | 推荐目标 Arousal | 推荐含义 |
| --- | --- | ---: | ---: | --- |
| happy | 开心 | 8.0 | 6.5 | 推荐愉悦、活跃的歌曲 |
| neutral | 平静/中性 | 5.5 | 4.0 | 推荐轻松、不刺激的歌曲 |
| sad | 悲伤 | 3.0 | 3.0 | 推荐低愉悦、低能量歌曲，贴合情绪 |
| angry | 生气 | 3.0 | 8.0 | 推荐高能量、低愉悦歌曲 |
| fearful | 害怕 | 2.8 | 7.0 | 推荐紧张、高唤醒歌曲，或后续可改为安抚策略 |
| disgusted | 厌恶 | 2.5 | 5.5 | 推荐低愉悦、中等能量歌曲 |
| surprised | 惊讶 | 6.5 | 8.0 | 推荐明亮、高能量歌曲 |

拟新增文件：

```text
frontend/web/src/emotionMapping.js
```

建议内容：

- `FACE_TO_MUSIC_MOOD` 映射表。
- `getMoodTarget(faceEmotion, strategy)` 方法。
- 支持不同推荐策略：
  - `match`：匹配当前情绪。
  - `comfort`：情绪安抚，例如 sad 时推荐更高 valence、低 arousal 的音乐。
  - `energize`：提振模式，例如 neutral/sad 时推荐高 valence、中高 arousal 的音乐。

第一阶段建议先实现 `match` 策略，保证逻辑清晰、可演示。

### 4.4 自动推荐歌单

目标：

- 当前端识别到用户表情后，自动向后端请求推荐歌单。
- 后端根据目标 Valence/Arousal 和半径查找歌曲。
- 前端展示推荐理由和推荐歌曲列表。
- 用户可以一键播放推荐歌单。

可复用现有 API：

```text
GET /api/playlist/generate?v=8&a=6.5&r=1.2&limit=20&format=json
```

建议前端调用逻辑：

```js
const target = mapFaceEmotionToMusicMood(faceEmotion)
const res = await axios.get('/api/playlist/generate', {
  params: {
    v: target.v,
    a: target.a,
    r: selectedRadius,
    limit: appSettings.limit,
    format: 'json'
  }
})
```

推荐触发策略：

- 不要每 100ms 检测一次就请求后端。
- 使用防抖和稳定窗口。
- 例如连续 2 秒识别为同一主要情绪，才触发一次推荐。
- 如果情绪类别未变化，则不重复请求。
- 用户可以手动点击“根据当前情绪推荐”立即触发。

### 4.5 统一播放器

目标：

- 推荐歌单生成后，直接复用现有 `Player.jsx` 播放。
- 当前播放歌曲在情绪图中高亮。
- 播放时继续显示歌曲情绪轨迹。

需要调整：

- `Player.jsx` 当前主要围绕 `selectedTrack` 生成相似歌单。
- 新需求中还需要支持“外部传入一组推荐歌单并播放”。

建议新增或改造接口：

```jsx
<Player
  selectedTrack={selectedTrack}
  externalPlaylist={emotionPlaylist}
  autoPlayPlaylistTrigger={emotionPlaylistVersion}
  ...
/>
```

或新增一个更清晰的播放状态管理层：

```text
App.jsx
├── selectedTrack
├── currentTrack
├── currentPlaylist
├── playlistSource: "manual" | "similarity" | "faceEmotion"
└── setPlaylistAndPlay(list)
```

第一阶段建议尽量少改 `Player.jsx`，可以先把情绪推荐返回的第一首歌作为 `selectedTrack`，再让用户手动点击生成/播放列表。第二阶段再实现完整自动播放推荐歌单。

## 5. 页面交互设计

### 5.1 推荐主界面布局

建议在现有音乐播放器界面基础上增加“情绪电台”区域。

桌面端布局：

```text
┌─────────────────────────────────────────────────────────────┐
│ 顶部：Emotion Music Radio / 主题切换 / 状态提示              │
├───────────────┬───────────────────────────────┬─────────────┤
│ 左侧控制区     │ 中间情绪图                     │ 右侧情绪识别 │
│ - 添加音乐库   │ - 歌曲 Valence/Arousal 散点图   │ - 摄像头画面 │
│ - 扫描进度     │ - 当前推荐区域半径              │ - 当前表情   │
│ - 预设导出     │ - 当前播放轨迹                  │ - 置信度     │
│ - 设置         │                               │ - 推荐按钮   │
├───────────────┴───────────────────────────────┴─────────────┤
│ 底部/左侧：播放器、推荐歌单、导出按钮                         │
└─────────────────────────────────────────────────────────────┘
```

考虑当前项目已经是左侧控制 + 右侧大图布局，第一阶段可采用：

- 左侧上方：音乐库控制。
- 左侧中部：面部情绪识别卡片。
- 左侧下方：播放器。
- 右侧：情绪散点图。

这样改动最小，符合现有结构。

### 5.2 核心交互流程

用户流程：

1. 打开应用。
2. 点击“选择音乐库”。
3. 选择 `My_music` 或自己的音乐目录。
4. 等待扫描分析完成。
5. 点击“开启摄像头识别”。
6. 浏览器弹出摄像头权限，用户点击允许。
7. 页面显示当前识别表情，例如“开心 happy，置信度 86%”。
8. 系统显示“正在为你推荐：愉悦、活跃的歌曲”。
9. 页面生成推荐歌单。
10. 用户点击播放，或开启自动播放。

### 5.3 状态提示

需要明确提示以下状态：

- 音乐库未添加。
- 音乐正在扫描。
- 音乐分析未完成。
- 摄像头未开启。
- 正在加载人脸模型。
- 等待摄像头权限。
- 未检测到人脸。
- 当前表情识别不稳定。
- 推荐歌单为空。
- 正在播放推荐歌曲。

## 6. 技术架构设计

### 6.1 后端

第一阶段后端基本不需要大改。

继续保留：

- C++ `MusicMoodCLI`。
- SQLite 数据库。
- 音乐扫描与分析。
- `/api/playlist/generate` 推荐接口。
- `/api/stream` 音频流。
- `/api/tracks` 歌曲列表。
- `/api/track/detail` 歌曲详情。

可选新增 API：

```text
GET /api/playlist/by-face-emotion?emotion=happy&strategy=match&r=1.2&limit=20
```

但第一阶段不建议新增，因为前端可以直接完成 face emotion 到 v/a 的映射，再复用已有 `/api/playlist/generate`。

### 6.2 前端

统一使用：

- `frontend/web`
- React
- Vite
- TailwindCSS
- Chart.js
- face-api.js

需要迁移的资源：

```text
FacialEmotionDetector/public/face-api.min.js
FacialEmotionDetector/public/models/*
```

迁移目标：

```text
frontend/web/public/face-api.min.js
frontend/web/public/face-models/*
```

或使用 npm 包：

```bash
npm install face-api.js
```

二选一建议：

- 为了课程项目稳定演示，建议第一阶段直接复制当前已验证可用的 `face-api.min.js` 和模型文件到 `frontend/web/public`。
- 后续若要工程化，再改为 npm 包导入。

### 6.3 情绪推荐层

新增前端逻辑层：

```text
frontend/web/src/emotionMapping.js
frontend/web/src/hooks/useStableFaceEmotion.js
```

`emotionMapping.js`：

- 管理表情到音乐坐标的映射。
- 管理推荐文案。
- 管理不同推荐策略。

`useStableFaceEmotion.js`：

- 对实时表情结果做平滑处理。
- 避免瞬间误识别导致推荐频繁变化。
- 输出稳定表情结果。

## 7. 数据流设计

### 7.1 音乐分析数据流

```text
用户选择目录
  ↓
POST /api/config/folders
  ↓
LibraryScanner 递归扫描
  ↓
EmotionPredictor 分析音频
  ↓
DatabaseManager 保存结果
  ↓
SSE /api/events 推送进度
  ↓
前端刷新 /api/tracks
  ↓
MoodChart 展示散点
```

### 7.2 人脸情绪推荐数据流

```text
用户开启摄像头
  ↓
EmotionCamera 加载 face-api 模型
  ↓
浏览器 getUserMedia 获取视频流
  ↓
face-api.js 实时识别表情
  ↓
useStableFaceEmotion 输出稳定表情
  ↓
emotionMapping 映射到 Valence/Arousal
  ↓
GET /api/playlist/generate
  ↓
前端展示推荐歌单
  ↓
Player 播放歌曲
  ↓
MoodChart 高亮推荐歌曲与当前播放轨迹
```

## 8. 实施阶段计划

### 阶段一：统一前端入口

目标：

- 确定 `frontend/web` 为唯一主 Web 应用。
- 保留 `FacialEmotionDetector` 作为参考，不再作为最终运行入口。
- 将 face-api 相关静态资源迁入 Vite 前端。

任务：

1. 在 `frontend/web/public` 下创建 `face-models/`。
2. 复制 `FacialEmotionDetector/public/models/*` 到 `frontend/web/public/face-models/`。
3. 复制或引入 `face-api.min.js`。
4. 确认 Vite 下可访问：
   - `/face-api.min.js`
   - `/face-models/face_expression_model-weights_manifest.json`
5. 保持原音乐页面仍能正常运行。

验收：

- `frontend/web` 能正常启动。
- 原音乐扫描、图表、播放功能不受影响。
- face-api 静态文件能通过浏览器访问。

### 阶段二：新增摄像头识别组件

目标：

- 在主 Web 中实现人脸表情识别。

任务：

1. 新建 `EmotionCamera.jsx`。
2. 实现摄像头开启/关闭。
3. 实现 face-api 模型加载。
4. 实现表情检测。
5. 显示当前表情、emoji、置信度。
6. 组件卸载时释放摄像头。
7. 处理常见错误：
   - 摄像头权限拒绝。
   - 浏览器不支持。
   - 模型加载失败。
   - 未检测到人脸。

验收：

- 用户点击按钮后可以看到摄像头画面。
- 页面可以显示当前表情识别结果。
- 关闭组件或页面后摄像头释放。

### 阶段三：实现表情到音乐情绪映射

目标：

- 将 face-api 的离散表情转换为音乐推荐目标坐标。

任务：

1. 新建 `emotionMapping.js`。
2. 定义 `FACE_TO_MUSIC_MOOD`。
3. 输出推荐文案。
4. 增加推荐半径配置。
5. 增加推荐策略配置，第一阶段默认 `match`。

验收：

- 识别 happy 时目标坐标接近高 Valence、中高 Arousal。
- 识别 sad 时目标坐标接近低 Valence、低 Arousal。
- UI 能显示“当前情绪 -> 推荐音乐氛围”的解释。

### 阶段四：接入推荐歌单

目标：

- 根据识别情绪自动请求音乐推荐。

任务：

1. 在 `App.jsx` 中维护 `faceEmotion`、`moodTarget`、`emotionPlaylist`。
2. 当稳定情绪变化时调用 `/api/playlist/generate`。
3. 展示推荐列表。
4. 高亮推荐歌曲在 `MoodChart` 中的位置。
5. 支持手动“根据当前情绪推荐”。
6. 支持推荐半径调节。

验收：

- 完成音乐扫描后，开启摄像头可以得到推荐列表。
- 推荐列表来自用户本地音乐库。
- 推荐结果能在图上高亮。

### 阶段五：播放器联动

目标：

- 推荐歌单可以直接播放。

任务：

1. 调整 `Player.jsx`，支持外部歌单输入。
2. 或在 `App.jsx` 中将推荐歌单首项设置为当前播放歌曲。
3. 播放时拉取歌曲详情。
4. 播放时更新当前轨迹和图表高亮。
5. 增加“自动播放推荐歌曲”开关。

验收：

- 点击推荐歌曲可以播放。
- 点击“一键播放推荐歌单”可以从第一首开始播放。
- 播放过程中图表上的当前播放点正常移动。

### 阶段六：课程展示优化

目标：

- 让项目更适合作为“人机交互导论”课程展示。

任务：

1. 增加项目首页标题：情绪音乐电台。
2. 增加流程提示：
   - 选择音乐库。
   - 等待分析。
   - 开启摄像头。
   - 获取推荐。
3. 增加隐私说明：
   - 摄像头画面不上传。
   - 音乐文件不上传。
   - 所有分析在本地完成。
4. 增加演示模式：
   - 如果音乐库为空，提示选择 `My_music`。
   - 如果摄像头不可用，允许手动选择表情测试推荐。
5. 增加项目中文 README。

验收：

- 教师或同学能按页面提示完成完整体验。
- 无摄像头环境下也能用“手动情绪选择”展示推荐流程。

## 9. 推荐算法初版设计

第一阶段推荐算法使用简单、可解释的二维距离匹配。

定义：

- 歌曲坐标：`song = (valence, arousal)`
- 用户情绪目标：`target = (v, a)`
- 距离：`distance = sqrt((song.v - v)^2 + (song.a - a)^2)`

推荐策略：

- 选择距离小于半径 `r` 的歌曲。
- 按距离升序排序。
- 如果范围内没有歌曲，使用后端已有 KNN 回退机制。
- 限制最大数量，例如 20 首。
- 可选限制总时长，例如 30 分钟。

优点：

- 简单直观。
- 可在情绪图中可视化解释。
- 适合课程展示。
- 能复用现有 `/api/playlist/generate`。

后续可扩展：

- 加入用户喜欢/跳过反馈。
- 引入播放历史。
- 支持“改善心情”而不是“匹配心情”。
- 支持按时间段、场景、能量需求推荐。

## 10. 情绪策略扩展设想

### 10.1 匹配模式

用户是什么情绪，就推荐相同氛围的音乐。

示例：

- 开心 -> 开心歌曲。
- 悲伤 -> 悲伤歌曲。
- 生气 -> 激烈歌曲。

适合第一阶段。

### 10.2 安抚模式

当用户处于负面情绪时，推荐逐步缓和的歌曲。

示例：

- sad -> valence 5.5、arousal 3.0 的温和歌曲。
- angry -> valence 5.0、arousal 4.0 的舒缓歌曲。
- fearful -> valence 6.0、arousal 3.0 的安全感歌曲。

适合课程项目后续深化。

### 10.3 提振模式

当用户低落或疲惫时，推荐更明亮的歌曲。

示例：

- neutral -> valence 7.0、arousal 5.5。
- sad -> valence 6.5、arousal 4.5。

适合增加人机交互中的“主动支持”概念。

## 11. 需要新增或修改的主要文件

### 新增文件

```text
PLAN.md
frontend/web/public/face-api.min.js
frontend/web/public/face-models/*
frontend/web/src/components/EmotionCamera.jsx
frontend/web/src/components/EmotionRadioPanel.jsx
frontend/web/src/emotionMapping.js
frontend/web/src/hooks/useStableFaceEmotion.js
```

可选新增：

```text
README_CN.md
frontend/web/src/components/ManualEmotionSelector.jsx
frontend/web/src/components/RecommendationList.jsx
```

### 修改文件

```text
frontend/web/src/App.jsx
frontend/web/src/components/Player.jsx
frontend/web/src/components/MoodChart.jsx
frontend/web/src/components/ControlPanel.jsx
frontend/web/src/index.css
frontend/web/package.json
README.md
```

后端第一阶段预计不需要改动。如果需要更强语义 API，可后续修改：

```text
src/server/WebServer.h
src/db/DatabaseManager.h
```

## 12. 风险与处理方案

### 12.1 摄像头权限问题

风险：

- 浏览器拒绝摄像头。
- 用户设备没有摄像头。
- 用户使用非 localhost/HTTPS 地址访问。

处理：

- 页面明确提示使用 `localhost`。
- 增加错误状态显示。
- 增加手动情绪选择作为演示兜底。

### 12.2 face-api 模型加载失败

风险：

- 模型路径错误。
- Vite public 路径不正确。

处理：

- 使用 `/face-models` 作为固定 public 路径。
- 在浏览器 Network 面板验证模型 JSON 和 shard 文件。
- 加载失败时显示明确错误。

### 12.3 音乐分析耗时较长

风险：

- 首次扫描音乐库需要较长时间。
- 课堂演示等待时间过长。

处理：

- 使用 `My_music` 小型样例库演示。
- 扫描进度用 SSE 实时展示。
- 分析结果保存到 SQLite，第二次打开不需要重复分析。

### 12.4 推荐为空

风险：

- 用户音乐库太小。
- 当前情绪目标附近没有歌曲。

处理：

- 使用更大的默认推荐半径，例如 1.5。
- 保留后端 KNN 回退机制。
- UI 显示“当前范围为空，已为你扩大搜索”。

### 12.5 两套前端技术栈混杂

风险：

- `FacialEmotionDetector` 使用 Create React App。
- 主项目使用 Vite。

处理：

- 最终只保留 `frontend/web` 作为主入口。
- `FacialEmotionDetector` 仅作为参考和素材来源。
- 不在最终应用中同时运行两个 dev server。

## 13. 第一版最小可行产品范围

第一版 MVP 建议只做以下内容：

1. 用户可以在主 Web 中选择音乐库。
2. 后端可以完成音乐分析。
3. 主 Web 中新增摄像头识别卡片。
4. 页面显示当前面部表情。
5. 面部表情映射到 Valence/Arousal。
6. 点击“根据当前情绪推荐”生成歌单。
7. 点击推荐歌曲播放。
8. 情绪图高亮推荐歌曲。

暂不做：

- 用户账号。
- 云端存储。
- 复杂推荐算法。
- 多人识别。
- 长期情绪历史。
- 移动端深度适配。

## 14. 验收标准

### 功能验收

- 可以从 Web 页面选择 `My_music` 目录。
- 音乐分析完成后，图表中出现歌曲散点。
- 点击“开启摄像头”后，浏览器摄像头启动。
- 页面能识别并显示当前面部表情。
- 点击推荐按钮后，可以生成符合当前表情的推荐歌单。
- 推荐歌曲可以播放。
- 播放时图表能显示当前歌曲情绪轨迹。

### 稳定性验收

- 摄像头权限拒绝时页面不崩溃。
- 未检测到人脸时页面有提示。
- 音乐库为空时页面有提示。
- 推荐为空时页面有回退提示。
- 刷新页面后已分析音乐仍能从 SQLite 中读取。

### 展示验收

- 页面能清晰表达“用户情绪 -> 音乐推荐”的人机交互流程。
- 推荐逻辑能用二维情绪图解释。
- 隐私说明明确：摄像头和音乐均在本地处理。

## 15. 建议实施顺序

建议审查通过后按以下顺序实施：

1. 迁移 face-api 静态资源到 `frontend/web/public`。
2. 新增 `EmotionCamera.jsx`，完成摄像头识别。
3. 新增 `emotionMapping.js`，完成表情到音乐坐标映射。
4. 在 `App.jsx` 中接入识别结果和推荐请求。
5. 新增 `EmotionRadioPanel.jsx`，展示当前情绪、推荐目标和推荐歌单。
6. 调整 `Player.jsx`，支持播放推荐歌单。
7. 调整 `MoodChart.jsx`，高亮情绪推荐结果。
8. 用 `My_music` 完整跑通演示流程。
9. 更新总项目 README/README_CN。

## 16. 推荐的最终运行方式

开发模式建议两个进程：

```bash
# 终端 1：启动 C++ 后端 API
./build/Release/MusicMoodCLI.exe --api-only --model-dir ./models

# 终端 2：启动统一 Web 前端
cd frontend/web
npm install
npm run dev
```

浏览器访问 Vite 地址，通常是：

```text
http://localhost:5173
```

发布模式建议：

```bash
cd frontend/web
npm run build
```

然后将 `frontend/web/dist` 作为后端静态资源目录，由 C++ 后端统一提供 Web 页面和 API。

## 17. 结论

本项目最稳妥的搭建路线是：以现有 Music Mood 项目为主系统，保留 C++ 后端的音乐分析、数据库和推荐能力，把 FacialEmotionDetector 的摄像头识别能力迁移进 `frontend/web`，最终形成一个统一的“情绪音乐电台”Web 应用。

这样既能最大限度复用已有代码，又能让课程项目的交互主题非常清晰：系统观察用户当前情绪，并用本地音乐库给出个性化音乐回应。
