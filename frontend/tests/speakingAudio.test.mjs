import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { claimSpeakingAudio, playSpeakingAudio } from "../src/utils/speakingAudio.js";

const originalAudio = globalThis.Audio;

afterEach(() => {
  claimSpeakingAudio(() => {}).finish();
  if (originalAudio === undefined) delete globalThis.Audio;
  else globalThis.Audio = originalAudio;
});

test("switching generated sentences stops the previous MP3", () => {
  const instances = [];
  globalThis.Audio = class {
    constructor(url) { this.url = url; this.paused = false; instances.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === "src") this.url = ""; }
    load() {}
  };
  let firstStopped = 0;
  let secondStopped = 0;
  const first = playSpeakingAudio("/first.mp3", {
    onStop: () => { firstStopped += 1; }, onError: () => {},
  });
  const second = playSpeakingAudio("/second.mp3", {
    onStop: () => { secondStopped += 1; }, onError: () => {},
  });
  assert.equal(first.active, false);
  assert.equal(instances[0].paused, true);
  assert.equal(firstStopped, 1);
  assert.equal(instances[1].url, "/second.mp3");
  instances[1].onended();
  assert.equal(second.active, false);
  assert.equal(secondStopped, 1);
});

test("a pending recording is cancelled before MP3 playback", () => {
  let cancelled = 0;
  const recording = claimSpeakingAudio(() => { cancelled += 1; });
  globalThis.Audio = class {
    play() { return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
    load() {}
  };
  const playback = playSpeakingAudio("/sentence.mp3", { onStop: () => {}, onError: () => {} });
  assert.equal(recording.active, false);
  assert.equal(cancelled, 1);
  assert.equal(playback.active, true);
  recording.finish();
  assert.equal(playback.active, true);
  playback.cancel();
});

test("playback failure frees audio ownership and reports an error", async () => {
  globalThis.Audio = class {
    play() { return Promise.reject(new Error("blocked")); }
    pause() {}
    removeAttribute() {}
    load() {}
  };
  let stopped = 0;
  let errors = 0;
  const session = playSpeakingAudio("/sentence.mp3", {
    onStop: () => { stopped += 1; }, onError: () => { errors += 1; },
  });
  await Promise.resolve();
  assert.equal(session.active, false);
  assert.equal(stopped, 1);
  assert.equal(errors, 1);
});
