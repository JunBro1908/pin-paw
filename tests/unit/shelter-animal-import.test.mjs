import assert from "node:assert/strict";
import test from "node:test";

const {
  buildGeocodeQueries,
  buildShelterSightingNote,
  fetchAbandonmentPage,
  isShelterProcessActive,
  mapShelterTraits,
  parseHappenDate,
  parseNaverLocalCoordinates,
  parseWeightKg,
  pickFirstGeocodedPlace,
  runShelterAnimalImport,
  sizeFromWeightKg,
  speciesFromKindCd,
  ymdDaysAgo,
} = await import("../../src/shared/lib/shelter-animal-import.ts");

test("maps shelter traits from public-data fields", () => {
  const traits = mapShelterTraits({
    desertionNo: "1",
    happenDt: "20260720",
    happenPlace: "진접읍",
    kindCd: "[개] 믹스견",
    colorCd: "흰색",
    weight: "4.2(Kg)",
    specialMark: "목줄",
    processState: "보호중",
    careNm: "센터",
    careAddr: "경기도",
    orgNm: "남양주시",
    noticeNo: "n",
    popfile: "https://example.com/a.jpg",
    sexCd: "M",
    neuterYn: "U",
  });

  assert.equal(traits.traitSpecies, "믹스견");
  assert.equal(traits.traitSize, "small");
  assert.equal(traits.traitColor, "흰색");
});

test("geocode query prefers happenPlace then careAddr", () => {
  assert.deepEqual(
    buildGeocodeQueries({
      desertionNo: "1",
      happenDt: "20260720",
      happenPlace: "진접읍 내각1로",
      kindCd: "[개] 믹스견",
      colorCd: "흰",
      weight: "6",
      specialMark: "",
      processState: "보호중",
      careNm: "센터",
      careAddr: "경기도 남양주시 경강로",
      orgNm: "경기도 남양주시",
      noticeNo: "",
      popfile: "",
      sexCd: "",
      neuterYn: "",
    }),
    [
      { query: "경기도 남양주시 진접읍 내각1로", source: "happen_place" },
      { query: "경기도 남양주시 경강로", source: "care_addr" },
    ]
  );
});

test("process state archive heuristic", () => {
  assert.equal(isShelterProcessActive("보호중"), true);
  assert.equal(isShelterProcessActive("공고중"), true);
  assert.equal(isShelterProcessActive("종료(입양)"), false);
});

test("parses happen date and weight helpers", () => {
  assert.equal(
    parseHappenDate("20260720")?.toISOString().startsWith("2026-07-20"),
    true
  );
  assert.equal(parseHappenDate("20261399"), null);
  assert.equal(parseWeightKg("12(Kg)"), 12);
  assert.equal(sizeFromWeightKg(12), "medium");
  assert.equal(speciesFromKindCd("[개] 진도견"), "진도견");
  assert.equal(ymdDaysAgo(0, new Date("2026-07-26T12:00:00Z")), "20260726");
});

test("note includes public-data attribution", () => {
  const note = buildShelterSightingNote({
    desertionNo: "469569202200521",
    happenDt: "20260720",
    happenPlace: "조치원",
    kindCd: "[개] 믹스견",
    colorCd: "흰",
    weight: "4",
    specialMark: "순함",
    processState: "보호중",
    careNm: "세종센터",
    careAddr: "세종",
    orgNm: "세종",
    noticeNo: "세종-1",
    popfile: "",
    sexCd: "F",
    neuterYn: "U",
  });
  assert.match(note, /공공데이터/);
  assert.match(note, /469569202200521/);
  assert.match(note, /국가동물보호정보시스템/);
});

