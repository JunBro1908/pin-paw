import type {
  NaverMapClickEvent,
  NaverMapEventListener,
  NaverMapInstance,
  NaverMapsApi,
  NaverMarkerInstance,
  NaverPolylineInstance,
} from "../types/naver";

export interface Disposable {
  dispose(): void;
}

export interface NaverMapAdapter {
  createMap(
    element: HTMLElement,
    options: Record<string, unknown>
  ): NaverMapInstance;
  createMarker(options: Record<string, unknown>): NaverMarkerInstance;
  createPolyline(options: Record<string, unknown>): NaverPolylineInstance;
  listen(
    target: object,
    eventName: string,
    handler: (event: NaverMapClickEvent) => void
  ): Disposable;
  replaceMarkers(markers: NaverMarkerInstance[], group?: string): void;
  replacePolylines(polylines: NaverPolylineInstance[], group?: string): void;
  dispose(): void;
}

type AdapterApi = Pick<NaverMapsApi, "Map" | "Marker" | "Polyline" | "Event">;

function createDisposable(disposeResource: () => void): Disposable {
  let disposed = false;

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeResource();
    },
  };
}

export function createNaverMapAdapter(api: AdapterApi): NaverMapAdapter {
  let map: NaverMapInstance | null = null;
  const markerGroups = new Map<string, Set<NaverMarkerInstance>>();
  const polylineGroups = new Map<string, Set<NaverPolylineInstance>>();
  const listeners = new Set<Disposable>();
  const listenersByTarget = new Map<object, Set<Disposable>>();
  let disposed = false;

  const disposeTargetListeners = (target: object) => {
    [...(listenersByTarget.get(target) ?? [])].forEach((listener) =>
      listener.dispose()
    );
  };

  const replaceGroup = <
    T extends { setMap(map: NaverMapInstance | null): void },
  >(
    groups: Map<string, Set<T>>,
    group: string,
    next: T[]
  ) => {
    const current = groups.get(group) ?? new Set<T>();
    const nextSet = new Set(next);
    if (nextSet.size === 0) groups.delete(group);
    else groups.set(group, nextSet);

    current.forEach((overlay) => {
      const ownedByAnotherGroup = [...groups.values()].some((overlays) =>
        overlays.has(overlay)
      );
      if (!nextSet.has(overlay) && !ownedByAnotherGroup) {
        disposeTargetListeners(overlay);
        overlay.setMap(null);
      }
    });
  };

  return {
    createMap(element, options) {
      if (disposed) throw new Error("Naver map adapter is disposed");
      if (map) throw new Error("Naver map adapter already owns a map");
      map = new api.Map(element, options);
      return map;
    },
    createMarker(options) {
      if (disposed) throw new Error("Naver map adapter is disposed");
      return new api.Marker(options);
    },
    createPolyline(options) {
      if (disposed) throw new Error("Naver map adapter is disposed");
      return new api.Polyline(options);
    },
    listen(target, eventName, handler) {
      if (disposed) throw new Error("Naver map adapter is disposed");
      const listener: NaverMapEventListener = api.Event.addListener(
        target,
        eventName,
        handler
      );
      const disposable = createDisposable(() => {
        api.Event.removeListener(listener);
        listeners.delete(disposable);
        const targetListeners = listenersByTarget.get(target);
        targetListeners?.delete(disposable);
        if (targetListeners?.size === 0) listenersByTarget.delete(target);
      });
      listeners.add(disposable);
      const targetListeners =
        listenersByTarget.get(target) ?? new Set<Disposable>();
      targetListeners.add(disposable);
      listenersByTarget.set(target, targetListeners);
      return disposable;
    },
    replaceMarkers(nextMarkers, group = "default") {
      replaceGroup(markerGroups, group, nextMarkers);
    },
    replacePolylines(nextPolylines, group = "default") {
      replaceGroup(polylineGroups, group, nextPolylines);
    },
    dispose() {
      if (disposed) return;
      disposed = true;

      [...listeners].forEach((listener) => listener.dispose());
      const markers = new Set(
        [...markerGroups.values()].flatMap((group) => [...group])
      );
      const polylines = new Set(
        [...polylineGroups.values()].flatMap((group) => [...group])
      );
      markers.forEach((marker) => marker.setMap(null));
      polylines.forEach((polyline) => polyline.setMap(null));
      markerGroups.clear();
      polylineGroups.clear();
      map?.destroy();
      map = null;
    },
  };
}
