#!/usr/bin/env python3
"""
whisper_runner.py —— 包装 Whisper.transcribe() 并把进度以 JSON 行流到 stdout。

stdout 协议：每行一个 JSON 对象。
  {"event": "stage", "stage": "...", "ms": 123}        阶段切换（计时）
  {"event": "segment", "id": N, "start": ..., "end": ..., "text": "..."}  每个分段产出（来自 verbose 回调）
  {"event": "result", "format": "json|txt|vtt|srt|jsonl|tsv", "result": {...} 或 "text": "..."}  最终结果
  {"event": "error", "message": "..."}                  失败

调用：
  python3 whisper_runner.py --input audio.wav --model turbo \
      --language en --output-format json

依赖：把仓库内 Whisper/ 目录加入 sys.path 直接 import；也可以 `pip install openai-whisper`。
"""

import sys
import os
import json
import argparse
import time
import tempfile
import traceback

# 强制 stdout 用 UTF-8（Windows 默认 GBK 会让中文乱码）
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# 把仓库内的 Whisper 源码加入 import 路径，优先使用本地版本。
HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL_WHISPER = os.path.join(HERE, "Whisper")
if os.path.isdir(LOCAL_WHISPER):
    sys.path.insert(0, LOCAL_WHISPER)

# 模型权重固定到项目内的 models/whisper 目录，避免每次重新下载
MODEL_DIR = os.path.join(HERE, "models", "whisper")
os.makedirs(MODEL_DIR, exist_ok=True)


def emit(obj):
    """把一行 JSON 写到 stdout 并 flush，供 Node.js SSE 流读取。"""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="音频文件路径")
    ap.add_argument("--model", default="turbo", help="模型名（tiny/base/small/medium/large-v3/turbo 等）")
    ap.add_argument("--language", default=None, help="语种代码，留空则自动识别")
    ap.add_argument("--task", default="transcribe", choices=["transcribe", "translate"])
    ap.add_argument("--output-format", default="json", choices=["json", "txt", "vtt", "srt", "jsonl", "tsv"])
    ap.add_argument("--temperature", type=float, default=0)
    ap.add_argument("--beam-size", type=int, default=5)
    ap.add_argument("--best-of", type=int, default=5)
    ap.add_argument("--patience", type=float, default=None)
    ap.add_argument("--length-penalty", type=float, default=None)
    ap.add_argument("--word-timestamps", action="store_true")
    ap.add_argument("--initial-prompt", default=None)
    ap.add_argument("--compression-ratio-threshold", type=float, default=2.4)
    ap.add_argument("--logprob-threshold", type=float, default=-1.0)
    ap.add_argument("--no-speech-threshold", type=float, default=0.6)
    ap.add_argument("--condition-on-previous-text", action="store_true", default=True)
    ap.add_argument("--no-fp16", dest="fp16", action="store_false", default=True)
    return ap.parse_args()


def emit_stage(name, ms=None, **extra):
    payload = {"event": "stage", "stage": name}
    if ms is not None:
        payload["ms"] = ms
    payload.update(extra)
    emit(payload)


def main():
    args = parse_args()
    t0 = time.time()
    emit_stage("loading", ms=0)

    try:
        import torch  # noqa: F401  （仅用于检测 CUDA）
        import whisper
    except ImportError as e:
        emit({"event": "error", "message": "导入失败：%s。请先 pip install openai-whisper" % e})
        sys.exit(2)

    # 设备选择：WHISPER_DEVICE 环境变量优先，否则自动检测 CUDA
    env_device = os.environ.get("WHISPER_DEVICE", "").lower()
    if env_device in ("cuda", "cpu"):
        device = env_device
    else:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    emit_stage("loading_model", model=args.model, device=device, model_dir=MODEL_DIR)

    try:
        model = whisper.load_model(args.model, device=device, download_root=MODEL_DIR)
    except Exception as e:
        emit({"event": "error", "message": "加载模型失败：%s" % e})
        sys.exit(2)
    emit_stage("model_loaded", ms=int((time.time() - t0) * 1000))

    decode_overrides = {}
    if args.temperature: decode_overrides["temperature"] = args.temperature
    if args.beam_size: decode_overrides["beam_size"] = args.beam_size
    if args.best_of: decode_overrides["best_of"] = args.best_of
    if args.patience is not None: decode_overrides["patience"] = args.patience
    if args.length_penalty is not None: decode_overrides["length_penalty"] = args.length_penalty
    if args.word_timestamps: decode_overrides["word_timestamps"] = True

    # 段级回调：每个分段产出时推一行
    def on_segment(seg):
        emit({
            "event": "segment",
            "id": seg.get("id"),
            "start": seg.get("start"),
            "end": seg.get("end"),
            "text": seg.get("text", ""),
        })

    # 用 verbose=False 跑（我们走自己的回调）
    emit_stage("transcribing")

    try:
        result = whisper.transcribe(
            model,
            args.input,
            language=args.language,
            task=args.task,
            verbose=False,
            compression_ratio_threshold=args.compression_ratio_threshold,
            logprob_threshold=args.logprob_threshold,
            no_speech_threshold=args.no_speech_threshold,
            condition_on_previous_text=args.condition_on_previous_text,
            initial_prompt=args.initial_prompt,
            fp16=args.fp16,
            **decode_overrides,
        )
    except Exception:
        emit({"event": "error", "message": traceback.format_exc()})
        sys.exit(3)

    # 段级回调（补一次，弥补 verbose=False 的空缺）
    for seg in result.get("segments", []):
        on_segment(seg)

    emit_stage("done", ms=int((time.time() - t0) * 1000))

    if args.output_format == "json":
        # 截断超大 tokens 数组便于在网页里展示
        out = dict(result)
        if "segments" in out:
            for s in out["segments"]:
                if "tokens" in s and len(s["tokens"]) > 50:
                    s["tokens"] = s["tokens"][:50] + ["…"]
        emit({"event": "result", "format": "json", "result": out})
    else:
        # 用 Write* writer 写到临时文件，再读回来给前端展示
        from whisper.utils import get_writer
        writer = get_writer(args.output_format, tempfile.gettempdir())
        tmp_out = tempfile.NamedTemporaryFile(
            "w", suffix="." + args.output_format, delete=False, encoding="utf-8"
        )
        tmp_out.close()
        writer(result, args.input, {
            "max_line_width": None,
            "max_line_count": None,
            "highlight_words": False,
        })
        with open(tmp_out.name, "r", encoding="utf-8") as f:
            text = f.read()
        try:
            os.unlink(tmp_out.name)
        except OSError:
            pass
        emit({"event": "result", "format": args.output_format, "text": text})


if __name__ == "__main__":
    main()
