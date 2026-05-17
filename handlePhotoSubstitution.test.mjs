/**
 * Tests for handlePhotoSubstitution (generate-pdf.mjs)
 *
 * Prerequisites:
 *   1. Export the function in generate-pdf.mjs:
 *      export function handlePhotoSubstitution(html, projectRoot) { ... }
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest handlePhotoSubstitution.test.mjs
 */

import { jest } from '@jest/globals';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Helpers — create a temporary project root with real files
// ---------------------------------------------------------------------------

function makeTmpProject(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-test-'));

  // config/profile.yml
  const configDir = path.join(root, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  if (options.photoField !== undefined) {
    const photoLine =
      options.photoField === null
        ? '' // no photo key at all
        : `photo: ${options.photoField}\n`;
    fs.writeFileSync(
      path.join(configDir, 'profile.yml'),
      `candidate:\n  full_name: "Test User"\n${photoLine}`
    );
  } else {
    // no photo key
    fs.writeFileSync(
      path.join(configDir, 'profile.yml'),
      'candidate:\n  full_name: "Test User"\n'
    );
  }

  // optionally write a real image file (1×1 white JPEG, ~631 bytes)
  if (options.createPhoto) {
    const photoDir = path.dirname(path.join(root, options.createPhoto));
    fs.mkdirSync(photoDir, { recursive: true });

    const content = options.photoContent ?? MINIMAL_JPEG;
    fs.writeFileSync(path.join(root, options.createPhoto), content);
  }

  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// Minimal valid JPEG bytes (1×1 pixel, white)
const MINIMAL_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000' +
    'ffdb004300080606070605080707070909080a0c' +
    '140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20' +
    '242e2720222c231c1c2837292c30313434341f27' +
    '39413d3234312f3030ffc0000b080001000101011' +
    '100ffc4001f0000010501010101010100000000000' +
    '000000102030405060708090a0bffc400b5100002' +
    '0103040405040607030208010002010000030101' +
    'ffd9',
  'hex'
);

// Minimal PNG (1×1 transparent)
const MINIMAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
);

// ---------------------------------------------------------------------------
// Import the function under test (after exporting it from generate-pdf.mjs)
// ---------------------------------------------------------------------------

let handlePhotoSubstitution;

beforeAll(async () => {
  // Dynamic import — works once the function is exported
  const mod = await import('./generate-pdf.mjs');
  handlePhotoSubstitution = mod.handlePhotoSubstitution;
});