test("parses Naver local WGS84 microdegree coordinates", () => {
  assert.deepEqual(parseNaverLocalCoordinates(1269873882, 375666103), {
    lng: 126.9873882,
    lat: 37.5666103,
  });
  assert.equal(parseNaverLocalCoordinates(309947, 552092), null);
  assert.deepEqual(
    pickFirstGeocodedPlace([
      {
        title: "시청",
        address: "서울",
        roadAddress: "",
        mapx: 1269873882,
        mapy: 375666103,
      },
    ]),
    {
      lat: 37.5666103,
      lng: 126.9873882,
      label: "시청 · 서울",
    }
  );
});

test("import skips inactive newcomers and syncs existing ids", async () => {
  const jpeg = Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xd9,
    ...Array.from({ length: 40 }, (_, i) => i),
  ]);
  const calls = [];
  const result = await runShelterAnimalImport({
    serviceKey: "key",
    naverClientId: "id",
    naverClientSecret: "secret",
    lookbackDays: 7,
    maxNewImports: 10,
    now: new Date("2026-07-26T00:00:00Z"),
    createObjectKey: () =>
      "sighting_photo/20260726/123e4567-e89b-42d3-a456-426614174000.jpg",
    extractColorTokens: (text) => (text?.includes("흰") ? ["white"] : []),
    listExistingDesertionNos: async () => ({
      ok: true,
      ids: new Set(["existing-1"]),
    }),
    syncExisting: async (input) => {
      calls.push(`sync:${input.desertionNo}:${input.processState}`);
      return { ok: true };
    },
    uploadSightingPhoto: async () => {
      calls.push("upload");
      return { ok: true };
    },
    importSighting: async (input) => {
      calls.push(`import:${input.desertionNo}:${input.locationSource}`);
      return { ok: true, sightingId: "s1" };
    },
    fetchImpl: async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("abandonmentPublic_v2")) {
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "00" },
              body: {
                totalCount: 3,
                items: {
                  item: [
                    {
                      desertionNo: "existing-1",
                      happenDt: "20260720",
                      happenPlace: "진접읍",
                      kindCd: "[개] 믹스견",
                      colorCd: "흰",
                      weight: "4",
                      processState: "종료(입양)",
                      careAddr: "남양주",
                      orgNm: "남양주",
                      popfile: "https://example.com/a.jpg",
                    },
                    {
                      desertionNo: "new-inactive",
                      happenDt: "20260720",
                      happenPlace: "진접읍",
                      kindCd: "[개] 믹스견",
                      colorCd: "흰",
                      weight: "4",
                      processState: "종료(입양)",
                      careAddr: "남양주",
                      orgNm: "남양주",
                      popfile: "https://example.com/a.jpg",
                    },
                    {
                      desertionNo: "new-active",
                      happenDt: "20260720",
                      happenPlace: "진접읍",
                      kindCd: "[개] 믹스견",
                      colorCd: "흰",
                      weight: "4",
                      processState: "보호중",
                      careAddr: "남양주 경강로",
                      orgNm: "남양주",
                      specialMark: "순함",
                      popfile: "https://example.com/a.jpg",
                    },
                  ],
                },
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes("openapi.naver.com")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                title: "장소",
                address: "경기",
                roadAddress: "",
                mapx: "1271123456",
                mapy: "376543210",
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("example.com/a.jpg")) {
        return new Response(jpeg, { status: 200 });
      }
      return new Response("no", { status: 404 });
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.synced, 1);
  assert.equal(result.summary.skippedInactiveNew, 1);
  assert.equal(result.summary.created, 1);
  assert.deepEqual(calls, [
    "sync:existing-1:종료(입양)",
    "upload",
    "import:new-active:happen_place",
  ]);
});

test("fetchAbandonmentPage rejects non-success result codes", async () => {
  const page = await fetchAbandonmentPage({
    serviceKey: "k",
    pageNo: 1,
    numOfRows: 10,
    bgnde: "20260701",
    endde: "20260707",
    upkind: "417000",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          response: { header: { resultCode: "99", resultMsg: "fail" } },
        }),
        { status: 200 }
      ),
  });
  assert.deepEqual(page, { ok: false, reason: "upstream_error" });
});
