// YAML parser for profile.yml — handles nested objects, arrays, quoted strings
export function parse(text) {
  const lines = text.split('\n');
  return parseBlock(lines, 0, lines.length, -1);
}

function parseBlock(lines, start, end, parentIndent) {
  const result = {};
  let i = start;

  while (i < end) {
    const raw = lines[i];
    if (!raw || !raw.trim() || raw.trim().startsWith('#')) { i++; continue; }

    const indent = raw.search(/\S/);
    if (indent <= parentIndent) break; // back to parent scope

    const line = raw.trim();

    // Array item at this level — shouldn't happen at top level of parseBlock
    if (line.startsWith('- ')) { break; }

    const kvMatch = line.match(/^([^:]+):\s*(.*)/);
    if (!kvMatch) { i++; continue; }

    const key = kvMatch[1].trim();
    const value = kvMatch[2].trim();

    if (value && value !== '|') {
      // Simple key: value
      result[key] = unquote(value);
      i++;
    } else {
      // Look at children to decide: array or object?
      const childStart = i + 1;
      const childIndent = findChildIndent(lines, childStart, end);

      if (childIndent === null) {
        result[key] = value === '|' ? '' : {};
        i++;
      } else {
        // Check if children are array items
        const firstChild = lines[childStart] ? findFirstContent(lines, childStart, end) : null;
        if (firstChild !== null && lines[firstChild].trim().startsWith('- ')) {
          result[key] = parseArray(lines, childStart, end, indent);
          // Skip past all children
          i = skipBlock(lines, childStart, end, indent);
        } else {
          result[key] = parseBlock(lines, childStart, end, indent);
          i = skipBlock(lines, childStart, end, indent);
        }
      }
    }
  }
  return result;
}

function parseArray(lines, start, end, parentIndent) {
  const arr = [];
  let i = start;

  while (i < end) {
    const raw = lines[i];
    if (!raw || !raw.trim() || raw.trim().startsWith('#')) { i++; continue; }

    const indent = raw.search(/\S/);
    if (indent <= parentIndent) break;

    const line = raw.trim();
    if (!line.startsWith('- ')) { i++; continue; }

    const val = line.slice(2).trim();

    // Check if this array item has nested children (object item)
    const childStart = i + 1;
    const childIndent = findChildIndent(lines, childStart, end);
    const hasChildren = childIndent !== null && childIndent > indent;

    if (hasChildren) {
      // Object array item — parse "- key: val" plus nested keys
      const item = {};
      const kvMatch = val.match(/^([^:]+):\s*(.*)/);
      if (kvMatch) {
        item[kvMatch[1].trim()] = unquote(kvMatch[2].trim());
      }
      // Parse nested keys belonging to this item
      const nested = parseBlock(lines, childStart, end, indent);
      Object.assign(item, nested);
      arr.push(item);
      i = skipBlock(lines, childStart, end, indent);
    } else {
      // Simple value or inline object
      if (val.includes(':') && !val.startsWith('"') && !val.startsWith("'") && !val.startsWith('http')) {
        const item = {};
        const kvMatch = val.match(/^([^:]+):\s*(.*)/);
        if (kvMatch) item[kvMatch[1].trim()] = unquote(kvMatch[2].trim());
        arr.push(item);
      } else {
        arr.push(unquote(val));
      }
      i++;
    }
  }
  return arr;
}

function findChildIndent(lines, start, end) {
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (l && l.trim() && !l.trim().startsWith('#')) {
      return l.search(/\S/);
    }
  }
  return null;
}

function findFirstContent(lines, start, end) {
  for (let i = start; i < end; i++) {
    if (lines[i] && lines[i].trim() && !lines[i].trim().startsWith('#')) return i;
  }
  return null;
}

function skipBlock(lines, start, end, parentIndent) {
  let i = start;
  while (i < end) {
    const raw = lines[i];
    if (!raw || !raw.trim() || raw.trim().startsWith('#')) { i++; continue; }
    if (raw.search(/\S/) <= parentIndent) break;
    i++;
  }
  return i;
}

function unquote(s) {
  if (!s) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  return s;
}
