// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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
    const node = buildChooser(model());
    const summaries = [...node.querySelectorAll(".setlists details > summary")];
    expect(summaries.map((s) => s.textContent)).toEqual(["Recital", "Encore"]);
  });

  it("renders a composer-sorted section", () => {
    const node = buildChooser(model());
    const headings = [...node.querySelectorAll(".composers .composer-group > h3")];
    expect(headings.map((h) => h.textContent)).toEqual([
      "Bach",
      "Beethoven",
      "Chopin",
    ]);
  });

  it("exposes the pieces of a multi-piece score", () => {
    const node = buildChooser(model());
    const pieces = [
      ...node.querySelectorAll('.composers .piece[data-file="Études, Op. 10.pdf"]'),
    ];
    expect(pieces.map((p) => p.textContent)).toEqual(["No. 1", "No. 2"]);
  });

  it("links a piece to its score permalink with a ?page query", () => {
    const node = buildChooser(model());
    const piece = node.querySelector(
      '.composers .piece[data-file="Études, Op. 10.pdf"][data-page="4"]'
    );
    expect(piece.tagName).toBe("A");
    expect(piece.getAttribute("href")).toBe(
      "/score/%C3%89tudes%2C%20Op.%2010.pdf?page=4"
    );
  });

  it("links a score title to its permalink with no ?page at page 1", () => {
    const node = buildChooser(model());
    const score = node.querySelector('.composers .score[data-file="Sonata.pdf"]');
    expect(score.tagName).toBe("A");
    expect(score.getAttribute("href")).toBe("/score/Sonata.pdf");
  });

  it("links setlist entries to the same per-score permalink", () => {
    const node = buildChooser(model());
    // The "Recital" setlist is [Études, Sonata]; the Sonata entry links to its score.
    const score = node.querySelector(
      '.setlists details .score[data-file="Sonata.pdf"]'
    );
    expect(score.getAttribute("href")).toBe("/score/Sonata.pdf");
  });
});
