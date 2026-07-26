#!/usr/bin/env python3
"""
Insight1 색상 임베딩 시각화 (PCA / t-SNE).
- 프롬프트 문장(insight1) + 색만(insight1_color_only) 둘 다 지원.
- 흰색 기준 tier 0/1/2/3로 구분, cut-off 검토용.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

OUT_DIR = Path(__file__).resolve().parent / "out"
DATA_DIR = Path(__file__).resolve().parent / "data"
TIER_LABELS = {0: "0_기준(흰색)", 1: "1_흰색과 같은 것", 2: "2_애매", 3: "3_흰색과 다른 것"}


def _setup_korean_font() -> None:
    """한글 표시를 위해 사용 가능한 폰트로 rc 설정."""
    import matplotlib
    import matplotlib.font_manager as fm

    # macOS / Windows / Linux에서 자주 쓰이는 한글 폰트 후보
    candidates = [
        "AppleGothic",
        "Apple SD Gothic Neo",
        "Malgun Gothic",
        "NanumGothic",
        "Nanum Barun Gothic",
        "Noto Sans CJK KR",
        "Noto Sans KR",
    ]
    available = {f.name for f in fm.fontManager.ttflist}
    for name in candidates:
        if name in available:
            matplotlib.rcParams["font.family"] = name
            break
    matplotlib.rcParams["axes.unicode_minus"] = False


def run_pca_tsne(emb_path: Path, csv_path: Path, label: str, out_prefix: str) -> bool:
    """한 임베딩 세트에 대해 PCA·t-SNE 실행. 성공 시 True."""
    if not emb_path.exists():
        print(f"Skip {out_prefix}: {emb_path.name} not found. Run fetch_embeddings.py first.", file=sys.stderr)
        return False
    try:
        from sklearn.decomposition import PCA
        from sklearn.manifold import TSNE
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as e:
        print("Install: scikit-learn, matplotlib", file=sys.stderr)
        raise SystemExit(1) from e

    _setup_korean_font()

    with open(emb_path, encoding="utf-8") as f:
        data = json.load(f)
    df_meta = pd.read_csv(csv_path)
    df_meta["id_str"] = df_meta["id"].astype(str)
    by_id = data["by_id"]

    ids = [str(i) for i in df_meta["id"] if str(i) in by_id]
    X = np.array([by_id[i] for i in ids], dtype=float)
    tiers = df_meta.set_index("id_str").loc[ids]["tier"].astype(int).tolist()

    # PCA 2D
    pca = PCA(n_components=2, random_state=42)
    Xpca = pca.fit_transform(X)
    plt.figure(figsize=(10, 6))
    for tier_val in [0, 1, 2, 3]:
        mask = [t == tier_val for t in tiers]
        if not any(mask):
            continue
        plt.scatter(
            [Xpca[i][0] for i in range(len(ids)) if mask[i]],
            [Xpca[i][1] for i in range(len(ids)) if mask[i]],
            label=TIER_LABELS.get(tier_val, str(tier_val)),
            alpha=0.7,
        )
    plt.legend()
    plt.title(f"Insight1 {label} (PCA, 흰색 기준)")
    plt.savefig(OUT_DIR / f"{out_prefix}_pca.png", dpi=120)
    plt.close()
    print(f"Saved {OUT_DIR / f'{out_prefix}_pca.png'}")

    # t-SNE 2D
    perplexity = min(30, len(ids) - 1)
    tsne = TSNE(n_components=2, random_state=42, perplexity=perplexity)
    Xtsne = tsne.fit_transform(X)
    plt.figure(figsize=(10, 6))
    for tier_val in [0, 1, 2, 3]:
        mask = [t == tier_val for t in tiers]
        if not any(mask):
            continue
        plt.scatter(
            [Xtsne[i][0] for i in range(len(ids)) if mask[i]],
            [Xtsne[i][1] for i in range(len(ids)) if mask[i]],
            label=TIER_LABELS.get(tier_val, str(tier_val)),
            alpha=0.7,
        )
    plt.legend()
    plt.title(f"Insight1 {label} (t-SNE, 흰색 기준)")
    plt.savefig(OUT_DIR / f"{out_prefix}_tsne.png", dpi=120)
    plt.close()
    print(f"Saved {OUT_DIR / f'{out_prefix}_tsne.png'}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Insight1 PCA / t-SNE (프롬프트 문장 또는 색만)")
    parser.add_argument("--insight", choices=["1", "1_color_only", "all"], default="all")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ran = False
    if args.insight in ("1", "all"):
        ran |= run_pca_tsne(
            OUT_DIR / "insight1_embeddings.json",
            DATA_DIR / "insight1_color_cutoff.csv",
            "프롬프트 문장",
            "insight1",
        )
    if args.insight in ("1_color_only", "all"):
        ran |= run_pca_tsne(
            OUT_DIR / "insight1_color_only_embeddings.json",
            DATA_DIR / "insight1_color_only.csv",
            "색만",
            "insight1_color_only",
        )
    if not ran:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
