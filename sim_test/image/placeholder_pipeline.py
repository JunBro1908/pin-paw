#!/usr/bin/env python3
"""
이미지 파이프라인 골격: 디스케일 → 배경 제거(선택) → 객체 추출.
- 실제 API/모델 호출은 TODO. 객체 추출은 API 사용 또는 자체 YOLO 중 선택.
- 비용·파인튜닝 고려 시 YOLO, 빠른 실험 시 API 추천.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

# from PIL import Image  # 디스케일링 시 사용


def descale(image_path: Path, max_long_side: int = 512) -> dict[str, Any]:
    """
    이미지 디스케일링: 긴 변을 max_long_side 이하로 리사이즈, 비율 유지.
    Returns: 처리된 이미지 또는 경로 (구현에 따라 다름).
    """
    # TODO: PIL/numpy로 로드 후 리사이즈, 저장 또는 메모리 반환
    return {"path": str(image_path), "max_long_side": max_long_side, "done": False}


def remove_background(image_input: dict[str, Any]) -> dict[str, Any]:
    """
    배경 제거 (모델 비용 1회 추가).
    예: rembg, U²-Net 등 사용.
    """
    # TODO: rembg 또는 자체 모델 호출 → 전경 마스크/크롭 반환
    return {**image_input, "bg_removed": False}


def extract_objects(image_input: dict[str, Any], method: str = "api") -> list[dict[str, Any]]:
    """
    객체 추출.
    - method=="api": 상용 객체 감지/세그멘테이션 API 호출 (추천 for 빠른 실험).
    - method=="yolo": 자체 서버 YOLO 모델 호출 (비용 절감, 파인튜닝 가능).
    Returns: list of {bbox, label, confidence, ...} or embedding per bbox.
    """
    if method == "api":
        # TODO: e.g. OpenAI Vision / AWS Rekognition / GCP Vision 등 호출
        return []
    if method == "yolo":
        # TODO: YOLO 서버 엔드포인트 호출 또는 로컬 모델 추론
        return []
    return []


def run_pipeline(
    image_path: Path,
    max_long_side: int = 512,
    do_bg_removal: bool = False,
    extract_method: str = "api",
) -> list[dict[str, Any]]:
    """
    순서: 디스케일 → (선택) 배경 제거 → 객체 추출.
    """
    step = descale(image_path, max_long_side=max_long_side)
    if do_bg_removal:
        step = remove_background(step)
    objects = extract_objects(step, method=extract_method)
    return objects


def main() -> int:
    parser = argparse.ArgumentParser(description="Image pipeline placeholder")
    parser.add_argument("image", type=Path, help="Input image path")
    parser.add_argument("--max-long-side", type=int, default=512)
    parser.add_argument("--no-bg-removal", action="store_true", help="Skip background removal")
    parser.add_argument("--extract", choices=["api", "yolo"], default="api")
    args = parser.parse_args()

    result = run_pipeline(
        args.image,
        max_long_side=args.max_long_side,
        do_bg_removal=not args.no_bg_removal,
        extract_method=args.extract,
    )
    print("Objects (placeholder):", len(result))
    return 0


if __name__ == "__main__":
    exit(main())
