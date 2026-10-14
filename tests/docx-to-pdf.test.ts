import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import {
  convertWithGotenberg,
  docxToPdf,
  gotenbergConfig,
  isPdf,
  PdfConversionFailed,
} from '../src/lib/docx-to-pdf.server';

const DOCX = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]); // any bytes - Gotenberg is faked
const PDF = new TextEncoder().encode('%PDF-1.7\n...');
const config = { url: 'https://gotenberg.example', username: 'brachtia-poc', password: 's3cret-not-real' };

type Call = { url: string; init: RequestInit };
function fakeFetch(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// every console line the converter writes, to check nothing private is in them
let logged: string[] = [];
const spy = spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  logged.push(a.map(String).join(' '));
});
afterEach(() => {
  logged = [];
  spy.mockClear();
});

describe('which converter is used', () => {
  test('no GOTENBERG_URL = local LibreOffice', () => {
    expect(gotenbergConfig({})).toBeNull();
    expect(gotenbergConfig({ GOTENBERG_URL: '  ' })).toBeNull();
  });
  test('GOTENBERG_URL set = Gotenberg, trailing slash dropped', () => {
    expect(
      gotenbergConfig({ GOTENBERG_URL: 'https://g.run.app/', GOTENBERG_USERNAME: 'u', GOTENBERG_PASSWORD: 'p' }),
    ).toEqual({ url: 'https://g.run.app', username: 'u', password: 'p' });
  });
});

describe('sending the filled file to Gotenberg', () => {
  test('posts files=document.docx to /forms/libreoffice/convert with Basic Auth', async () => {
    const f = fakeFetch(() => new Response(PDF, { status: 200 }));
    const pdf = await convertWithGotenberg(DOCX, config, f.impl);

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(isPdf(pdf)).toBe(true);
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0]!;
    expect(url).toBe('https://gotenberg.example/forms/libreoffice/convert');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${btoa('brachtia-poc:s3cret-not-real')}`,
    );
    const file = (init.body as FormData).get('files') as File;
    expect(file.name).toBe('document.docx');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(DOCX);
  });

  test('no user name or password = no Authorization header', async () => {
    const f = fakeFetch(() => new Response(PDF));
    await convertWithGotenberg(DOCX, { url: 'https://g' }, f.impl);
    expect((f.calls[0]!.init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});

describe('failures give a safe message and log nothing private', () => {
  const expectSafe = async (p: Promise<unknown>, message: RegExp) => {
    const err = await p.then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(PdfConversionFailed);
    expect(err.message).toMatch(message);
    for (const text of [err.message, ...logged]) {
      expect(text).not.toContain('s3cret-not-real');
      expect(text).not.toContain(btoa('brachtia-poc:s3cret-not-real'));
      expect(text).not.toContain('resident body');
    }
  };

  test('401 = login refused', async () => {
    const f = fakeFetch(() => new Response('resident body', { status: 401 }));
    await expectSafe(convertWithGotenberg(DOCX, config, f.impl), /refused this server's login/);
  });

  test('500 = could not be made', async () => {
    const f = fakeFetch(() => new Response('resident body', { status: 500 }));
    await expectSafe(convertWithGotenberg(DOCX, config, f.impl), /could not be made/);
  });

  test('200 that is not a PDF = refused', async () => {
    const f = fakeFetch(() => new Response('resident body <html>', { status: 200 }));
    await expectSafe(convertWithGotenberg(DOCX, config, f.impl), /not a PDF/);
  });

  test('network error = could not be reached', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expectSafe(convertWithGotenberg(DOCX, config, f.impl), /could not be reached/);
  });

  test('no answer in time = took too long', async () => {
    const slow = (async (_url: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
      )) as unknown as typeof fetch;
    await expectSafe(convertWithGotenberg(DOCX, config, slow, 20), /took too long/);
  });
});

describe('docxToPdf with GOTENBERG_URL set', () => {
  test('uses Gotenberg, and the same file twice is converted once (cache kept)', async () => {
    const saved = { url: process.env['GOTENBERG_URL'], fetch: globalThis.fetch };
    const f = fakeFetch(() => new Response(PDF));
    process.env['GOTENBERG_URL'] = 'https://gotenberg.example';
    globalThis.fetch = f.impl;
    try {
      const file = new Uint8Array([9, 8, 7, Date.now() % 256, 42]); // not in the cache yet
      const first = await docxToPdf(file);
      const second = await docxToPdf(file);
      expect(isPdf(first)).toBe(true);
      expect(second).toBe(first);
      expect(f.calls).toHaveLength(1);
    } finally {
      if (saved.url === undefined) delete process.env['GOTENBERG_URL'];
      else process.env['GOTENBERG_URL'] = saved.url;
      globalThis.fetch = saved.fetch;
    }
  });
});
