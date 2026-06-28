import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getLibrary,
  getPages,
  pageUrl,
  getResume,
  putResume,
  getTuning,
  putTuning,
  getCalibration,
  putCalibration,
} from "../js/api.js";

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getLibrary fetches /api/library and returns parsed JSON", async () => {
    const payload = { scores: {}, setlists: {}, composers: [] };
    fetch.mockResolvedValue({ ok: true, json: async () => payload });

    const result = await getLibrary();

    expect(fetch).toHaveBeenCalledWith("/api/library");
    expect(result).toEqual(payload);
  });

  it("getLibrary throws on a non-ok response", async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(getLibrary()).rejects.toThrow(/503/);
  });

  it("getPages fetches the per-score page-dimensions endpoint", async () => {
    const dims = [
      { width: 2160, height: 2824 },
      { width: 2160, height: 2824 },
    ];
    fetch.mockResolvedValue({ ok: true, json: async () => dims });

    const result = await getPages("Études, Op. 10.pdf");

    expect(fetch).toHaveBeenCalledWith(
      `/api/score/${encodeURIComponent("Études, Op. 10.pdf")}/pages`
    );
    expect(result).toEqual(dims);
  });

  it("pageUrl URL-encodes the score file and sets the annotated flag", () => {
    const file = "Études, Op. 10.pdf";
    const enc = encodeURIComponent(file);
    expect(pageUrl(file, 2, true)).toBe(`/api/score/${enc}/page/2.png?annotated=1`);
    expect(pageUrl(file, 2, false)).toBe(`/api/score/${enc}/page/2.png?annotated=0`);
  });

  it("getResume fetches the per-score resume endpoint", async () => {
    const resume = { page: 4, scroll: 1234.5 };
    fetch.mockResolvedValue({ ok: true, json: async () => resume });

    const result = await getResume("Sonata.pdf");

    expect(fetch).toHaveBeenCalledWith("/api/score/Sonata.pdf/resume");
    expect(result).toEqual(resume);
  });

  it("putResume PUTs the body as JSON", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await putResume("A B.pdf", { page: 2, scroll: 10 });

    expect(fetch).toHaveBeenCalledWith("/api/score/A%20B.pdf/resume", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 2, scroll: 10 }),
    });
  });

  it("getTuning fetches /api/tuning", async () => {
    const tuning = { setpoint: 0.4 };
    fetch.mockResolvedValue({ ok: true, json: async () => tuning });

    const result = await getTuning();

    expect(fetch).toHaveBeenCalledWith("/api/tuning");
    expect(result).toEqual(tuning);
  });

  it("putTuning PUTs the body as JSON", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await putTuning({ setpoint: 0.35 });

    expect(fetch).toHaveBeenCalledWith("/api/tuning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setpoint: 0.35 }),
    });
  });

  it("getCalibration fetches /api/calibration with default landscape orientation", async () => {
    const entry = { blob: [{ data: [0.1] }], dpr: 2 };
    fetch.mockResolvedValue({ ok: true, json: async () => entry });

    const result = await getCalibration();

    expect(fetch).toHaveBeenCalledWith("/api/calibration?orientation=landscape");
    expect(result).toEqual(entry);
  });

  it("getCalibration passes the given orientation", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => null });

    await getCalibration("portrait");

    expect(fetch).toHaveBeenCalledWith("/api/calibration?orientation=portrait");
  });

  it("putCalibration PUTs the entry as JSON with default landscape orientation", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const entry = { blob: [{ data: [0.3] }], dpr: 1.5 };

    await putCalibration(entry);

    expect(fetch).toHaveBeenCalledWith("/api/calibration?orientation=landscape", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  });

  it("putCalibration passes the given orientation", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const entry = { blob: [], dpr: 1 };

    await putCalibration(entry, "portrait");

    expect(fetch).toHaveBeenCalledWith("/api/calibration?orientation=portrait", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  });
});
