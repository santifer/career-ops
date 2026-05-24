#!/usr/bin/env python3
"""validate_bullets.py -- stdin JSON validator for the 15 resume bullets.

Input (stdin JSON):
    {"M1": "<text>", "M2": "<text>", ..., "V4": "<text>"}
    Text may contain LaTeX markup; the validator strips it before measuring.

Output (stdout JSON):
    {"pass": bool, "fails": [{"id", "len", "direction": "low"|"high"|"missing"}, ...]}

Band: visible-text length must be in [220, 230] inclusive.
"""
import json
import re
import sys

BAND_LOW = 220
BAND_HIGH = 230
EXPECTED_IDS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6',
                'B1', 'B2', 'B3', 'B4', 'B5',
                'V1', 'V2', 'V3', 'V4']


def strip_latex(s: str) -> str:
    """Strip LaTeX markup that does not count toward visible length."""
    s = re.sub(r'\\textbf\{([^}]*)\}', r'\1', s)
    s = re.sub(r'\\href\{[^}]*\}\{([^}]*)\}', r'\1', s)
    s = re.sub(r'\\resumeItem\{([^}]*)\}', r'\1', s)
    s = s.replace(r'\%', '%').replace(r'\&', '&').replace(r'\$', '$') \
         .replace(r'\#', '#').replace(r'\_', '_')
    return s


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        json.dump({'pass': False, 'error': 'invalid JSON: ' + str(e)}, sys.stdout)
        sys.exit(1)

    fails = []
    for bid in EXPECTED_IDS:
        if bid not in data:
            fails.append({'id': bid, 'len': 0, 'direction': 'missing'})
            continue
        visible = strip_latex(data[bid])
        n = len(visible)
        if n < BAND_LOW:
            fails.append({'id': bid, 'len': n, 'direction': 'low'})
        elif n > BAND_HIGH:
            fails.append({'id': bid, 'len': n, 'direction': 'high'})

    out = {'pass': len(fails) == 0, 'fails': fails}
    json.dump(out, sys.stdout)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
