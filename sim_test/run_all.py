#!/usr/bin/env python3
"""임베딩 수집 → 유사도 계산까지 한 번에 실행."""
import subprocess
import sys
from pathlib import Path

def main() -> int:
    root = Path(__file__).resolve().parent
    for step, cmd in [
        ("Fetch embeddings", [sys.executable, str(root / "fetch_embeddings.py"), "--insight", "all"]),
        ("Compute similarity", [sys.executable, str(root / "compute_similarity.py"), "--insight", "all"]),
        ("Visualize PCA/t-SNE", [sys.executable, str(root / "visualize_embeddings.py"), "--insight", "all"]),
    ]:
        print(f"--- {step} ---")
        r = subprocess.run(cmd, cwd=root)
        if r.returncode != 0:
            return r.returncode
    print("Done. Check out/ for results.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
