import fs from 'node:fs/promises';
import { readLocalizedReleaseNotes } from './release-metadata.js';

// Validate the working tree before creating a tag; the release workflow also
// checks that the existing tag points to exactly the checked-out commit.
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
await readLocalizedReleaseNotes(`v${version}`);
console.log(`Release notes and package versions agree: v${version}`);
