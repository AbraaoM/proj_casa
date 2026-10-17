import { describe, expect, test } from "vitest";
import { splitSql } from "@/lib/db/split-sql";

describe("splitSql", () => {
  test("keeps semicolons inside a dollar-quoted function body", () => {
    const sql = `
      CREATE TABLE dogs (id uuid);
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$;
    `;
    const statements = splitSql(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TABLE dogs");
    expect(statements[1]).toContain("NEW.updated_at = now();");
  });
});
