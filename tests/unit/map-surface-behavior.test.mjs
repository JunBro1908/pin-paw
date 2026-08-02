import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const jsxRuntime = {
  Fragment: "fragment",
  jsx: (type, props, key) => ({ type, key, props: props ?? {} }),
  jsxs: (type, props, key) => ({ type, key, props: props ?? {} }),
};

async function loadTsx(relativePath) {
  const source = await readFile(relativePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const moduleRecord = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "next/image") return { __esModule: true, default: "img" };
    if (specifier === "react") {
      return {
        useEffect() {},
        useRef(value) {
          return { current: value };
        },
      };
    }
    throw new Error(`Unexpected runtime import: ${specifier}`);
  };
  new Function("require", "module", "exports", output)(
    localRequire,
    moduleRecord,
    moduleRecord.exports
  );
  return moduleRecord.exports;
}

function materialize(node) {
  if (node == null || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(materialize);
  if (typeof node !== "object") return [node];
  if (typeof node.type === "function")
    return materialize(node.type(node.props));
  return [node, ...materialize(node.props?.children)];
}

function textContent(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node !== "object") return String(node);
  if (typeof node.type === "function")
    return textContent(node.type(node.props));
  return textContent(node.props?.children);
}

function findElement(tree, predicate) {
  return materialize(tree).find(
    (node) => typeof node === "object" && predicate(node)
  );
}

test("authenticated toolbar exposes filter state and executes every callback", async () => {
  const { MapToolbar } = await loadTsx(
    "src/features/map/components/MapToolbar.tsx"
  );
  const calls = [];
  const tree = MapToolbar({
    layer: "bookmark",
    authenticated: true,
    listOpen: true,
    onLayerChange: (layer) => calls.push(["layer", layer]),
    onLocate: () => calls.push(["locate"]),
    onToggleList: () => calls.push(["list"]),
  });

  const nodes = materialize(tree);
  const buttonByText = (label) =>
    nodes.find((node) => node.type === "button" && textContent(node) === label);
  assert.equal(buttonByText("저장한 흔적").props["aria-pressed"], true);
  buttonByText("새 목격").props.onClick();
  nodes
    .find((node) => node.props?.["aria-label"] === "현재 위치로 이동")
    .props.onClick();
  const list = nodes.find(
    (node) => node.props?.["aria-label"] === "제보 목록 보기"
  );
  assert.equal(list.props["aria-pressed"], true);
  list.props.onClick();

  assert.deepEqual(calls, [["layer", "unseen"], ["locate"], ["list"]]);
});

test("guest toolbar hides authenticated controls but keeps locate available", async () => {
  const { MapToolbar } = await loadTsx(
    "src/features/map/components/MapToolbar.tsx"
  );
  let located = 0;
  const tree = MapToolbar({
    layer: "default",
    authenticated: false,
    listOpen: false,
    onLayerChange: () => assert.fail("guest filter must remain unavailable"),
    onLocate: () => located++,
    onToggleList: () => assert.fail("guest list must remain unavailable"),
  });
  const nodes = materialize(tree);

  for (const label of ["전체", "새 목격", "저장한 흔적"]) {
    assert.equal(
      nodes.some(
        (node) => node.type === "button" && textContent(node) === label
      ),
      false
    );
  }
  assert.equal(
    nodes.some((node) => node.props?.["aria-label"] === "제보 목록 보기"),
    false
  );
  nodes
    .find((node) => node.props?.["aria-label"] === "현재 위치로 이동")
    .props.onClick();
  assert.equal(located, 1);
});

test("detail surface executes close and selects sighting versus lost content", async () => {
  const { MapDetailSheetSurface } = await loadTsx(
    "src/features/map/components/MapDetailSheet.tsx"
  );
  let closed = 0;
  const sighting = MapDetailSheetSurface({
    selection: {
      kind: "sighting",
      item: { id: "s-1", type: "point", source_type: "sighting" },
    },
    onClose: () => closed++,
    getLostPostImageUrl: () => "",
    children: jsxRuntime.jsx("span", { children: "목격 상세" }),
  });
  assert.match(textContent(sighting), /목격 상세/);
  findElement(
    sighting,
    (node) => node.props?.["aria-label"] === "선택한 지도 정보 닫기"
  ).props.onClick();
  assert.equal(closed, 1);

  const lost = MapDetailSheetSurface({
    selection: {
      kind: "lost",
      item: { id: "l-1", pet_name: "보리", lat: 37.5, lng: 127 },
    },
    onClose: () => closed++,
    getLostPostImageUrl: () => "",
    children: jsxRuntime.jsx("span", { children: "목격 상세" }),
  });
  assert.match(textContent(lost), /보리/);
  assert.doesNotMatch(textContent(lost), /목격 상세/);
});

test("suspended detail surface is hidden and non-modal beneath bookmark dialog", async () => {
  const { MapDetailSheetSurface } = await loadTsx(
    "src/features/map/components/MapDetailSheet.tsx"
  );
  const baseProps = {
    selection: {
      kind: "sighting",
      item: { id: "s-1", type: "point", source_type: "sighting" },
    },
    onClose() {},
    getLostPostImageUrl: () => "",
  };

  const activeAside = MapDetailSheetSurface({
    ...baseProps,
    keyboardActive: true,
  });
  assert.equal(activeAside.props["aria-modal"], "true");
  assert.equal(activeAside.props["aria-hidden"], undefined);
  assert.equal(activeAside.props.inert, undefined);

  const suspendedAside = MapDetailSheetSurface({
    ...baseProps,
    keyboardActive: false,
  });
  assert.equal(suspendedAside.props["aria-modal"], undefined);
  assert.equal(suspendedAside.props["aria-hidden"], true);
  assert.equal(suspendedAside.props.inert, true);
});

test("shared dialog tab helper contains focus in both directions", async () => {
  const { trapDialogTab } = await loadTsx(
    "src/features/map/components/MapDetailSheet.tsx"
  );
  const focused = [];
  const first = {
    focus: () => focused.push("first"),
    getAttribute: () => null,
  };
  const last = { focus: () => focused.push("last"), getAttribute: () => null };
  const dialog = {
    querySelectorAll: () => [first, last],
    contains: (element) => element === first || element === last,
  };
  const event = (shiftKey) => ({
    key: "Tab",
    shiftKey,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  });

  const forward = event(false);
  assert.equal(trapDialogTab(forward, dialog, last), true);
  assert.equal(forward.prevented, true);
  const backward = event(true);
  assert.equal(trapDialogTab(backward, dialog, first), true);
  assert.equal(backward.prevented, true);
  assert.deepEqual(focused, ["first", "last"]);
});
