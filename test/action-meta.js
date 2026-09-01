'use strict';

// A deliberately small YAML reader, sufficient to validate GitHub Action
// metadata: nested mappings, sequences, quoted scalars and block scalars.
// It exists so the test suite can check action.yml without adding a
// dependency to a zero-dependency package. It is not a general YAML parser.

function stripInlineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 1)
    || (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function parseActionYaml(text) {
  const raw = text.split(/\r?\n/);
  let cursor = 0;

  // Returns the index of the next line that carries structure, skipping
  // blank lines and whole-line comments.
  function nextStructural(from) {
    for (let i = from; i < raw.length; i += 1) {
      const trimmed = raw[i].trim();
      if (trimmed !== '' && !trimmed.startsWith('#')) return i;
    }
    return raw.length;
  }

  // Consumes every line indented deeper than `baseIndent` as literal text.
  function readBlockScalar(baseIndent) {
    const collected = [];
    while (cursor < raw.length) {
      const line = raw[cursor];
      if (line.trim() === '') { collected.push(''); cursor += 1; continue; }
      if (indentOf(line) <= baseIndent) break;
      collected.push(line);
      cursor += 1;
    }
    return collected.join('\n');
  }

  function parseValue(rest, ownIndent) {
    const value = rest.trim();
    if (value === '|' || value === '>' || value === '|-' || value === '>-' || value === '|+') {
      return readBlockScalar(ownIndent);
    }
    if (value !== '') return unquote(value);

    const next = nextStructural(cursor);
    if (next >= raw.length || indentOf(raw[next]) <= ownIndent) return null;
    return parseNode(indentOf(raw[next]));
  }

  function parseNode(indent) {
    const start = nextStructural(cursor);
    if (start >= raw.length) return null;
    cursor = start;
    return raw[cursor].trim().startsWith('- ') ? parseSequence(indent) : parseMapping(indent);
  }

  function parseSequence(indent) {
    const items = [];
    while (true) {
      const at = nextStructural(cursor);
      if (at >= raw.length) break;
      const line = raw[at];
      if (indentOf(line) !== indent || !line.trim().startsWith('- ')) break;
      cursor = at;

      // Re-present the item body as a mapping indented past the dash, so a
      // sequence of mappings parses with the same code path as any mapping.
      const dashIndent = indentOf(line);
      raw[cursor] = ' '.repeat(dashIndent + 2) + line.trim().slice(2);
      items.push(parseMapping(dashIndent + 2));
    }
    return items;
  }

  function parseMapping(indent) {
    const map = {};
    while (true) {
      const at = nextStructural(cursor);
      if (at >= raw.length) break;
      const line = raw[at];
      const lineIndent = indentOf(line);
      if (lineIndent < indent) break;
      if (lineIndent > indent) break;
      if (line.trim().startsWith('- ')) break;

      const content = stripInlineComment(line).trim();
      const colon = content.indexOf(':');
      if (colon === -1) break;

      const key = unquote(content.slice(0, colon));
      const rest = content.slice(colon + 1);
      cursor = at + 1;
      map[key] = parseValue(rest, lineIndent);
    }
    return map;
  }

  return parseNode(0) || {};
}

module.exports = { parseActionYaml, stripInlineComment, unquote };
