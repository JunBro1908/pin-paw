#!/usr/bin/env python3
"""
캐시된 임베딩으로 유사도 계산 및 인사이트별 결과 출력.
- Insight1: 색상 쌍 유사도 매트릭스, expected_tier별 통계 → cut-off 검토용
- Insight2: meaning_group 내 free_text vs tag_sentence 유사도
- Insight3: 쌍별 유사도, 실제 min/max, 0~100 정규화 값
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_DIR = Path(__file__).resolve().parent / "data"


def cosine_similarity(a: list[float], b: list[float]) -> float:
    import math
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _run_insight1_style(df: pd.DataFrame, emb_path: Path, out_csv_name: str, label: str, text_col: str) -> None:
    """Insight1: 흰색(tier=0) 기준, 각 케이스(tier 1/2/3)의 similarity_to_white 계산 → tier별 평균."""
    if not emb_path.exists():
        print(f"Run fetch_embeddings.py first for {emb_path.name}.", file=sys.stderr)
        return
    with open(emb_path, encoding="utf-8") as f:
        data = json.load(f)
    by_id = data["by_id"]

    ref_id = "0"
    if ref_id not in by_id:
        print("Reference (id=0, 흰색) embedding missing.", file=sys.stderr)
        return
    ref_vec = by_id[ref_id]

    cases = df[df["tier"].isin([1, 2, 3])].copy()
    rows = []
    for _, row in cases.iterrows():
        cid = str(row["id"])
        if cid not in by_id:
            continue
        sim = cosine_similarity(by_id[cid], ref_vec)
        rows.append({
            "id": row["id"],
            "tier": int(row["tier"]),
            "note": row["note"],
            "similarity_to_white": round(sim, 4),
        })

    stats_df = pd.DataFrame(rows)
    out_csv = OUT_DIR / out_csv_name
    stats_df.to_csv(out_csv, index=False, encoding="utf-8-sig")
    print(f"{label}: saved {out_csv}")

    # tier별 평균: 1=흰색과 같은 것, 2=애매, 3=흰색과 다른 것 → 기대: tier1 > tier2 > tier3
    tier_means = stats_df.groupby("tier")["similarity_to_white"].mean()
    tier_means.index = ["1_흰색과 같은 것", "2_애매", "3_흰색과 다른 것"]
    print("(흰색 기준) tier별 평균 similarity_to_white:")
    print(tier_means.to_string())


def run_insight1() -> None:
    df = pd.read_csv(DATA_DIR / "insight1_color_cutoff.csv")
    _run_insight1_style(df, OUT_DIR / "insight1_embeddings.json", "insight1_similarity_stats.csv", "Insight1 (프롬프트 문장)", "text_sentence")


def run_insight1_color_only() -> None:
    df = pd.read_csv(DATA_DIR / "insight1_color_only.csv")
    _run_insight1_style(df, OUT_DIR / "insight1_color_only_embeddings.json", "insight1_color_only_similarity_stats.csv", "Insight1 (색만)", "text_color_only")


def run_insight2() -> None:
    df = pd.read_csv(DATA_DIR / "insight2_special_traits.csv")
    path = OUT_DIR / "insight2_embeddings.json"
    if not path.exists():
        print("Run fetch_embeddings.py --insight 2 first.", file=sys.stderr)
        return
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    by_id = data["by_id"]

    # per meaning_group: free_text vs tag_sentence similarity
    groups = df.groupby("meaning_group")
    rows = []
    for name, g in groups:
        free_row = g[g["content_type"] == "free_text"].iloc[0]
        tag_row = g[g["content_type"] == "tag_sentence"].iloc[0]
        id_f = str(free_row["id"])
        id_t = str(tag_row["id"])
        if id_f in by_id and id_t in by_id:
            sim = cosine_similarity(by_id[id_f], by_id[id_t])
            rows.append({"meaning_group": name, "free_vs_tag_similarity": round(sim, 4)})
    out_df = pd.DataFrame(rows)
    out_csv = OUT_DIR / "insight2_free_vs_tag_similarity.csv"
    out_df.to_csv(out_csv, index=False, encoding="utf-8-sig")
    print(f"Insight2: saved {out_csv}")
    print(out_df.to_string())


def run_insight3() -> None:
    df = pd.read_csv(DATA_DIR / "insight3_normalization.csv")
    path = OUT_DIR / "insight3_embeddings.json"
    if not path.exists():
        print("Run fetch_embeddings.py --insight 3 first.", file=sys.stderr)
        return
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    by_id = data["by_id"]

    sims = []
    for _, row in df.iterrows():
        pid = str(row["pair_id"])
        id_a, id_b = f"{pid}_a", f"{pid}_b"
        if id_a not in by_id or id_b not in by_id:
            continue
        sim = cosine_similarity(by_id[id_a], by_id[id_b])
        sims.append(sim)

    actual_min, actual_max = min(sims), max(sims)
    results = []
    for i, row in df.iterrows():
        pid = str(row["pair_id"])
        id_a, id_b = f"{pid}_a", f"{pid}_b"
        if id_a not in by_id or id_b not in by_id:
            continue
        sim = cosine_similarity(by_id[id_a], by_id[id_b])
        norm_0_100 = (sim - actual_min) / (actual_max - actual_min) * 100.0 if actual_max > actual_min else 0.0
        results.append({
            "pair_id": row["pair_id"],
            "expected_rank": row["expected_rank"],
            "description": row["description"],
            "cosine_similarity": round(sim, 4),
            "normalized_0_100": round(norm_0_100, 2),
        })

    out_df = pd.DataFrame(results)
    out_csv = OUT_DIR / "insight3_pair_similarity_and_normalized.csv"
    out_df.to_csv(out_csv, index=False, encoding="utf-8-sig")
    print(f"Insight3: saved {out_csv}")
    print(f"Actual cosine range: min={actual_min:.4f}, max={actual_max:.4f}")
    print(out_df.to_string())


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute similarity from cached embeddings")
    parser.add_argument("--insight", choices=["1", "1_color_only", "2", "3", "all"], default="all")
    args = parser.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    insights = ["1", "1_color_only", "2", "3"] if args.insight == "all" else [args.insight]
    for i in insights:
        if i == "1":
            run_insight1()
        elif i == "1_color_only":
            run_insight1_color_only()
        elif i == "2":
            run_insight2()
        elif i == "3":
            run_insight3()
        else:
            run_insight3()
    return 0


if __name__ == "__main__":
    sys.exit(main())
