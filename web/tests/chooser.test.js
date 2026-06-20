// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { buildChooser } from "../js/chooser.js";

function model() {
  const sonata = {
    filename: "Sonata.pdf",
    title: "Sonata",
    composer: "Beethoven",
    page_count: 3,
    pieces: [],
  };
  const etudes = {
    filename: "Études, Op. 10.pdf",
    title: "Études, Op. 10",
    composer: "Chopin",
    page_count: 24,
    pieces: [
      { title: "No. 1", first_page: 1, last_page: 3 },
      { title: "No. 2", first_page: 4, last_page: 6 },
    ],
  };
  const aria = {
    filename: "Aria.pdf",
    title: "Aria",
    composer: "Bach",
    page_count: 2,
    pieces: [],
  };
  return {
    scores: {
      "Sonata.pdf": sonata,
      "Études, Op. 10.pdf": etudes,
      "Aria.pdf": aria,
    },
    setlists: {
      Recital: [etudes, sonata],
      Encore: [aria],
    },
    composers: [
      { composer: "Bach", scores: [aria] },
      { composer: "Beethoven", scores: [sonata] },
      { composer: "Chopin", scores: [etudes] },
    ],
  };
}

describe("buildChooser", () => {
  it("renders a setlists section with one details per setlist, in order", () => {
    const node = buildChooser(model(), { onOpen: () => {} });
    const summaries = [...node.querySelectorAll(".setlists details > summary")];
    expect(summaries.map((s) => s.textContent)).toEqual(["Recital", "Encore"]);
  });

  it("renders a composer-sorted section", () => {
    const node = buildChooser(model(), { onOpen: () => {} });
    const headings = [...node.querySelectorAll(".composers .composer-group > h3")];
    expect(headings.map((h) => h.textContent)).toEqual([
      "Bach",
      "Beethoven",
      "Chopin",
    ]);
  });

  it("exposes the pieces of a multi-piece score", () => {
    const node = buildChooser(model(), { onOpen: () => {} });
    const pieces = [
      ...node.querySelectorAll('.composers .piece[data-file="Études, Op. 10.pdf"]'),
    ];
    expect(pieces.map((p) => p.textContent)).toEqual(["No. 1", "No. 2"]);
  });

  it("fires onOpen with {file, page} when a piece is clicked", () => {
    const onOpen = vi.fn();
    const node = buildChooser(model(), { onOpen });
    const piece = node.querySelector(
      '.composers .piece[data-file="Études, Op. 10.pdf"][data-page="4"]'
    );
    piece.click();
    expect(onOpen).toHaveBeenCalledWith({ file: "Études, Op. 10.pdf", page: 4 });
  });

  it("fires onOpen at page 1 when a score title is clicked", () => {
    const onOpen = vi.fn();
    const node = buildChooser(model(), { onOpen });
    const score = node.querySelector('.composers .score[data-file="Sonata.pdf"]');
    score.click();
    expect(onOpen).toHaveBeenCalledWith({ file: "Sonata.pdf", page: 1 });
  });
});
