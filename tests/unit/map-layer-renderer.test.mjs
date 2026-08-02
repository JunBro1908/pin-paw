import assert from "node:assert/strict";
import test from "node:test";

let createMapLayerRenderer;

try {
  ({ createMapLayerRenderer } =
    await import("../../src/features/map/lib/map-layer-renderer.ts"));
} catch {
  // RED: path animation ownership still lives in NaverMap.
}

function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const frames = new Map();
  const delays = new Map();
  const cancelledFrames = [];
  const clearedDelays = [];

  return {
    scheduler: {
      now: () => now,
      requestFrame(callback) {
        const id = nextId++;
        frames.set(id, callback);
        return id;
      },
      cancelFrame(id) {
        cancelledFrames.push(id);
        frames.delete(id);
      },
      setDelay(callback, milliseconds) {
        const id = nextId++;
        delays.set(id, { callback, milliseconds });
        return id;
      },
      clearDelay(id) {
        clearedDelays.push(id);
        delays.delete(id);
      },
    },
    runNextFrame(at) {
      now = at;
      const [id, callback] = frames.entries().next().value ?? [];
      if (id === undefined) return;
      frames.delete(id);
      callback();
    },
    frames,
    delays,
    cancelledFrames,
    clearedDelays,
  };
}

function createFakeAdapter() {
  const groups = new Map();
  const markerGroups = new Map();
  const polylines = [];
  const markers = [];
  const listeners = [];

  return {
    groups,
    markerGroups,
    markers,
    listeners,
    polylines,
    adapter: {
      createMarker(options) {
        const marker = {
          options,
          getPosition: () => options.position,
          setMap() {},
        };
        markers.push(marker);
        return marker;
      },
      createPolyline(options) {
        const polyline = {
          options,
          paths: [options.path],
          setMap() {},
          setPath(path) {
            this.paths.push(path);
          },
        };
        polylines.push(polyline);
        return polyline;
      },
      replacePolylines(next, group = "default") {
        groups.set(group, [...next]);
      },
      replaceMarkers(next, group = "default") {
        markerGroups.set(group, [...next]);
      },
      listen(target, eventName, handler) {
        listeners.push({ target, eventName, handler });
        return { dispose() {} };
      },
    },
  };
}

const path = {
  lost_post_id: "lost-1",
  lost_lat: 0,
  lost_lng: 0,
  lost_at: "2026-07-25T00:00:00.000Z",
  points: [
    {
      sighting_id: "sighting-1",
      source_type: "shelter",
      lat: 0,
      lng: 4,
      occurred_at: "2026-07-25T01:00:00.000Z",
    },
  ],
};

function getPathCoordinates(value) {
  return [
    { lat: value.lost_lat, lng: value.lost_lng },
    ...value.points.map(({ lat, lng }) => ({ lat, lng })),
  ];
}

function interpolatePath(coordinates, progress) {
  if (progress >= 1) return coordinates;
  const [start, end] = coordinates;
  return [
    start,
    {
      lat: start.lat + (end.lat - start.lat) * progress,
      lng: start.lng + (end.lng - start.lng) * progress,
    },
  ];
}

test("animates a path for 1800ms and schedules a 1000ms replay pause", () => {
  const clock = createFakeScheduler();
  const fake = createFakeAdapter();
  const renderer = createMapLayerRenderer({
    adapter: fake.adapter,
    scheduler: clock.scheduler,
    toLatLng: (coordinate) => coordinate,
    toPoint: (x, y) => ({ x, y }),
    normalizeId: (id) => id.toLowerCase().trim(),
    getPathCoordinates,
    interpolatePath,
  });

  renderer.renderPaths({ map: {}, paths: [path], enabled: true });

  assert.equal(fake.groups.get("paths")?.length, 1);
  assert.equal(fake.groups.get("path-animation")?.length, 1);
  assert.equal(clock.frames.size, 1);

  clock.runNextFrame(900);
  assert.deepEqual(fake.polylines[1].paths.at(-1), [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 2 },
  ]);

  clock.runNextFrame(1800);
  assert.equal(clock.delays.size, 1);
  assert.equal([...clock.delays.values()][0].milliseconds, 1000);
});

test("clears old frames, delays, and both polyline groups idempotently", () => {
  const clock = createFakeScheduler();
  const fake = createFakeAdapter();
  const renderer = createMapLayerRenderer({
    adapter: fake.adapter,
    scheduler: clock.scheduler,
    toLatLng: (coordinate) => coordinate,
    toPoint: (x, y) => ({ x, y }),
    normalizeId: (id) => id.toLowerCase().trim(),
    getPathCoordinates,
    interpolatePath,
  });

  renderer.renderPaths({ map: {}, paths: [path], enabled: true });
  clock.runNextFrame(1800);
  const delayId = [...clock.delays.keys()][0];

  renderer.clearPaths();
  renderer.clearPaths();
  renderer.dispose();

  assert.deepEqual(fake.groups.get("paths"), []);
  assert.deepEqual(fake.groups.get("path-animation"), []);
  assert.equal(clock.clearedDelays.filter((id) => id === delayId).length, 1);
  assert.equal(clock.frames.size, 0);
  assert.equal(clock.delays.size, 0);
});

