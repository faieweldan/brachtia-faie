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
 * The reference as it should read for a version: the first one plain, later
 * ones with the version after a slash.
 *
 * Version 1 is left alone on purpose. A student holding "BH-240926-QT0035"
 * should not have to work out whether it is the same document as
 * "BH-240926-QT0035/1".
 */
export function referenceFor(reference: string, version: number): string {
  return version > 1 ? `${reference}/${version}` : reference;
}
