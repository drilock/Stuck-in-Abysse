// Resources: one per biome plus a rare deep one. With only 5 colours, the icon SHAPE tells them apart.
export const RES = ['cristal', 'corail', 'kelp', 'ferraille', 'magmatite', 'nodule'];
export const RES_NAME = { cristal: 'CRYSTAL', corail: 'CORAL', kelp: 'KELP', ferraille: 'SCRAP', magmatite: 'MAGMA', nodule: 'NODULE' };
const ICONS = {
  cristal: ['..4..', '.343.', '33333', '.333.', '..3..'],
  corail: ['2.2.2', '.222.', '..2..', '.2.2.', '..1..'],
  kelp: ['.3...', '..3..', '.3...', '..3..', '.3...'],
  ferraille: ['22222', '21112', '21412', '21112', '22222'],
  magmatite: ['.111.', '13431', '14441', '13431', '.111.'],
  nodule: ['.444.', '4...4', '4.3.4', '4...4', '.444.'],
};

// 5x5 icon with its top-left corner at (x, y)
export function drawIcon(r, kind, x, y) {
  const rows = ICONS[kind] || ICONS.cristal;
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 5; i++) {
      const ch = rows[j][i];
      if (ch !== '.') r.rect(x + i, y + j, 1, 1, +ch);
    }
  }
}
