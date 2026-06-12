# scripts/

离线音乐情绪分析脚本。绕开 C++ 端的 ncnn 推理(目前数值异常),
直接用 ONNX Runtime + librosa 调用 `models/*.onnx` 重新计算 V/A,
并把结果写回 `music_mood.db`。

## 环境

依赖 [uv](https://docs.astral.sh/uv/)。一次性初始化:

```powershell
cd scripts
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe onnxruntime librosa soundfile numpy
```

## 用法

从仓库根目录运行(路径都是相对根目录的):

```powershell
# 1. 检查 ONNX 输入/输出
scripts\.venv\Scripts\python.exe scripts\inspect_models.py

# 2. 试跑单首歌、对比不同预处理
scripts\.venv\Scripts\python.exe scripts\analyze_one.py 1 6 24

# 3. dry-run 全库
scripts\.venv\Scripts\python.exe scripts\analyze_all.py --preproc cpp

# 4. 写库(强烈建议先停后端,并 cp music_mood.db music_mood.db.bak)
scripts\.venv\Scripts\python.exe scripts\analyze_all.py --apply --preproc cpp
```

## 预处理对比

`--preproc` 可选 `cpp` / `log10` / `power_to_db`。在测试库上 `cpp`
(等价于后端 C++ 的 `log10(10000*x+1)`)能得到 V/A ≈ [4, 7]、std ≈ 0.8 的
合理分布,语义排序与音乐风格匹配。

## 为什么需要这些脚本

C++ 端 `src/core/FeatureExtractor.h` 的预处理公式本身正确,但 ncnn
推理出来的 V/A 落在 [-135, +138] 区间(本应是 [1, 9])。用同样的
预处理 + ONNX Runtime 直接调,数值就回到正常范围,说明问题在
ONNX → ncnn 转换或 ncnn 推理路径上,而不是特征提取。

在 ncnn 问题修复前,用本目录的 Python 脚本作为离线分析器。
