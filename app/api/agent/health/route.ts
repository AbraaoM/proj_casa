import { authorize } from "@/lib/agent/auth";
import { jsonOk, toErrorResponse } from "@/lib/agent/http";
import { tryGetSql } from "@/lib/db/client";
import { isMissingSchema } from "@/lib/db/errors";
import { AREA_KINDS, RECOMMENDED_CATEGORIES, DEFAULT_TIMEZONE } from "@/lib/domain/types";
import { FINANCE_ENUMS } from "@/lib/domain/finance/types";
import { getSchemaVersion, getSettings } from "@/lib/repositories/settings";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const caller = { user: auth.caller.username, agent_name: auth.caller.agentName, agent_key_id: auth.caller.keyId };

  const sql = tryGetSql();
  if (!sql) {
    return jsonOk({
      service: "casa",
      caller,
      database: "unconfigured",
      schema_version: null,
      timezone: DEFAULT_TIMEZONE,
      recommended_categories: RECOMMENDED_CATEGORIES,
      area_kinds: AREA_KINDS,
      finance: FINANCE_ENUMS,
    });
  }

  try {
    const [version, settings] = await Promise.all([getSchemaVersion(sql), getSettings(sql)]);
    return jsonOk({
      service: "casa",
      caller,
      database: version ? "ok" : "schema_missing",
      schema_version: version,
      timezone: settings?.timezone ?? DEFAULT_TIMEZONE,
      recommended_categories: RECOMMENDED_CATEGORIES,
      area_kinds: AREA_KINDS,
      finance: FINANCE_ENUMS,
    });
  } catch (error) {
    if (isMissingSchema(error)) {
      return jsonOk({
        service: "casa",
      caller,
        database: "schema_missing",
        schema_version: null,
        timezone: DEFAULT_TIMEZONE,
        recommended_categories: RECOMMENDED_CATEGORIES,
      area_kinds: AREA_KINDS,
      finance: FINANCE_ENUMS,
      });
    }
    return toErrorResponse(error);
  }
}
