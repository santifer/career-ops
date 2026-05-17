/**
 * tests/unit/pdf-child-page.test.mjs
 *
 * No live Playwright renders — all tests inject a mock playwrightLauncher.
 * Mock returns a minimal fake PDF buffer (the bytes value is tested, not
 * PDF validity).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  renderChildPageAsPDF,
  linkOrGeneratePDF,
  pdfExists,
} from '../../lib/pdf-child-page.mjs';

import { renderChildPageHTML, wrapForPDFFlavor } from '../../lib/child-page-template.mjs';

// ---------------------------------------------------------------------------
// Mock Playwright launcher
// ---------------------------------------------------------------------------

const FAKE_PDF_CONTENT = Buffer.from('%PDF-1.4 fake content for tests');

function mockLauncher(_html, _format, _margin) {
  return Promise.resolve(FAKE_PDF_CONTENT);
}

function mockLauncherEmpty(_html, _format, _margin) {
  return Promise.resolve(Buffer.alloc(0));
}

function mockLauncherError() {
  return Promise.reject(new Error('Playwright: browser crash'));
}

// ---------------------------------------------------------------------------
// Temp dir helpers
// ---------------------------------------------------------------------------

function makeTempDir() {
  const d = join(tmpdir(), `pdf-test-${Date.now()}`);
  mkdirSync(d, { recursive: true });
  return d;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// Sample HTML
// ---------------------------------------------------------------------------

function sampleHtml() {
  return renderChildPageHTML({
    title: 'Test Story',
    sections: [{ heading: 'Narrative', body: '<p>Story content here.</p>' }],
  });
}

// ---------------------------------------------------------------------------
// renderChildPageAsPDF tests
// ---------------------------------------------------------------------------

test('renderChildPageAsPDF throws without html', async () => {
  await assert.rejects(
    () => renderChildPageAsPDF({ outPath: '/tmp/test.pdf', opts: { playwrightLauncher: mockLauncher } }),
    /html is required/
  );
});

test('renderChildPageAsPDF throws without outPath', async () => {
  await assert.rejects(
    () => renderChildPageAsPDF({ html: '<html></html>', opts: { playwrightLauncher: mockLauncher } }),
    /outPath is required/
  );
});

test('renderChildPageAsPDF throws on invalid format', async () => {
  const dir = makeTempDir();
  try {
    await assert.rejects(
      () => renderChildPageAsPDF({
        html: sampleHtml(),
        outPath: join(dir, 'out.pdf'),
        opts: { format: 'a3', playwrightLauncher: mockLauncher },
      }),
      /invalid format/
    );
  } finally {
    cleanup(dir);
  }
});

test('renderChildPageAsPDF writes PDF to disk and returns path + bytes', async () => {
  const dir = makeTempDir();
  const outPath = join(dir, 'story.pdf');
  try {
    const result = await renderChildPageAsPDF({
      html: sampleHtml(),
      outPath,
      opts: { playwrightLauncher: mockLauncher },
    });

    assert.equal(result.path, outPath, 'returned path matches outPath');
    assert.equal(result.bytes, FAKE_PDF_CONTENT.length, 'returned bytes matches buffer length');
    assert.ok(existsSync(outPath), 'PDF file exists on disk');
    const written = readFileSync(outPath);
    assert.ok(written.equals(FAKE_PDF_CONTENT), 'written content matches mock buffer');
  } finally {
    cleanup(dir);
  }
});

test('renderChildPageAsPDF creates output directory if missing', async () => {
  const dir = makeTempDir();
  const deepOut = join(dir, 'a', 'b', 'c', 'story.pdf');
  try {
    await renderChildPageAsPDF({
      html: sampleHtml(),
      outPath: deepOut,
      opts: { playwrightLauncher: mockLauncher },
    });
    assert.ok(existsSync(deepOut), 'PDF written into deeply nested dir');
  } finally {
    cleanup(dir);
  }
});

test('renderChildPageAsPDF passes PDF-flavor HTML to the launcher (not raw HTML)', async () => {
  const dir = makeTempDir();
  let capturedHtml = null;

  const capturingLauncher = (html, _format, _margin) => {
    capturedHtml = html;
    return Promise.resolve(FAKE_PDF_CONTENT);
  };

  try {
    await renderChildPageAsPDF({
      html: sampleHtml(),
      outPath: join(dir, 'out.pdf'),
      opts: { playwrightLauncher: capturingLauncher },
    });

    // wrapForPDFFlavor should have been applied — @page rule must be present
    assert.ok(capturedHtml.includes('@page'), 'launcher receives PDF-flavored HTML with @page rule');
    assert.ok(capturedHtml.includes('.cp-footer { display: none'), 'footer hidden in PDF HTML passed to launcher');
  } finally {
    cleanup(dir);
  }
});

test('renderChildPageAsPDF respects custom margin option', async () => {
  const dir = makeTempDir();
  let capturedMargin = null;

  const capturingLauncher = (_html, _format, margin) => {
    capturedMargin = margin;
    return Promise.resolve(FAKE_PDF_CONTENT);
  };

  try {
    await renderChildPageAsPDF({
      html: sampleHtml(),
      outPath: join(dir, 'out.pdf'),
      opts: { margin: '1.5in', playwrightLauncher: capturingLauncher },
    });
    assert.equal(capturedMargin, '1.5in', 'custom margin passed to launcher');
  } finally {
    cleanup(dir);
  }
});

test('renderChildPageAsPDF propagates launcher errors', async () => {
  const dir = makeTempDir();
  try {
    await assert.rejects(
      () => renderChildPageAsPDF({
        html: sampleHtml(),
        outPath: join(dir, 'out.pdf'),
        opts: { playwrightLauncher: mockLauncherError },
      }),
      /Playwright: browser crash/
    );
  } finally {
    cleanup(dir);
  }
});

test('renderChildPageAsPDF throws when launcher returns empty buffer', async () => {
  const dir = makeTempDir();
  try {
    await assert.rejects(
      () => renderChildPageAsPDF({
        html: sampleHtml(),
        outPath: join(dir, 'out.pdf'),
        opts: { playwrightLauncher: mockLauncherEmpty },
      }),
      /empty buffer/
    );
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// linkOrGeneratePDF tests
// ---------------------------------------------------------------------------

test('linkOrGeneratePDF throws without rowId', async () => {
  await assert.rejects(
    () => linkOrGeneratePDF(null, 'my-story'),
    /rowId is required/
  );
});

test('linkOrGeneratePDF throws without storySlug', async () => {
  await assert.rejects(
    () => linkOrGeneratePDF(42, ''),
    /storySlug is required/
  );
});

test('linkOrGeneratePDF generates PDF on cache miss and returns path', async () => {
  const root = makeTempDir();
  try {
    const path = await linkOrGeneratePDF(1, 'led-ai-rollout', {
      html: sampleHtml(),
      repoRoot: root,
      playwrightLauncher: mockLauncher,
    });

    assert.ok(typeof path === 'string', 'returns a string path');
    assert.ok(path.endsWith('.pdf'), 'path ends with .pdf');
    assert.ok(existsSync(path), 'PDF exists on disk');
  } finally {
    cleanup(root);
  }
});

test('linkOrGeneratePDF returns cached path on second call without re-generating', async () => {
  const root = makeTempDir();
  let launcherCallCount = 0;

  const countingLauncher = (html, format, margin) => {
    launcherCallCount++;
    return mockLauncher(html, format, margin);
  };

  try {
    // First call — generates
    const path1 = await linkOrGeneratePDF(2, 'cached-story', {
      html: sampleHtml(),
      repoRoot: root,
      playwrightLauncher: countingLauncher,
    });

    // Second call — should return cached
    const path2 = await linkOrGeneratePDF(2, 'cached-story', {
      html: sampleHtml(),
      repoRoot: root,
      playwrightLauncher: countingLauncher,
    });

    assert.equal(launcherCallCount, 1, 'launcher called only once');
    assert.equal(path1, path2, 'same path returned both times');
  } finally {
    cleanup(root);
  }
});

test('linkOrGeneratePDF re-generates when cache is stale', async () => {
  const root = makeTempDir();
  let launcherCallCount = 0;

  const countingLauncher = (html, format, margin) => {
    launcherCallCount++;
    return mockLauncher(html, format, margin);
  };

  try {
    // First call — generates
    const path1 = await linkOrGeneratePDF(3, 'stale-story', {
      html: sampleHtml(),
      repoRoot: root,
      playwrightLauncher: countingLauncher,
      cacheTtlMs: 1, // 1ms TTL = always stale after first write
    });

    // Backdate the file's mtime by 100ms so the 1ms TTL has definitely expired
    const oldTime = new Date(Date.now() - 100);
    utimesSync(path1, oldTime, oldTime);

    // Second call — stale, should regenerate
    await linkOrGeneratePDF(3, 'stale-story', {
      html: sampleHtml(),
      repoRoot: root,
      playwrightLauncher: countingLauncher,
      cacheTtlMs: 1,
    });

    assert.equal(launcherCallCount, 2, 'launcher called twice (cache expired)');
  } finally {
    cleanup(root);
  }
});

test('linkOrGeneratePDF throws when cache miss and no html provided', async () => {
  const root = makeTempDir();
  try {
    await assert.rejects(
      () => linkOrGeneratePDF(4, 'no-html-story', {
        repoRoot: root,
        playwrightLauncher: mockLauncher,
        // html intentionally omitted
      }),
      /opts\.html not provided/
    );
  } finally {
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// pdfExists tests
// ---------------------------------------------------------------------------

test('pdfExists returns false for nonexistent file', () => {
  assert.equal(pdfExists('/no/such/file.pdf'), false);
});

test('pdfExists returns true for a fresh file', () => {
  const dir = makeTempDir();
  const p = join(dir, 'fresh.pdf');
  try {
    writeFileSync(p, 'fake');
    assert.equal(pdfExists(p), true);
  } finally {
    cleanup(dir);
  }
});

test('pdfExists returns false for a stale file', () => {
  const dir = makeTempDir();
  const p = join(dir, 'stale.pdf');
  try {
    writeFileSync(p, 'fake');
    const oldTime = new Date(Date.now() - 2000);
    utimesSync(p, oldTime, oldTime);
    assert.equal(pdfExists(p, 1000), false, 'file older than 1s TTL is stale');
  } finally {
    cleanup(dir);
  }
});
