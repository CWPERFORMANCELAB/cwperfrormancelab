/** Fonts are self-hosted: no build or page load depends on Google Fonts. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.(tsx?|css|mdx?)$/.test(e.name) ? [p] : [];
  });
}

describe("self-hosted fonts", () => {
  it("nothing imports next/font/google or links to Google Fonts", () => {
    const offenders = [...sourceFiles(path.join(root, "src")), ...sourceFiles(path.join(root, "config"))].filter((f) =>
      /next\/font\/google|fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the committed font files are real woff2 files with their licences", () => {
    for (const f of ["inter-latin-wght-normal.woff2", "inter-tight-latin-wght-normal.woff2"]) {
      const buf = fs.readFileSync(path.join(root, "src/app/fonts", f));
      expect(buf.subarray(0, 4).toString("latin1")).toBe("wOF2");
    }
    expect(fs.readFileSync(path.join(root, "src/app/fonts/OFL-Inter.txt"), "utf8")).toContain("SIL Open Font License");
    expect(fs.readFileSync(path.join(root, "src/app/fonts/OFL-InterTight.txt"), "utf8")).toContain("SIL Open Font License");
  });
});
