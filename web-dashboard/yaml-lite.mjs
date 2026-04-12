// Minimal YAML parser for profile.yml — handles flat keys, nested objects, arrays, quoted strings
export function parse(text) {
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  let currentKey = null;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const line = raw.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    if (line.startsWith('- ')) {
      const val = unquote(line.slice(2).trim());
      if (currentKey && Array.isArray(parent[currentKey])) {
        if (typeof val === 'string' && val.includes(':')) {
          const obj = {};
          parseInlineObj(line.slice(2).trim(), obj);
          parent[currentKey].push(obj);
        } else {
          parent[currentKey].push(val);
        }
      }
      continue;
    }

    const kvMatch = line.match(/^([^:]+):\s*(.*)/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    let value = kvMatch[2].trim();

    if (value === '' || value === '|') {
      parent[key] = [];
      currentKey = key;
      stack.push({ obj: parent, indent });
    } else {
      parent[key] = unquote(value);
      currentKey = key;
    }
  }
  return result;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  return s;
}

function parseInlineObj(line, obj) {
  const parts = line.split(/,\s*/);
  for (const part of parts) {
    const m = part.match(/([^:]+):\s*(.*)/);
    if (m) obj[m[1].trim()] = unquote(m[2].trim());
  }
}
