import { mkdir, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const popupDistDir = path.join(distDir, 'popup');

async function main() {
  await mkdir(distDir, { recursive: true });
  await mkdir(popupDistDir, { recursive: true });

  await copyFile(path.join(root, 'src', 'manifest.json'), path.join(distDir, 'manifest.json'));
  await copyFile(
    path.join(root, 'src', 'popup', 'popup.html'),
    path.join(popupDistDir, 'popup.html')
  );

  // Clean up accidental TypeScript outputs that should not be loaded directly.
  await rm(path.join(distDir, 'popup', 'popup.ts'), { force: true });
  await rm(path.join(distDir, 'content', 'content.ts'), { force: true });
}

main().catch((error) => {
  console.error('[copy-assets] Failed:', error);
  process.exit(1);
});
