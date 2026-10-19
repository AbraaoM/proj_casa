import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Real names of the family and pets never go into the repo (code, tests, docs, prints).
 * Examples use neutral names such as "Bebê". The list is spelled in pieces so this file
 * does not contain the names itself.
 */
const NAMES = [["A", "da"], ["Vi", "vi"], ["Vi", "vi", "ane"], ["Bud", "dy"], ["Ni", "na"], ["Sal", "sicha"], ["Scoo", "by"]].map((parts) => parts.join(""));

describe("no family or pet names in the repo", () => {
  it("has none in tracked files", () => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const pattern = new RegExp(`(^|[^\\p{L}])(${NAMES.join("|")})([^\\p{L}]|$)`, "u");
    const hits: string[] = [];
    for (const file of files) {
      if (/\.(png|jpg|ico|svg|woff2?)$/.test(file) || file === "package-lock.json") continue;
      let text: string;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      text.split("\n").forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${file}:${index + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
