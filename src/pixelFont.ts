/** 4×5 block glyphs for the chunky 3D letters on the poster. Rows run top to bottom. */
const GLYPHS: Record<string, readonly string[]> = {
  '1': ['.##.', '###.', '.##.', '.##.', '####'],
  U: ['#..#', '#..#', '#..#', '#..#', '####'],
  P: ['###.', '#..#', '###.', '#...', '#...'],
  D: ['###.', '#..#', '#..#', '#..#', '###.'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
};

export const GLYPH_W = 4;
export const GLYPH_H = 5;

/** Filled cells of a glyph as [column, row-from-bottom] pairs. */
export function glyphCells(ch: string): [number, number][] {
  const rows = GLYPHS[ch];
  if (!rows) return [];
  const cells: [number, number][] = [];
  rows.forEach((row, r) => [...row].forEach((c, col) => c === '#' && cells.push([col, GLYPH_H - 1 - r])));
  return cells;
}
