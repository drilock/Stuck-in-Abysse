// 3x5 pixel font. Each glyph is 15 bits, row by row.
const RAW = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  ' ': '000000000000000', '.': '000000000000010', ':': '000010000010000', '-': '000000111000000',
  '+': '000010111010000', '/': '001001010100100', '!': '010010010000010', '?': '110001010000010',
  '>': '100010001010100', '<': '001010100010001', '%': '101001010100101', "'": '010010000000000',
  ',': '000000000010100', '(': '010100100100010', ')': '010001001001010', '=': '000111000111000',
  '*': '000101010101000', '#': '101111101111101',
};
const GLYPHS = {};
for (const [ch, bits] of Object.entries(RAW)) {
  const px = [];
  for (let i = 0; i < 15; i++) if (bits[i] === '1') px.push([i % 3, Math.floor(i / 3)]);
  GLYPHS[ch] = px;
}

export function textWidth(str, scale = 1, spacing = 1) {
  if (!str.length) return 0;
  return str.length * (3 * scale + spacing) - spacing;
}

export function drawText(r, str, x, y, color, scale = 1, align = 'left', spacing = 1) {
  str = String(str).toUpperCase();
  if (align === 'center') x -= Math.floor(textWidth(str, scale, spacing) / 2);
  else if (align === 'right') x -= textWidth(str, scale, spacing);
  x = Math.round(x);
  y = Math.round(y);
  for (let i = 0; i < str.length; i++) {
    const g = GLYPHS[str[i]] || GLYPHS['?'];
    for (const [gx, gy] of g) r.rect(x + gx * scale, y + gy * scale, scale, scale, color);
    x += 3 * scale + spacing;
  }
}

// 5x5 bold font for titles and big labels.
const BIG_RAW = {
  A: '0111010001111111000110001', B: '1111010001111101000111110', C: '0111110000100001000001111',
  D: '1111010001100011000111110', E: '1111110000111101000011111', F: '1111110000111101000010000',
  G: '0111110000100111000101111', H: '1000110001111111000110001', I: '1111100100001000010011111',
  K: '1000110010111001001010001', L: '1000010000100001000011111', M: '1000111011101011000110001',
  N: '1000111001101011001110001', O: '0111010001100011000101110', P: '1111010001111101000010000',
  R: '1111010001111101001010001', S: '0111110000011100000111110', T: '1111100100001000010000100',
  U: '1000110001100011000101110', V: '1000110001100010101000100', W: '1000110001101011101110001',
  X: '1000101010001000101010001', Y: '1000101010001000010000100',
  0: '0111010011101011100101110', 1: '0010001100001000010001110', 2: '1111000001011101000011111',
  3: '1111000001001100000111110', 4: '1001010010111110001000010', 5: '1111110000111100000111110',
  6: '0111010000111101000101110', 7: '1111100001000100010000100', 8: '0111010001011101000101110',
  9: '0111010001011110000101110', ' ': '0000000000000000000000000', '!': '0010000100001000000000100',
};
const BIG = {};
for (const [ch, bits] of Object.entries(BIG_RAW)) {
  const px = [];
  for (let i = 0; i < 25; i++) if (bits[i] === '1') px.push([i % 5, Math.floor(i / 5)]);
  BIG[ch] = px;
}

export function bigWidth(str, scale = 1, spacing = scale) {
  return str.length ? str.length * (5 * scale + spacing) - spacing : 0;
}

export function drawBig(r, str, x, y, color, scale = 1, align = 'left', spacing = scale) {
  str = String(str).toUpperCase();
  if (align === 'center') x -= Math.floor(bigWidth(str, scale, spacing) / 2);
  else if (align === 'right') x -= bigWidth(str, scale, spacing);
  x = Math.round(x);
  y = Math.round(y);
  for (let i = 0; i < str.length; i++) {
    const g = BIG[str[i]] || BIG[' '];
    for (const [gx, gy] of g) r.rect(x + gx * scale, y + gy * scale, scale, scale, color);
    x += 5 * scale + spacing;
  }
}

// Big label with a hard pixel drop shadow (no blur, palette colours only).
export function drawBigShadow(r, str, x, y, color, shadow, scale, align = 'center', spacing = scale, depth = 1) {
  for (let d = depth; d >= 1; d--) drawBig(r, str, x + d, y + d, shadow, scale, align, spacing);
  drawBig(r, str, x, y, color, scale, align, spacing);
}
