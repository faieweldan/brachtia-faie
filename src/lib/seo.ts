export const SITE_URL = "https://brachtiahomes.com";

export function absoluteUrl(path: string) {
  if (!path) return SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
