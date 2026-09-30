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

describe('a signature picture in place of a placeholder', () => {
  // a 1x1 PNG, enough to have a header with a size
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgYGD4z8DAwMAAAA0AAf/2+TwAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
  const token = '@signature:0123456789abcdef';
  const docx = async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('word/document.xml', `<w:document xmlns:w="w"><w:body>${para(run('Signed: {{Admin_signature}} ok'))}${para(run('{{Resident_signature}}'))}</w:body></w:document>`);
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
    return zip.generateAsync({ type: 'uint8array' });
  };
  test('the picture goes where the placeholder was, with its file and link', async () => {
    const out = await JSZip.loadAsync(await fillDocx(await docx(), { Admin_signature: token, Resident_signature: '' }, { [token]: png }));
    const xml = await out.file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:drawing>');
    expect(xml).not.toContain('{{Admin_signature}}');
    expect(text(xml)).toBe('Signed:  ok');
    expect(xml).toContain('xmlns:wp=');
    expect(await out.file('word/_rels/document.xml.rels')!.async('string')).toContain('media/signature_');
    expect(Object.keys(out.files).some((f) => /^word\/media\/signature_\d+\.png$/.test(f))).toBe(true);
    expect(await out.file('[Content_Types].xml')!.async('string')).toContain('Extension="png"');
  });
  test('without the picture the token is never printed as text', async () => {
    const out = await JSZip.loadAsync(await fillDocx(await docx(), { Admin_signature: '' }));
    expect(await out.file('word/document.xml')!.async('string')).not.toContain('<w:drawing>');
  });
});
