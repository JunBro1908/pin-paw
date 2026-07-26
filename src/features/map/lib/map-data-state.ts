import type { BookmarkPath, SightingFeedbackMap } from "./map-domain";
import type { MapItem } from "../types/naver";

function normalizeFeedbackId(id: string): string {
  return String(id).toLowerCase().trim();
}

export interface LostPostMapItem {
  id: string;
  pet_name?: string;
  lost_at?: string;
  cover_photo_key?: string;
  trait_color?: string;
  trait_size?: string;
  trait_species?: string;
  note?: string;
  lat: number;
  lng: number;
}

export interface MapDataState {
  principalKey: string | null;
  ownerKey: string | null;
  loading: boolean;
  rawItems: MapItem[];
  items: MapItem[];
  feedback: SightingFeedbackMap;
  lostPosts: LostPostMapItem[];
  paths: BookmarkPath[];
  error: string | null;
}

export type MapDataAction =
  | { type: "reset" }
  | { type: "begin"; principalKey: string; ownerKey: string }
  | {
      type: "resolve-clusters";
      ownerKey: string;
      rawItems: MapItem[];
      items: MapItem[];
      feedback: SightingFeedbackMap;
    }
  | {
      type: "resolve-bookmark";
      ownerKey: string;
      lostPosts: LostPostMapItem[];
      paths: BookmarkPath[];
    }
  | {
      type: "patch-feedback";
      sightingId: string;
      claimed?: boolean;
      seen?: boolean;
    }
  | { type: "fail"; ownerKey: string; error: string };

export function createInitialMapDataState(): MapDataState {
  return {
    principalKey: null,
    ownerKey: null,
    loading: false,
    rawItems: [],
    items: [],
    feedback: {},
    lostPosts: [],
    paths: [],
    error: null,
  };
}

export function getMapDataView(
  principalKey: string,
  state: MapDataState
): MapDataState {
  if (state.principalKey === null || state.principalKey === principalKey) {
    return state;
  }

  return {
    ...createInitialMapDataState(),
    principalKey,
  };
}

export function mapDataReducer(
  state: MapDataState,
  action: MapDataAction
): MapDataState {
  if (action.type === "reset") return createInitialMapDataState();

  if (action.type === "begin") {
    return {
      ...state,
      principalKey: action.principalKey,
      ownerKey: action.ownerKey,
      loading: true,
      error: null,
    };
  }

  if (action.type === "patch-feedback") {
    const id = normalizeFeedbackId(action.sightingId);
    const previous = state.feedback[id] ?? { seen: false, claimed: false };
    return {
      ...state,
      feedback: {
        ...state.feedback,
        [id]: {
          seen: action.seen ?? previous.seen,
          claimed: action.claimed ?? previous.claimed,
        },
      },
    };
  }

  if (state.ownerKey !== action.ownerKey) return state;

  switch (action.type) {
    case "resolve-clusters":
      return {
        ...state,
        loading: false,
        rawItems: action.rawItems,
        items: action.items,
        feedback: action.feedback,
        error: null,
      };
    case "resolve-bookmark": {
      const feedback = Object.fromEntries(
        Object.entries(state.feedback).map(([id, value]) => [
          id,
          { ...value, claimed: false },
        ])
      ) as SightingFeedbackMap;
      action.paths.forEach((path) => {
        path.points.forEach((point) => {
          const id = normalizeFeedbackId(point.sighting_id);
          feedback[id] = {
            seen: feedback[id]?.seen ?? false,
            claimed: true,
          };
        });
      });
      return {
        ...state,
        loading: false,
        lostPosts: action.lostPosts,
        paths: action.paths,
        feedback,
        error: null,
      };
    }
    case "fail":
      return {
        ...state,
        loading: false,
        error: action.error,
      };
  }
}
