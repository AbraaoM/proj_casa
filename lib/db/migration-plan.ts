const VERSION = /^[0-9]{3}_[a-z0-9_]+$/;

export function pendingVersions(files: readonly string[], applied: ReadonlySet<string>): string[] {
  return files
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.slice(0, -".sql".length))
    .filter((version) => VERSION.test(version) && !applied.has(version))
    .sort();
}
