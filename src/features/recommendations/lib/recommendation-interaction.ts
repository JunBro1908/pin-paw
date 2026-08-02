export interface RecommendationRange {
  radiusKm: number;
  days: number;
}

export interface RecommendationRangeState {
  draft: RecommendationRange;
  applied: RecommendationRange;
}

export function createRangeState(
  initial: RecommendationRange
): RecommendationRangeState {
  return {
    draft: { ...initial },
    applied: { ...initial },
  };
}

export function updateDraftRange(
  state: RecommendationRangeState,
  update: Partial<RecommendationRange>
): RecommendationRangeState {
  return {
    ...state,
    draft: { ...state.draft, ...update },
  };
}

export function applyDraftRange(
  state: RecommendationRangeState
): RecommendationRangeState {
  if (
    state.draft.radiusKm === state.applied.radiusKm &&
    state.draft.days === state.applied.days
  ) {
    return state;
  }
  return {
    draft: state.draft,
    applied: { ...state.draft },
  };
}

interface RecommendationRequestOwner {
  key: string;
  generation: number;
}

export function createRecommendationRequestGuard() {
  let generation = 0;
  let currentKey: string | null = null;

  return {
    begin(key: string): RecommendationRequestOwner {
      generation += 1;
      currentKey = key;
      return { key, generation };
    },
    invalidate(): void {
      generation += 1;
      currentKey = null;
    },
    isCurrent(owner: RecommendationRequestOwner): boolean {
      return owner.generation === generation && owner.key === currentKey;
    },
  };
}
