import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { docxPlaceholders, fillDocx, fillXml } from '../src/lib/docx-fill';

const run = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t>${text}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
const text = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
const val = (v: Record<string, string>) => (k: string) => (k in v ? v[k]! : null);

describe('filling placeholders inside the Word XML', () => {
  test('a placeholder in one run', () => {
    expect(text(fillXml(para(run('NAME: {{Name}}')), val({ Name: 'Aisha' })))).toBe('NAME: Aisha');
  });
  test('a placeholder Word split over three runs', () => {
    const xml = para(run('NAME: {{Res'), run('ident_'), run('name}} end'));
    expect(text(fillXml(xml, val({ Resident_name: 'Aisha' })))).toBe('NAME: Aisha end');
  });
  test('a value is escaped, so & and < cannot break the file', () => {
    const out = fillXml(para(run('{{A}}')), val({ A: 'Tan & Co <x>' }));
    expect(out).toContain('Tan &amp; Co &lt;x&gt;');
  });
  test('an unmapped placeholder is left showing', () => {
    expect(text(fillXml(para(run('Rent: {{Rent}}')), val({})))).toBe('Rent: {{Rent}}');
  });
  test('the yellow comes off a filled run, and stays on an unfilled one', () => {
    const hl = '<w:highlight w:val="yellow"/>';
    const out = fillXml(para(run('{{A}}', hl), run('{{B}}', hl)), val({ A: 'x' }));
    expect(out.match(/w:highlight/g)?.length).toBe(1);
    expect(text(out)).toBe('x{{B}}');
  });
  test('the rest of the paragraph - its formatting tags - is untouched', () => {
    const xml = para(run('Bold ', '<w:b/>'), run('{{A}}'));
    const out = fillXml(xml, val({ A: 'x' }));
    expect(out).toContain('<w:b/>');
  });
});

describe('a whole .docx', () => {
  const docx = async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', `<w:document><w:body>${para(run('Hi {{Name}}'))}</w:body></w:document>`);
    zip.file('word/header1.xml', `<w:hdr>${para(run('No.: {{Agreement_id}}'))}</w:hdr>`);
    zip.file('word/styles.xml', '<w:styles/>');
    return zip.generateAsync({ type: 'uint8array' });
  };
  test('placeholders are found in headers too', async () => {
    expect((await docxPlaceholders(await docx())).sort()).toEqual(['Agreement_id', 'Name']);
  });
  test('headers are filled, other parts are left as they were', async () => {
    const out = await JSZip.loadAsync(await fillDocx(await docx(), { Name: 'Aisha', Agreement_id: 'TA-001' }));
    expect(text(await out.file('word/header1.xml')!.async('string'))).toBe('No.: TA-001');
    expect(text(await out.file('word/document.xml')!.async('string'))).toBe('Hi Aisha');
    expect(await out.file('word/styles.xml')!.async('string')).toBe('<w:styles/>');
  });
});
