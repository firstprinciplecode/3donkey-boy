/** Prints the achievements to enter on the Steamworks partner site (Stats & Achievements). */
import { ACHIEVEMENTS } from '../src/platform/achievements';

const rows = Object.entries(ACHIEVEMENTS);
const width = Math.max(...rows.map(([id]) => id.length));
for (const [id, { name, description }] of rows) {
  console.log(`${id.padEnd(width)}  ${name.padEnd(22)}  ${description}`);
}
console.log(`\n${rows.length} achievements. Stats (INT): best_score (max), rounds_cleared (increment).`);
