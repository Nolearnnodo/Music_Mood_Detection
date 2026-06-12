# 数据库管理与云端生成指南

本项目使用 SQLite 数据库保存音乐库目录、歌曲路径和模型推理结果。默认数据库文件为根目录下的 `music_mood.db`。

## 1. 数据库文件

默认会看到这些文件：

```text
music_mood.db
music_mood.db-wal
music_mood.db-shm
```

含义如下：

- `music_mood.db`：主数据库文件。
- `music_mood.db-wal`：SQLite WAL 日志文件，运行中可能包含尚未合并进主库的数据。
- `music_mood.db-shm`：SQLite WAL 共享内存辅助文件。

程序启动和退出时会执行 WAL checkpoint，尽量把 WAL 中的数据合并回 `music_mood.db`。为了稳妥，迁移数据库时建议先正常关闭程序，再复制数据库文件。

## 2. 数据表结构

数据库主要包含两张业务表。

### `directories`

保存用户添加过的音乐目录。

字段：

- `id`：目录 ID。
- `path`：音乐目录路径，唯一。

### `tracks`

保存每首音乐及其分析结果。

字段：

- `id`：歌曲 ID。
- `filepath`：歌曲完整路径，唯一。
- `filename`：歌曲文件名。
- `status`：分析状态。
- `valence`：愉悦度。
- `arousal`：唤醒度。
- `duration`：歌曲时长，单位秒。
- `trajectory_data`：情绪轨迹 BLOB，按 `[time, valence, arousal, ...]` 序列化保存。

`status` 状态含义：

- `0`：等待分析。
- `1`：处理中或上次中断后待恢复。
- `2`：分析完成。
- `-1`：分析失败。

当前主要播放、情绪图表和歌单生成都只使用 `status=2` 的歌曲。

## 3. 正常启动时数据库如何变化

默认启动命令示例：

```powershell
MusicMoodCLI.exe --model-dir ./models --web-root ./web
```

启动流程：

1. 打开 `music_mood.db`，如果不存在则自动创建。
2. 创建 `directories`、`tracks` 表和 `idx_va` 索引。
3. 启用 SQLite WAL 模式。
4. 加载 AI 模型。
5. 读取 `directories` 表。
6. 检查这些目录在本机是否存在。
7. 对本机存在的目录，清理已经不存在的已完成歌曲记录。
8. 启动扫描 worker。
9. 把 `tracks.status IN (0, 1)` 的未完成歌曲重新加入分析队列。

注意：如果数据库中保存的是云端路径，而本地不存在这些目录，程序会把这些目录视为 inactive。inactive 目录下的歌曲不会展示到前端，但记录仍保留在数据库中。

## 4. 用户添加音乐目录时数据库如何变化

前端添加目录后，后端会调用扫描流程。

流程：

1. 把目录路径写入 `directories`。
2. 扫描该目录下的音频文件。
3. 支持的扩展名包括：

```text
.mp3 .wav .flac .m4a .ogg .aac .ape .wma .wv .aiff
```

4. 每个音频文件调用 `add_or_get_track`：

- 如果 `filepath` 不存在：插入新记录，`status=0`。
- 如果已存在且 `status=2`：认为已完成，不重复推理。
- 如果已存在但不是 `status=2`：重置为 `status=0`，重新加入队列。

5. worker 取任务后调用模型推理。
6. 推理成功后更新：

```text
status=2
valence=<模型输出>
arousal=<模型输出>
duration=<音频时长>
trajectory_data=<情绪轨迹>
```

7. 推理失败后更新：

```text
status=-1
```

## 5. 云端生成 DB，本地直接运行

适合本地资源有限、不希望每次加载模型或重新推理的场景。

核心原则：

1. 云端负责扫描音乐和模型推理。
2. 本地只使用生成好的数据库。
3. 本地必须能访问 `tracks.filepath` 指向的真实音乐文件。
4. 如果云端路径和本地路径不同，需要做路径映射。

