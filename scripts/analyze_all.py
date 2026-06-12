"""用 ONNX + librosa 重新分析所有 status=2 的歌曲,把 V/A 写回 SQLite。

用法:
    python scripts/analyze_all.py              # dry-run, 只打印不写
    python scripts/analyze_all.py --apply      # 真正更新数据库
    python scripts/analyze_all.py --apply --preproc log10
"""
import argparse
import struct
import sqlite3
import sys
import time

import numpy as np
import librosa
import onnxruntime as ort

DB_PATH = "music_mood.db"
SR = 16000
N_FFT = 512
HOP = 256
N_MELS = 96
WIN_FRAMES = 187
HOP_FRAMES = WIN_FRAMES - int(1.0 * SR / HOP)

musicnn = ort.InferenceSession("models/msd-musicnn-1.onnx",
                                providers=["CPUExecutionProvider"])
regressor = ort.InferenceSession("models/deam-msd-musicnn-2.onnx",
                                  providers=["CPUExecutionProvider"])


def geometric_median(points, eps=1e-6, max_iter=50, tol=1e-5):
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


def compress(mel, mode):
    if mode == "log10":
        return np.log10(mel + 1e-10).astype(np.float32)
    if mode == "cpp":
        return np.log10(10000.0 * mel + 1.0).astype(np.float32)
    if mode == "power_to_db":
        return librosa.power_to_db(mel, ref=np.max).astype(np.float32)
    raise ValueError(mode)


def analyze(path, preproc):
    y, _ = librosa.load(path, sr=SR, mono=True)
    if len(y) < N_FFT:
        return None
    mel = librosa.feature.melspectrogram(
        y=y, sr=SR, n_fft=N_FFT, hop_length=HOP, n_mels=N_MELS,
        center=True, power=2.0
    )
    log_mel = compress(mel, preproc)
    T = log_mel.shape[1]
    if T < WIN_FRAMES:
        return None
    starts = list(range(0, T - WIN_FRAMES + 1, HOP_FRAMES))
    if not starts:
        return None
    windows = np.stack([log_mel[:, s:s + WIN_FRAMES].T for s in starts]).astype(np.float32)
    embed = musicnn.run(["embeddings"], {"melspectrogram": windows})[0]
    va = regressor.run(None, {"model/Placeholder:0": embed})[0]
    gv, ga = geometric_median(va)
    duration = len(y) / SR
    traj = [(s * HOP / SR, float(v), float(a)) for s, (v, a) in zip(starts, va)]
    return float(gv), float(ga), duration, traj


def serialize_trajectory(traj):
    """与 C++ 后端兼容: [t, v, a, t, v, a, ...] 三个 float 一组,二进制。"""
    flat = []
    for t, v, a in traj:
        flat.extend([t, v, a])
    return struct.pack(f"{len(flat)}f", *flat)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="实际写库")
    ap.add_argument("--preproc", default="cpp",
                    choices=["cpp", "log10", "power_to_db"])
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 首")
    args = ap.parse_args()

    con = sqlite3.connect(DB_PATH)
    rows = list(con.execute(
        "SELECT id, filepath, filename FROM tracks WHERE status=2 ORDER BY id"
    ))
    if args.limit:
        rows = rows[:args.limit]

    print(f"准备分析 {len(rows)} 首歌,preproc={args.preproc},apply={args.apply}\n")
    t0 = time.time()
    new_vals = []

    for i, (tid, path, name) in enumerate(rows, 1):
        try:
            result = analyze(path, args.preproc)
        except Exception as e:
            print(f"  [{i}/{len(rows)}] #{tid} {name[:35]} ERROR {e}")
            continue
        if not result:
            print(f"  [{i}/{len(rows)}] #{tid} {name[:35]} SKIP (too short)")
            continue
        gv, ga, dur, traj = result
        new_vals.append((tid, gv, ga, dur, traj))
        print(f"  [{i}/{len(rows)}] #{tid} V={gv:5.2f} A={ga:5.2f} dur={dur:6.1f}s {name[:40]}")

    elapsed = time.time() - t0
    print(f"\n分析完成,耗时 {elapsed:.1f}s,得到 {len(new_vals)} 条结果")

    if not new_vals:
        return

    vs = np.array([r[1] for r in new_vals])
    as_ = np.array([r[2] for r in new_vals])
    print(f"  V: min={vs.min():.2f} max={vs.max():.2f} mean={vs.mean():.2f} std={vs.std():.2f}")
    print(f"  A: min={as_.min():.2f} max={as_.max():.2f} mean={as_.mean():.2f} std={as_.std():.2f}")

    if not args.apply:
        print("\n[dry-run] 加 --apply 才写库")
        return

    print("\n写入数据库 ...")
    with con:
        for tid, gv, ga, dur, traj in new_vals:
            con.execute(
                "UPDATE tracks SET valence=?, arousal=?, duration=?, trajectory_data=? WHERE id=?",
                (float(gv), float(ga), float(dur), serialize_trajectory(traj), tid)
            )
    print("完成。")


if __name__ == "__main__":
    main()
