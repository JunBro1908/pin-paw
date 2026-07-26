import assert from "node:assert/strict";
import test from "node:test";

let createNaverMapAdapter;

try {
  ({ createNaverMapAdapter } =
    await import("../../src/features/map/lib/naver-map-adapter.ts"));
} catch {
  // RED: SDK resource ownership has not been extracted yet.
}

function createFakeApi() {
  const calls = {
    destroyedMaps: 0,
    removedListeners: [],
    detachedMarkers: 0,
    detachedPolylines: 0,
  };
  let listenerId = 0;

  class FakeMap {
    destroy() {
      calls.destroyedMaps += 1;
    }
  }

  class FakeMarker {
    setMap(map) {
      if (map === null) calls.detachedMarkers += 1;
    }
  }

  class FakePolyline {
    setMap(map) {
      if (map === null) calls.detachedPolylines += 1;
    }
  }

  return {
    calls,
    api: {
      Map: FakeMap,
      Marker: FakeMarker,
      Polyline: FakePolyline,
      Event: {
        addListener(target, eventName, handler) {
          return { target, eventName, handler, id: (listenerId += 1) };
        },
        removeListener(listener) {
          calls.removedListeners.push(listener.id);
        },
      },
    },
  };
}

test("disposes every SDK resource exactly once", () => {
  const { api, calls } = createFakeApi();
  const adapter = createNaverMapAdapter?.(api);
  const map = adapter?.createMap({}, { zoom: 13 });
  const marker = adapter?.createMarker({ map });
  const polyline = adapter?.createPolyline({ map });

  adapter?.listen(map, "idle", () => {});
  adapter?.listen(marker, "click", () => {});
  adapter?.replaceMarkers([marker]);
  adapter?.replacePolylines([polyline]);
  adapter?.dispose();
  adapter?.dispose();

  assert.equal(calls.destroyedMaps, 1);
  assert.deepEqual(calls.removedListeners, [1, 2]);
  assert.equal(calls.detachedMarkers, 1);
  assert.equal(calls.detachedPolylines, 1);
});

test("replacement detaches only resources that are no longer owned", () => {
  const { api, calls } = createFakeApi();
  const adapter = createNaverMapAdapter?.(api);
  const first = adapter?.createMarker({});
  const retained = adapter?.createMarker({});
  const next = adapter?.createMarker({});
  adapter?.listen(first, "click", () => {});
  adapter?.listen(retained, "click", () => {});

  adapter?.replaceMarkers([first, retained]);
  adapter?.replaceMarkers([retained, next]);
  adapter?.replaceMarkers([retained, next]);

  assert.equal(calls.detachedMarkers, 1);
  assert.deepEqual(calls.removedListeners, [1]);

  adapter?.dispose();

  assert.equal(calls.detachedMarkers, 3);
  assert.deepEqual(calls.removedListeners, [1, 2]);
});

test("an individually disposed listener is not removed again", () => {
  const { api, calls } = createFakeApi();
  const adapter = createNaverMapAdapter?.(api);
  const map = adapter?.createMap({}, {});
  const listener = adapter?.listen(map, "click", () => {});

  listener?.dispose();
  listener?.dispose();
  adapter?.dispose();

  assert.deepEqual(calls.removedListeners, [1]);
});

test("keeps independent overlay groups from clearing each other", () => {
  const { api, calls } = createFakeApi();
  const adapter = createNaverMapAdapter?.(api);
  const sighting = adapter?.createMarker({});
  const lostPost = adapter?.createMarker({});

  adapter?.replaceMarkers([sighting], "sightings");
  adapter?.replaceMarkers([lostPost], "lost-posts");
  adapter?.replaceMarkers([], "sightings");

  assert.equal(calls.detachedMarkers, 1);

  adapter?.dispose();

  assert.equal(calls.detachedMarkers, 2);
});
