#!/usr/bin/env python3
"""validate_skills.py — stdin JSON validator for the 6 skill categories.

Input (stdin JSON):
    {"AI & Automation": {"text": "...", "cap": 97}, ...}

Output (stdout JSON):
    {"pass": bool, "fails": [{"category", "len", "cap"}, ...]}

A category fails if len(text) > cap.
"""
import json
import sys

def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        json.dump({'pass': False, 'error': f'invalid JSON: {e}'}, sys.stdout)
        sys.exit(1)

    fails = []
    for category, spec in data.items():
        text = spec.get('text', '')
        cap = spec.get('cap', 0)
        n = len(text)
        if n > cap:
            fails.append({'category': category, 'len': n, 'cap': cap})

    out = {'pass': len(fails) == 0, 'fails': fails}
    json.dump(out, sys.stdout)
    sys.stdout.write('\n')

if __name__ == '__main__':
    main()
