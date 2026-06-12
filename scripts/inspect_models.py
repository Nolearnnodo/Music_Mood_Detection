"""检查两个 ONNX 模型的输入/输出 shape,确认接口。"""
import onnxruntime as ort
import sys

for name in ["models/msd-musicnn-1.onnx", "models/deam-msd-musicnn-2.onnx"]:
    print(f"\n=== {name} ===")
    sess = ort.InferenceSession(name, providers=["CPUExecutionProvider"])
    for i in sess.get_inputs():
        print(f"  IN  {i.name:10s} shape={i.shape} dtype={i.type}")
    for o in sess.get_outputs():
        print(f"  OUT {o.name:10s} shape={o.shape} dtype={o.type}")
