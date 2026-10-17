import { authorize } from "@/lib/agent/auth";
import { jsonOk, toErrorResponse } from "@/lib/agent/http";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { RECOMMENDED_CATEGORIES, DEFAULT_TIMEZONE } from "@/lib/domain/types";
import { getSchemaVersion, getSettings } from "@/lib/repositories/settings";

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const sql = tryGetSql();
  if (!sql) {
    return jsonOk({
      service: "casa",
      database: "unconfigured",
      schema_version: null,
      timezone: DEFAULT_TIMEZONE,
      recommended_categories: RECOMMENDED_CATEGORIES,
    });
  }

  try {
    const [version, settings] = await Promise.all([getSchemaVersion(sql), getSettings(sql)]);
    return jsonOk({
      service: "casa",
      database: version ? "ok" : "schema_missing",
      schema_version: version,
      timezone: settings?.timezone ?? DEFAULT_TIMEZONE,
      recommended_categories: RECOMMENDED_CATEGORIES,
    });
  } catch (error) {
    if (isMissingSchema(error)) {
      return jsonOk({
        service: "casa",
        database: "schema_missing",
        schema_version: null,
        timezone: DEFAULT_TIMEZONE,
        recommended_categories: RECOMMENDED_CATEGORIES,
      });
    }
    return toErrorResponse(error);
  }
}
