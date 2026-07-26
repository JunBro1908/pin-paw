#!/usr/bin/env python3
"""
OpenAI Embedding API 호출 및 캐시 저장.
- 시나리오(insight1/2/3)별 CSV에서 임베딩할 텍스트 수집 → API 호출 → out/ 에 저장.
- 이미 캐시된 텍스트는 재요청하지 않음.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI
from tqdm import tqdm

load_dotenv()

MODEL = "text-embedding-3-small"
DIMENSIONS = 1536
OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_DIR = Path(__file__).resolve().parent / "data"


def get_texts_insight1() -> list[tuple[str, str]]:
    """(id, text_sentence) 리스트 — 프롬프트 문장 전체."""
    path = DATA_DIR / "insight1_color_cutoff.csv"
    df = pd.read_csv(path)
    return list(zip(df["id"].astype(str), df["text_sentence"].astype(str)))


def get_texts_insight1_color_only() -> list[tuple[str, str]]:
    """(id, text_color_only) 리스트 — 색상 값만 (프롬프트 문구 제외)."""
    path = DATA_DIR / "insight1_color_only.csv"
    df = pd.read_csv(path)
    return list(zip(df["id"].astype(str), df["text_color_only"].astype(str)))


def get_texts_insight2() -> list[tuple[str, str]]:
    """(id, text_to_embed) 리스트."""
    path = DATA_DIR / "insight2_special_traits.csv"
    df = pd.read_csv(path)
    return list(zip(df["id"].astype(str), df["text_to_embed"].astype(str)))


def get_texts_insight3() -> list[tuple[str, str]]:
    """(pair_id_text_a, text_a), (pair_id_text_b, text_b) 형태로 text_a, text_b 수집."""
    path = DATA_DIR / "insight3_normalization.csv"
    df = pd.read_csv(path)
    out = []
    for _, row in df.iterrows():
        pid = str(row["pair_id"])
        out.append((f"{pid}_a", str(row["text_a"])))
        out.append((f"{pid}_b", str(row["text_b"])))
    return out


def collect_unique_texts(items: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """텍스트 기준 중복 제거 (첫 id 유지)."""
    seen = set()
    unique = []
    for id_, text in items:
        if text not in seen:
            seen.add(text)
            unique.append((id_, text))
    return unique


def load_cache(cache_path: Path) -> dict[str, list[float]]:
    if not cache_path.exists():
        return {}
    with open(cache_path, encoding="utf-8") as f:
        return json.load(f)


def save_cache(cache_path: Path, data: dict[str, list[float]]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)


def fetch_embeddings(client: OpenAI, texts: list[str], batch_size: int = 50) -> list[list[float]]:
    """텍스트 리스트 일괄 임베딩 (OpenAI 배치)."""
    results = []
    for i in tqdm(range(0, len(texts), batch_size), desc="Embedding"):
        batch = texts[i : i + batch_size]
        resp = client.embeddings.create(
            model=MODEL,
            input=batch,
            dimensions=DIMENSIONS,
        )
        for d in resp.data:
            results.append(d.embedding)
    return results


def run_insight(insight: str, client: OpenAI, cache_path: Path) -> None:
    if insight == "1":
        items = get_texts_insight1()
    elif insight == "1_color_only":
        items = get_texts_insight1_color_only()
    elif insight == "2":
        items = get_texts_insight2()
    elif insight == "3":
        items = get_texts_insight3()
    else:
        raise ValueError(f"Unknown insight: {insight}")

    unique = collect_unique_texts(items)
    cache = load_cache(cache_path)
    to_fetch = [(id_, t) for id_, t in unique if t not in cache]
    if to_fetch:
        texts = [t for _, t in to_fetch]
        vectors = fetch_embeddings(client, texts)
        for (id_, t), vec in zip(to_fetch, vectors):
            cache[t] = vec
        save_cache(cache_path, cache)
    else:
        print("All texts already cached.")

    # id -> vector 매핑으로 저장 (원본 CSV id / pair_id_a 등)
    id_to_vec = {id_: cache[t] for id_, t in items if t in cache}
    out_name = f"insight{insight}_embeddings.json" if insight != "1_color_only" else "insight1_color_only_embeddings.json"
    out_path = OUT_DIR / out_name
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"by_id": id_to_vec, "by_text": cache}, f, ensure_ascii=False, indent=0)
    print(f"Saved {out_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch OpenAI embeddings for sim_test scenarios")
    parser.add_argument("--insight", choices=["1", "1_color_only", "2", "3", "all"], default="all")
    parser.add_argument("--cache-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Set OPENAI_API_KEY in env or .env", file=sys.stderr)
        return 1

    client = OpenAI(api_key=api_key)
    insights = ["1", "1_color_only", "2", "3"] if args.insight == "all" else [args.insight]
    for i in insights:
        cache_name = f"embed_cache_insight{i}.json" if i != "1_color_only" else "embed_cache_insight1_color_only.json"
        cache_path = args.cache_dir / cache_name
        run_insight(i, client, cache_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
