import { LEVELS } from '../src/levels/defs';
import { validateLevel } from '../src/levels/validate';

const problems = LEVELS.flatMap(validateLevel);
for (const p of problems) console.error(`✗ ${p}`);
if (problems.length) process.exit(1);
console.log(`✓ ${LEVELS.length} levels valid`);
