import { describe, it, expect } from "vitest";
import { ScriptedGazeSource } from "../js/gaze/source.js";

describe("ScriptedGazeSource", () => {
  const samples = [
    { x: 100, y: 10, confidence: 0.9, t: 0 },
    { x: 110, y: 20, confidence: 0.8, t: 16 },
    { x: 120, y: 30, confidence: 0.7, t: 32 },
  ];

  it("drives the registered callback with each sample in order on start", () => {
    const src = new ScriptedGazeSource(samples);
    const seen = [];
    src.onSample((s) => seen.push(s));
    src.start();
    expect(seen).toEqual(samples);
  });

  it("delivers nothing before start()", () => {
    const src = new ScriptedGazeSource(samples);
    const seen = [];
    src.onSample((s) => seen.push(s));
    expect(seen).toEqual([]);
  });

  it("emits no further samples after stop()", () => {
    const src = new ScriptedGazeSource(samples);
    const seen = [];
    src.onSample((s) => {
      seen.push(s);
      if (seen.length === 1) src.stop(); // stop mid-stream
    });
    src.start();
    expect(seen).toEqual([samples[0]]);
  });

  it("works without a listener registered", () => {
    const src = new ScriptedGazeSource(samples);
    expect(() => src.start()).not.toThrow();
  });
});