test("does not allocate animation resources for disabled or short paths", () => {
  const clock = createFakeScheduler();
  const fake = createFakeAdapter();
  const renderer = createMapLayerRenderer({
    adapter: fake.adapter,
    scheduler: clock.scheduler,
    toLatLng: (coordinate) => coordinate,
    toPoint: (x, y) => ({ x, y }),
    normalizeId: (id) => id.toLowerCase().trim(),
    getPathCoordinates,
    interpolatePath,
  });

  renderer.renderPaths({ map: {}, paths: [path], enabled: false });
  renderer.renderPaths({
    map: {},
    paths: [{ ...path, points: [] }],
    enabled: true,
  });

  assert.equal(fake.polylines.length, 0);
  assert.equal(clock.frames.size, 0);
});

test("keeps source identity outside feedback state and exposes accessible marker labels", () => {
  const clock = createFakeScheduler();
  const fake = createFakeAdapter();
  const clicked = [];
  const renderer = createMapLayerRenderer({
    adapter: fake.adapter,
    scheduler: clock.scheduler,
    toLatLng: (coordinate) => coordinate,
    toPoint: (x, y) => ({ x, y }),
    normalizeId: (id) => id.toLowerCase().trim(),
    getPathCoordinates,
    interpolatePath,
  });
  const cluster = {
    type: "cluster",
    source_type: "shelter",
    id: "grid",
    lat: 37.5,
    lng: 127,
    count: 3,
  };
  const sighting = {
    type: "point",
    source_type: "sighting",
    id: "sighting-1",
    lat: 37.6,
    lng: 127.1,
    note: "제보",
    photo_keys: ["photo.jpg"],
  };
  const shelter = {
    type: "point",
    source_type: "shelter",
    id: "shelter-1",
    lat: 37.7,
    lng: 127.2,
    note: "보호소 입소",
  };

  renderer.renderSightings({
    map: {},
    items: [cluster, sighting, shelter],
    feedback: {
      "sighting-1": { seen: false, claimed: true },
      "shelter-1": { seen: true, claimed: false },
    },
    getImageUrl: (key) => `https://images.test/${key}`,
    onItemClick: (item) => clicked.push(item.id),
  });

  assert.equal(fake.markerGroups.get("sightings").length, 3);
  assert.match(
    fake.markers[0].options.icon.content,
    /role="img" aria-label="보호소 묶음"/
  );
  assert.match(fake.markers[0].options.icon.content, /#28736F/);
  assert.match(fake.markers[0].options.icon.content, />3</);
  assert.match(
    fake.markers[1].options.icon.content,
    /role="img" aria-label="목격"/
  );
  assert.match(
    fake.markers[1].options.icon.content,
    /border: 2\.5px solid #EAB308/
  );
  assert.doesNotMatch(
    fake.markers[1].options.icon.content,
    /#22c55e|#ef4444|#dc2626|#087A3E/i
  );
  assert.match(
    fake.markers[1].options.icon.content,
    /border-radius: 50% 50% 50% 0/
  );
  assert.match(
    fake.markers[1].options.icon.content,
    /https:\/\/images\.test\/photo\.jpg/
  );
  assert.deepEqual(fake.markers[1].options.icon.anchor, { x: 22, y: 50 });
  assert.match(
    fake.markers[2].options.icon.content,
    /role="img" aria-label="보호소"/
  );
  assert.match(
    fake.markers[2].options.icon.content,
    /border: 2\.5px solid #9CA3AF/
  );
  assert.match(fake.markers[2].options.icon.content, /border-radius: 12px/);
  assert.deepEqual(fake.markers[2].options.icon.anchor, { x: 22, y: 44 });
  assert.doesNotMatch(
    fake.markers[2].options.icon.content,
    /box-shadow: inset|#22c55e/i
  );

  fake.listeners[0].handler();
  fake.listeners[1].handler();
  fake.listeners[2].handler();

  assert.deepEqual(clicked, ["grid", "sighting-1", "shelter-1"]);
});

test("renders bookmark sightings and lost posts in independent groups", () => {
  const clock = createFakeScheduler();
  const fake = createFakeAdapter();
  const renderer = createMapLayerRenderer({
    adapter: fake.adapter,
    scheduler: clock.scheduler,
    toLatLng: (coordinate) => coordinate,
    toPoint: (x, y) => ({ x, y }),
    normalizeId: (id) => id.toLowerCase().trim(),
    getPathCoordinates,
    interpolatePath,
  });

  renderer.renderBookmarkSightings({
    map: {},
    paths: [path],
    getImageUrl: () => "",
    onSightingClick: () => {},
  });
  renderer.renderLostPosts({
    map: {},
    lostPosts: [
      {
        id: "lost-1",
        pet_name: "몽이",
        lat: 37.5,
        lng: 127,
        cover_photo_key: "lost.jpg",
      },
    ],
    getImageUrl: (key) => `https://lost.test/${key}`,
    onLostPostClick: () => {},
  });

  assert.equal(fake.markerGroups.get("sightings").length, 1);
  assert.equal(fake.markerGroups.get("lost-posts").length, 1);
  assert.match(
    fake.markers[0].options.icon.content,
    /border: 2\.5px solid #EAB308/
  );
  assert.doesNotMatch(
    fake.markers[0].options.icon.content,
    /box-shadow: inset|#22c55e/i
  );
  assert.deepEqual(fake.markers[0].options.icon.anchor, { x: 22, y: 44 });
  assert.match(fake.markers[1].options.icon.content, /#B85C1B/);
  assert.deepEqual(fake.markers[1].options.icon.anchor, { x: 22, y: 44 });
});
