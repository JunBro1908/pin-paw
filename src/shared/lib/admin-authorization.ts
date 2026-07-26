type MetadataUser = {
  app_metadata?: Record<string, unknown> | null;
};

export function hasAdminAppMetadata(
  user: MetadataUser | null | undefined
): boolean {
  const metadata = user?.app_metadata;
  return metadata?.role === "admin" || metadata?.admin === true;
}
