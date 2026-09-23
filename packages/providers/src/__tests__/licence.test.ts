import { describe, expect, it } from "vitest";
import { attributionLine, normaliseLicence, stripHtml } from "../images/licence.js";

describe("normaliseLicence", () => {
  it("accepts the permissive licences we ship", () => {
    expect(normaliseLicence("CC0")).toBe("cc0");
    expect(normaliseLicence("Public domain")).toBe("public-domain");
    expect(normaliseLicence("CC BY 4.0")).toBe("cc-by");
    expect(normaliseLicence("CC BY-SA 3.0")).toBe("cc-by-sa");
    expect(normaliseLicence("cc-by-sa-4.0")).toBe("cc-by-sa");
  });

  it("rejects non-commercial and no-derivatives before matching cc-by", () => {
    expect(normaliseLicence("CC BY-NC 4.0")).toBeNull();
    expect(normaliseLicence("CC BY-NC-SA 4.0")).toBeNull();
    expect(normaliseLicence("CC BY-ND 4.0")).toBeNull();
  });

  it("rejects fair use and all-rights-reserved", () => {
    expect(normaliseLicence("Fair use")).toBeNull();
    expect(normaliseLicence("All rights reserved")).toBeNull();
    expect(normaliseLicence("Non-free media")).toBeNull();
  });

  it("rejects unknown and missing licences", () => {
    expect(normaliseLicence(undefined)).toBeNull();
    expect(normaliseLicence("")).toBeNull();
    expect(normaliseLicence("Some bespoke terms")).toBeNull();
  });

  it("prefers cc-by-sa over cc-by when both could match", () => {
    expect(normaliseLicence("Creative Commons Attribution-ShareAlike")).toBe("cc-by-sa");
  });
});

describe("stripHtml", () => {
  it("unwraps the HTML fragments Commons returns for artists", () => {
    expect(stripHtml('<a href="/wiki/User:Bob" title="User:Bob">Bob</a>')).toBe("Bob");
    expect(stripHtml("Anna &amp; Ben")).toBe("Anna & Ben");
  });
});

describe("attributionLine", () => {
  it("builds a credit line naming the author, licence and source", () => {
    expect(
      attributionLine({
        title: "Port of Aden",
        author: "<a>Jane Doe</a>",
        licence: "cc-by-sa",
        provider: "wikimedia",
      }),
    ).toBe("Port of Aden — Jane Doe, CC BY-SA, via Wikimedia Commons");
  });

  it("omits the title when there isn't one", () => {
    expect(attributionLine({ author: "Sam", licence: "unsplash", provider: "unsplash" })).toBe(
      "Sam, Unsplash Licence, via Unsplash",
    );
  });
});
