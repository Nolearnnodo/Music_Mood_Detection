"""用 ONNX + librosa 正确预处理分析单首歌,对比数据库现有值。

用法:
    python scripts/analyze_one.py <track_id> [<track_id> ...]
"""
import sys
import sqlite3
import numpy as np
import librosa
import onnxruntime as ort

DB_PATH = "music_mood.db"
SR = 16000
N_FFT = 512
HOP = 256
N_MELS = 96
WIN_FRAMES = 187
HOP_FRAMES = WIN_FRAMES - int(1.0 * SR / HOP)  # 1 秒重叠

musicnn = ort.InferenceSession("models/msd-musicnn-1.onnx",
                                providers=["CPUExecutionProvider"])
regressor = ort.InferenceSession("models/deam-msd-musicnn-2.onnx",
                                  providers=["CPUExecutionProvider"])


def geometric_median(points, eps=1e-6, max_iter=50, tol=1e-5):
    """Weiszfeld 算法,与 C++ 后端保持一致。"""
    pts = np.asarray(points, dtype=np.float32)
    y = pts.mean(axis=0)
    for _ in range(max_iter):
        d = np.linalg.norm(pts - y, axis=1)
        w = 1.0 / np.maximum(d, eps)
        y_new = (pts * w[:, None]).sum(axis=0) / w.sum()
        if np.linalg.norm(y_new - y) < tol:
            return y_new
        y = y_new
    return y


def analyze(path, preproc="power_to_db"):
    """返回 (global_v, global_a, trajectory)"""
    y, _ = librosa.load(path, sr=SR, mono=True)
    if len(y) < N_FFT:
        return None, None, []

    mel = librosa.feature.melspectrogram(
        y=y, sr=SR, n_fft=N_FFT, hop_length=HOP, n_mels=N_MELS,
        center=True, power=2.0
    )  # shape [96, T]

    if preproc == "power_to_db":
        log_mel = librosa.power_to_db(mel, ref=np.max)
    elif preproc == "power_to_db_ref1":
        log_mel = librosa.power_to_db(mel, ref=1.0)
    elif preproc == "log10":
        log_mel = np.log10(mel + 1e-10)
    elif preproc == "cpp":
        log_mel = np.log10(10000.0 * mel + 1.0)
    else:
        raise ValueError(preproc)

    T = log_mel.shape[1]
    if T < WIN_FRAMES:
        return None, None, []

    # 切窗 [N, 187, 96]
    starts = list(range(0, T - WIN_FRAMES + 1, HOP_FRAMES))
    if not starts:
        return None, None, []

    windows = np.stack([log_mel[:, s:s + WIN_FRAMES].T for s in starts])
    windows = windows.astype(np.float32)

    # 批量推理
    embed = musicnn.run(["embeddings"], {"melspectrogram": windows})[0]
    va = regressor.run(None, {"model/Placeholder:0": embed})[0]  # [N, 2]

    gv, ga = geometric_median(va)
    traj = [(s * HOP / SR, float(v), float(a))
            for s, (v, a) in zip(starts, va)]
    return float(gv), float(ga), traj


def main():
    track_ids = [int(x) for x in sys.argv[1:]] or [1, 2, 6]
    con = sqlite3.connect(DB_PATH)
    rows = list(con.execute(
        "SELECT id, filepath, filename, valence, arousal FROM tracks "
        f"WHERE id IN ({','.join('?'*len(track_ids))})", track_ids))

    preprocs = ["power_to_db", "power_to_db_ref1", "log10", "cpp"]

    for tid, path, name, db_v, db_a in rows:
        print(f"\n=== #{tid} {name[:50]} ===")
        print(f"  DB stored:        V={db_v:8.2f}  A={db_a:8.2f}")
        for pp in preprocs:
            try:
                gv, ga, traj = analyze(path, preproc=pp)
                if gv is None:
                    print(f"  {pp:18s}: too short")
                    continue
                vs = [t[1] for t in traj]
                as_ = [t[2] for t in traj]
                print(f"  {pp:18s}: V={gv:8.2f}  A={ga:8.2f}  "
                      f"(per-window V∈[{min(vs):.1f},{max(vs):.1f}] "
                      f"A∈[{min(as_):.1f},{max(as_):.1f}], n={len(traj)})")
            except Exception as e:
                print(f"  {pp:18s}: ERROR {e}")


if __name__ == "__main__":
    main()