const HTML_WITH_PLACEHOLDER = '<div>{{PHOTO_BLOCK}}</div>';
const HTML_WITHOUT_PLACEHOLDER = '<div>no placeholder here</div>';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handlePhotoSubstitution', () => {
  // --- 1. Missing config file ---
  describe('when config/profile.yml does not exist', () => {
    it('replaces {{PHOTO_BLOCK}} with empty string', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-noconfig-'));
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toBe('<div></div>');
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 2. No photo field ---
  describe('when photo field is absent from config', () => {
    it('replaces {{PHOTO_BLOCK}} with empty string', () => {
      const root = makeTmpProject({ photoField: undefined });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toBe('<div></div>');
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 3. Empty photo field ---
  describe('when photo field is empty string', () => {
    it('replaces {{PHOTO_BLOCK}} with empty string', () => {
      // js-yaml parses `photo: ` as null — treat both null and '' safely
      const root = makeTmpProject({ photoField: "''" });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toBe('<div></div>');
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 4. Absolute path ---
  describe('when photo is an absolute path', () => {
    it('logs a warning and replaces {{PHOTO_BLOCK}} with empty string', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const root = makeTmpProject({ photoField: '/etc/passwd' });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toBe('<div></div>');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('project-relative')
        );
      } finally {
        cleanup(root);
        warnSpy.mockRestore();
      }
    });
  });

  // --- 5. Path traversal (escape project root) ---
  describe('when photo path attempts directory traversal', () => {
    it('logs a warning and replaces {{PHOTO_BLOCK}} with empty string', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // Create a real file outside root so realpathSync succeeds but relPath escapes
      const root = makeTmpProject({ photoField: '../outside.jpg' });
      // Write the target file one level up so realpathSync doesn't throw
      const outsideFile = path.join(root, '..', 'outside.jpg');
      fs.writeFileSync(outsideFile, MINIMAL_JPEG);
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toBe('<div></div>');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('escapes project root')
        );
      } finally {
        try { fs.unlinkSync(outsideFile); } catch { /* ignore */ }
        cleanup(root);
        warnSpy.mockRestore();
      }
    });
  });

  // --- 6. File does not exist ---
  describe('when photo file does not exist on disk', () => {
    it('logs a warning and replaces {{PHOTO_BLOCK}} with empty string', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const root = makeTmpProject({ photoField: 'assets/ghost.jpg' });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toBe('<div></div>');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('not accessible')
        );
      } finally {
        cleanup(root);
        warnSpy.mockRestore();
      }
    });
  });

  // --- 7. Unsupported format ---
  describe('when photo has an unsupported extension', () => {
    it.each(['.gif', '.webp', '.heic', '.bmp', '.svg'])(
      'rejects %s format with a warning',
      (ext) => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const filename = `assets/photo${ext}`;
        const root = makeTmpProject({
          photoField: filename,
          createPhoto: filename,
          photoContent: Buffer.from('fake'),
        });
        try {
          const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
          expect(result).toBe('<div></div>');
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Unsupported photo format')
          );
        } finally {
          cleanup(root);
          warnSpy.mockRestore();
        }
      }
    );
  });

  // --- 8. File too large ---
  describe('when photo exceeds 2 MiB', () => {
    it('logs a warning and replaces {{PHOTO_BLOCK}} with empty string', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const filename = 'assets/huge.jpg';
      const root = makeTmpProject({
        photoField: filename,
        createPhoto: filename,
        photoContent: Buffer.alloc(3 * 1024 * 1024, 0xff), // 3 MB
      });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toBe('<div></div>');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('too large')
        );
      } finally {
        cleanup(root);
        warnSpy.mockRestore();
      }
    });
  });

  // --- 9. Valid JPEG ---
  describe('when a valid JPEG is provided', () => {
    it('embeds the image as a data URI with image/jpeg MIME type', () => {
      const filename = 'assets/photo.jpg';
      const root = makeTmpProject({
        photoField: filename,
        createPhoto: filename,
        photoContent: MINIMAL_JPEG,
      });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        const expected = MINIMAL_JPEG.toString('base64');
        expect(result).toContain('data:image/jpeg;base64,');
        expect(result).toContain(expected);
        expect(result).toContain('<img class="cv-photo"');
        expect(result).not.toContain('{{PHOTO_BLOCK}}');
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 10. Valid .jpeg extension ---
  describe('when photo has .jpeg extension', () => {
    it('uses image/jpeg MIME type', () => {
      const filename = 'assets/photo.jpeg';
      const root = makeTmpProject({
        photoField: filename,
        createPhoto: filename,
        photoContent: MINIMAL_JPEG,
      });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toContain('data:image/jpeg;base64,');
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 11. Valid PNG ---
  describe('when a valid PNG is provided', () => {
    it('embeds the image as a data URI with image/png MIME type', () => {
      const filename = 'assets/photo.png';
      const root = makeTmpProject({
        photoField: filename,
        createPhoto: filename,
        photoContent: MINIMAL_PNG,
      });
      try {
        const result = handlePhotoSubstitution(HTML_WITH_PLACEHOLDER, root);
        expect(result).toContain('data:image/png;base64,');
        expect(result).not.toContain('{{PHOTO_BLOCK}}');
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 12. Multiple placeholders ---
  describe('when HTML contains multiple {{PHOTO_BLOCK}} occurrences', () => {
    it('replaces all of them', () => {
      const html = '{{PHOTO_BLOCK}}<hr>{{PHOTO_BLOCK}}';
      const filename = 'assets/photo.jpg';
      const root = makeTmpProject({
        photoField: filename,
        createPhoto: filename,
        photoContent: MINIMAL_JPEG,
      });
      try {
        const result = handlePhotoSubstitution(html, root);
        expect(result).not.toContain('{{PHOTO_BLOCK}}');
        // Both occurrences are replaced with an <img> tag
        const matches = result.match(/<img class="cv-photo"/g) ?? [];
        expect(matches.length).toBe(2);
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 13. HTML without placeholder ---
  describe('when HTML has no {{PHOTO_BLOCK}} placeholder', () => {
    it('returns the HTML unchanged (no crash)', () => {
      const root = makeTmpProject({ photoField: 'assets/photo.jpg' });
      try {
        const result = handlePhotoSubstitution(HTML_WITHOUT_PLACEHOLDER, root);
        expect(result).toBe(HTML_WITHOUT_PLACEHOLDER);
      } finally {
        cleanup(root);
      }
    });
  });

  // --- 14. Inaccessible project root ---
  describe('when projectRoot itself is inaccessible', () => {
    it('logs a warning and replaces {{PHOTO_BLOCK}} with empty string', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = handlePhotoSubstitution(
          HTML_WITH_PLACEHOLDER,
          '/this/path/does/not/exist'
        );
        expect(result).toBe('<div></div>');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('not accessible')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
