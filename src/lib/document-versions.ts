/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a frozen quote or invoice is, and what it is called.
 *
 * Kept apart from the server functions so the preview window can read the
 * shape and name a version without pulling the database code into the browser.
 */

export type DocumentVersion = {
  id: string;
  version: number;
  /** the reference as the document read, without the /2 */
  reference: string;
  /** what the whole document was, enough to rebuild its PDF */
  body: any;
  total: number;
  /** "downloaded" or "sent": how it left */
  issuedAs: string;
  createdAt: string;
};

/**
 * The reference as it should read for a version.
 *
 * Version 1 is the original - the quote the student asked for on the website -
 * and carries the plain reference, because that is the paper they already
 * hold. The slash counts what Brachtia changed afterwards, so the first
 * revision is /1 rather than /2: "/1" reads as the first change, which is what
 * it is.
 */
export function referenceFor(reference: string, version: number): string {
  return version > 1 ? `${reference}/${version - 1}` : reference;
}

/** What to call a version in a list: the original says so in words. */
export function versionLabel(reference: string, version: number): string {
  return version > 1 ? referenceFor(reference, version) : `${reference} · original`;
}
