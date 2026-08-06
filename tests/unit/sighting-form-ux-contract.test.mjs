import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test(
  "confirmed sent screen appears after the fixed hold while registration continues independently",
  async () => {
    const form = await readFile(
      "src/features/sightings/components/SightingForm.tsx",
      "utf8"
    );

    const sending = form.indexOf('setSubmitPhase("sending")');
    const networkWork = form.indexOf(
      "const networkWork = (async () => {",
      sending
    );
    const registration = form.indexOf(
      "await registerSighting(",
      networkWork
    );
    const invalidate = form.indexOf(
      "runBestEffort(async () =>",
      registration
    );
    const holdWait = form.indexOf(
      "await new Promise<void>",
      networkWork
    );
    const successFlip = form.indexOf(
      'setSubmitPhase("success")',
      holdWait
    );

    assert.ok(sending >= 0, "sending phase should start on submit");
    assert.ok(
      networkWork > sending,
      "background registration should start after the sending phase"
    );
    assert.ok(
      registration > networkWork,
      "domain registration should run inside the background task"
    );
    assert.ok(
      invalidate > registration,
      "cache invalidation should start after registration succeeds"
    );
    assert.ok(
      holdWait > networkWork,
      "the confirmation hold should run independently of registration"
    );
    assert.ok(
      successFlip > holdWait,
      "success confirmation should appear after the fixed hold"
    );

    assert.match(form, /const holdMs = 2500;/);
    assert.match(form, /void networkWork;/);
    assert.doesNotMatch(
      form,
      /registered = true/,
      "success should not depend on a legacy registration flag"
    );
    assert.doesNotMatch(
      form,
      /await networkWork/,
      "the confirmation screen must not wait for the network request"
    );

    const invalidationBlock = form.slice(
      invalidate,
      form.indexOf("});", invalidate) + 3
    );

    assert.match(
      invalidationBlock,
      /await import\("@\/features\/sightings\/hooks\/useMySightings"\)/
    );
    assert.doesNotMatch(invalidationBlock, /console\./);
  }
);

test(
  "submit shows fixed send progress and reports background failures only by toast",
  async () => {
    const form = await readFile(
      "src/features/sightings/components/SightingForm.tsx",
      "utf8"
    );

    assert.match(form, /submitPhase/);
    assert.match(form, /제보를 전송하고 있어요/);
    assert.match(form, /role="progressbar"/);
    assert.match(form, /제보가 전송되었습니다/);
    assert.doesNotMatch(form, /소중한 제보가 전송되었습니다/);
    assert.match(form, /확인했어요/);
    assert.match(form, /useDialogFocus/);
    assert.match(form, /role="dialog"/);
    assert.match(form, /aria-modal="true"/);
    assert.match(form, /fixed inset-0/);
    assert.match(form, /bg-background-warm/);
    assert.match(form, /name="send"/);
    assert.doesNotMatch(form, /name="check"/);

    assert.match(form, /setSubmitPhase\("sending"\)/);
    assert.match(form, /const holdMs = 2500;/);
    assert.match(form, /const networkWork = \(async \(\) => \{/);
    assert.match(form, /setSendProgress\(100\)/);
    assert.match(form, /setSubmitPhase\("success"\)/);
    assert.match(form, /void networkWork;/);

    const networkStart = form.indexOf(
      "const networkWork = (async () => {"
    );
    const catchStart = form.indexOf(
      "} catch (err) {",
      networkStart
    );
    const networkEnd = form.indexOf("})();", catchStart);

    assert.ok(networkStart >= 0, "background task should exist");
    assert.ok(catchStart > networkStart, "background failure should be handled");
    assert.ok(networkEnd > catchStart, "background task should close correctly");

    const catchBlock = form.slice(catchStart, networkEnd);

    assert.match(catchBlock, /setToast\(\{/);
    assert.match(catchBlock, /type:\s*"error"/);
    assert.doesNotMatch(
      catchBlock,
      /setSubmitPhase/,
      "background failure must not close or replace the confirmation screen"
    );
    assert.doesNotMatch(
      catchBlock,
      /setSendProgress/,
      "background failure must not reset confirmation progress"
    );
    assert.doesNotMatch(
      catchBlock,
      /setIsSubmitting/,
      "background failure must remain independent from the fixed hold UI"
    );

    assert.match(form, /setSubmitPhase\("idle"\)/);
    assert.doesNotMatch(form, /registered = true/);
    assert.doesNotMatch(form, /prev === "sending" \? "success" : prev/);
    assert.doesNotMatch(form, /지도에서 확인|지도로 보러가기/);
    assert.doesNotMatch(form, /이어서 제보하기/);
    assert.doesNotMatch(form, /optimisticSent/);
    assert.doesNotMatch(form, /h-\[80vh\]/);
    assert.doesNotMatch(form, /제보가 지도에 등록되었습니다/);
    assert.match(form, /사진을 등록해주세요/);
    assert.match(form, /photoError=\{photoError\}/);
  }
);