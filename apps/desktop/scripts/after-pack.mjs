// @ts-check
/**
 * electron-builder hook: ad-hoc sign the Mac app.
 *
 * Apple silicon refuses to run an app with no signature at all, and packaging
 * changes the files Electron's own signature covered. An ad-hoc signature is
 * free and enough to run; it is not a Developer ID, so macOS still asks the
 * user to allow the app once (docs/DESKTOP.md, "Installing on a Mac").
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** @param {import('electron-builder').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
}