### 5.1 云端生成数据库

在云端运行完整分析模式：

```powershell
MusicMoodCLI.exe --api-only --db-path music_mood.db --model-dir ./models
```

然后通过前端或 API 添加音乐目录，等待分析完成。可以通过状态接口确认进度：

```text
GET /api/status
```

当 `done + failed >= total` 时，扫描任务已经结束。

建议在复制数据库前正常关闭云端程序，确保 WAL 数据合并回 `music_mood.db`。

### 5.2 本地直接启动，不加载模型

把云端生成的 `music_mood.db` 拉取到本地项目根目录后，使用：

```powershell
MusicMoodCLI.exe --no-analysis --read-only --db-path music_mood.db --web-root ./web
```

`--no-analysis` 会：

- 跳过 AI 模型加载。
- 跳过扫描 worker。
- 不恢复未完成任务。
- 强制只读运行。

因此本地启动速度更快，也不会占用本地资源做推理。

### 5.3 云端路径和本地路径一致

如果云端和本地音乐路径完全一致，例如都挂载为：

```text
F:\Music
```

那么本地只需要启动：

```powershell
MusicMoodCLI.exe --no-analysis --read-only --db-path music_mood.db --web-root ./web
```

### 5.4 云端路径和本地路径不同

如果云端路径是：

```text
/mnt/music
```

本地路径是：

```text
F:\Music
```

首次本地启动时执行路径映射：

```powershell
MusicMoodCLI.exe --no-analysis --db-path music_mood.db --path-map "/mnt/music" "F:\Music" --web-root ./web
```

该命令会把数据库中的路径前缀改写：

- `directories.path`
- `tracks.filepath`

例如：

```text
/mnt/music/a/b/song.mp3
```

会被改成：

```text
F:\Music\a\b\song.mp3
```

路径映射会写回数据库。完成一次后，后续可以直接只读启动：

```powershell
MusicMoodCLI.exe --no-analysis --read-only --db-path music_mood.db --web-root ./web
```

## 6. 常用启动命令

完整分析模式：

```powershell
MusicMoodCLI.exe --db-path music_mood.db --model-dir ./models --web-root ./web
```

前后端开发模式，只启动 API：

```powershell
MusicMoodCLI.exe --api-only --db-path music_mood.db --model-dir ./models
```

本地只读播放模式：

```powershell
MusicMoodCLI.exe --no-analysis --read-only --db-path music_mood.db --web-root ./web
```

本地只读 API 模式：

```powershell
MusicMoodCLI.exe --no-analysis --read-only --api-only --db-path music_mood.db
```

路径映射后启动：

```powershell
MusicMoodCLI.exe --no-analysis --db-path music_mood.db --path-map "/cloud/music" "F:\Music" --web-root ./web
```

## 7. 数据迁移建议

推荐做法：

1. 云端完成全部分析。
2. 正常关闭云端程序。
3. 拉取 `music_mood.db`。
4. 确保本地音乐文件目录存在。
5. 如果路径不同，首次本地运行时使用 `--path-map`。
6. 后续本地使用 `--no-analysis --read-only` 启动。

如果无法正常关闭云端程序，建议同时拉取：

```text
music_mood.db
music_mood.db-wal
music_mood.db-shm
```

或者先在云端执行一次完整启动并正常退出，让程序完成 checkpoint。

## 8. 注意事项

- 数据库保存的是音乐路径和分析结果，不包含音乐文件本体。
- 本地播放依赖 `tracks.filepath` 指向的文件真实存在。
- 前端歌曲列表会根据 `directories` 中本机存在的目录过滤歌曲。
- 如果本地看不到歌曲，优先检查 `directories.path` 是否存在于本机。
- 如果路径不同，使用 `--path-map` 改写数据库路径。
- `--no-analysis` 模式不会添加新目录，也不会分析新歌曲。
- 新增音乐仍需要在云端完整分析后，再把更新后的 DB 拉回本地。
