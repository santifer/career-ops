/**
 * tests/unit/sparkline.test.mjs
 *
 * 4 unit tests for lib/sparkline.mjs — pure SVG output, no DOM, no deps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSparkline } from '../../lib/sparkline.mjs';

test('renderSparkline returns a valid SVG string for a normal series', () => {
  const svg = renderSparkline([1, 3, 2, 5, 4, 6]);

  assert.ok(typeof svg === 'string', 'output is a string');
  assert.ok(svg.startsWith('<svg'), 'starts with <svg');
  assert.ok(svg.includes('</svg>'), 'ends with </svg>');
  assert.ok(svg.includes('<polyline'), 'contains a <polyline> element');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'has xmlns attribute');
  assert.ok(svg.includes('role="img"'), 'has role=img for accessibility');
  assert.ok(svg.includes('aria-label='), 'has aria-label attribute');
});

test('renderSparkline handles empty / edge-case input gracefully', () => {
  // Empty array — should not throw and should return a valid SVG
  const svgEmpty = renderSparkline([]);
  assert.ok(svgEmpty.includes('<svg'), 'empty input → valid SVG');
  assert.ok(!svgEmpty.includes('NaN'), 'no NaN in output for empty input');

  // Single value — flat line
  const svgSingle = renderSparkline([42]);
  assert.ok(svgSingle.includes('<polyline'), 'single value → polyline present');
  assert.ok(!svgSingle.includes('NaN'), 'no NaN in output for single value');

  // All equal values — flat line, no division-by-zero
  const svgFlat = renderSparkline([5, 5, 5, 5]);
  assert.ok(!svgFlat.includes('NaN'), 'no NaN in output for all-equal values');
  assert.ok(svgFlat.includes('<polyline'), 'all-equal values → polyline present');
});

test('renderSparkline respects custom width, height, and stroke options', () => {
  const svg = renderSparkline([10, 20, 15, 25], {
    width: 80,
    height: 20,
    stroke: '#ef4444',
    strokeWidth: 2,
    ariaLabel: 'test-sparkline',
  });

  assert.ok(svg.includes('width="80"'), 'custom width applied');
  assert.ok(svg.includes('height="20"'), 'custom height applied');
  assert.ok(svg.includes('#ef4444'), 'custom stroke color applied');
  assert.ok(svg.includes('stroke-width="2.0"'), 'custom stroke-width applied');
  assert.ok(svg.includes('aria-label="test-sparkline"'), 'custom aria-label applied');
});

test('renderSparkline area fill is included when fill option is set', () => {
  // With fill
  const svgFill = renderSparkline([1, 2, 3, 4], { fill: '#3b82f6' });
  assert.ok(svgFill.includes('<polygon'), 'fill option → polygon area element present');
  assert.ok(svgFill.includes('opacity="0.15"'), 'area fill has low opacity');

  // Without fill (default)
  const svgNoFill = renderSparkline([1, 2, 3, 4]);
  assert.ok(!svgNoFill.includes('<polygon'), 'no fill option → no polygon element');
});
