import { describe, expect, test } from 'bun:test';
import { PDFDocument } from 'pdf-lib';
import { fillPdf, ticked, type PdfBox } from '../src/lib/pdf-boxes';

const blankForm = async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]); // A4
  return pdf.save();
};
const box = (key: string, kind: PdfBox['kind'] = 'text'): PdfBox => ({ id: key, key, kind, page: 0, x: 0.2, y: 0.2, w: 0.3, h: 0.02 });
const size = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe('writing onto a PDF form', () => {
  test('the page is kept: still one A4 page', async () => {
    const out = await fillPdf(await blankForm(), [box('Name')], { Name: 'Aisha' });
    expect(await size(out)).toBe(1);
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(page.getWidth()).toBe(595);
    expect(page.getHeight()).toBe(842);
  });
  test('writing a value adds to the page', async () => {
    const form = await blankForm();
    const empty = await fillPdf(form, [box('Name')], {});
    const filled = await fillPdf(form, [box('Name')], { Name: 'Nur Aisyah Binti Mohd Khairul Anuar' });
    expect(filled.length).toBeGreaterThan(empty.length);
  });
  test('a box on a page the form does not have is skipped, not a crash', async () => {
    const out = await fillPdf(await blankForm(), [{ ...box('Name'), page: 3 }], { Name: 'x' });
    expect(await size(out)).toBe(1);
  });
  test('what ticks a tick box', () => {
    expect(ticked('yes')).toBe(true);
    expect(ticked('')).toBe(false);
    expect(ticked(null)).toBe(false);
    expect(ticked('no')).toBe(false);
    expect(ticked('0')).toBe(false);
  });
});
