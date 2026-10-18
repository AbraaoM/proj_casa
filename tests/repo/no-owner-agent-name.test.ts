import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The owner's own agent has a personal name; the product must not. Every agent
 * name shown on screen comes from the database (agent_keys.label).
 */
const NAME = ["ja", "mes"].join("");

describe("no owner agent name in the repo", () => {
  it("has no file name or text mentioning it", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const hits: string[] = [];
    for (const file of files) {
      if (file.toLowerCase().includes(NAME)) hits.push(file);
      if (/\.(png|jpg|ico|svg|woff2?)$/.test(file)) continue;
      let text: string;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      text.split("\n").forEach((line, index) => {
        if (new RegExp(`\\b${NAME}\\b`, "i").test(line)) hits.push(`${file}:${index + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
