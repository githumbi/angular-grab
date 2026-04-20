import { execSync } from 'child_process';
import { findAngularJson, detectProject, type ProjectInfo } from '../utils/detect-project';
import { modifyAngularJson } from '../utils/modify-angular-json';
import { modifyAppConfig } from '../utils/modify-app-config';
import { addMcp } from './add-mcp';

const PACKAGES = ['@githumbi/angular-grab'];

function log(msg: string): void {
  console.log(`\x1b[36m[angular-grab]\x1b[0m ${msg}`);
}

function warn(msg: string): void {
  console.log(`\x1b[33m[angular-grab]\x1b[0m ${msg}`);
}

function getInstallCommand(pm: ProjectInfo['packageManager']): string {
  const deps = PACKAGES.join(' ');
  switch (pm) {
    case 'pnpm':
      return `pnpm add -D ${deps}`;
    case 'yarn':
      return `yarn add -D ${deps}`;
    default:
      return `npm install -D ${deps}`;
  }
}

export async function init(): Promise<void> {
  log('Initializing angular-grab...\n');

  // 1. Find angular.json
  const angularJsonPath = findAngularJson();
  if (!angularJsonPath) {
    throw new Error(
      'Could not find angular.json. Are you in an Angular project directory?',
    );
  }

  // 2. Detect project info
  const info = detectProject(angularJsonPath);
  log(`Found project: ${info.projectName}`);
  log(`Builder type: ${info.builderType}`);
  log(`Package manager: ${info.packageManager}`);
  console.log('');

  // 3. Reject legacy builders
  if (info.builderType === 'browser') {
    throw new Error(
      'angular-grab requires the "application" builder (Angular 17+).\n' +
      'Please migrate from "@angular-devkit/build-angular:browser" to "@angular/build:application".\n' +
      'See: https://angular.dev/tools/cli/build-system-migration',
    );
  }

  if (info.builderType === 'browser-esbuild') {
    throw new Error(
      'angular-grab requires the "application" builder, not the transitional "browser-esbuild" builder.\n' +
      'Please migrate from "@angular-devkit/build-angular:browser-esbuild" to "@angular/build:application".\n' +
      'See: https://angular.dev/tools/cli/build-system-migration',
    );
  }

  // 4. Install packages
  log('Installing packages...');
  const installCmd = getInstallCommand(info.packageManager);
  try {
    execSync(installCmd, {
      cwd: info.projectRoot,
      stdio: 'inherit',
    });
  } catch {
    warn('Package installation failed. You may need to install manually:');
    warn(`  ${installCmd}`);
    console.log('');
  }

  // 5. Modify angular.json
  log('Updating angular.json...');
  const jsonModified = modifyAngularJson(info.angularJsonPath, info.projectName);
  if (jsonModified) {
    log('  Swapped builders to angular-grab');
  } else {
    warn('  angular.json builders were already configured or could not be modified');
  }

  // 6. Try to add provideAngularGrab() to app config
  log('Updating app.config.ts...');
  const configModified = modifyAppConfig(info.projectRoot, info.sourceRoot);
  if (configModified) {
    log('  Added provideAngularGrab() to providers');
  } else {
    warn('  Could not modify app.config.ts (already configured or not found)');
    warn('  Please add manually:');
    warn("    import { provideAngularGrab } from '@githumbi/angular-grab/angular';");
    warn('    // then add provideAngularGrab() to your providers array');
  }

  // 7. Set up MCP server (.mcp.json)
  console.log('');
  await addMcp();

  console.log('');
  log('\x1b[32mDone!\x1b[0m angular-grab is ready.');
  console.log('');
  console.log('  Next steps:');
  console.log('    1. \x1b[1mRestart your editor\x1b[0m to activate the MCP connection');
  console.log('    2. Run \x1b[1mng serve\x1b[0m');
  console.log('    3. Hold \x1b[1mCmd+C\x1b[0m (Mac) or \x1b[1mCtrl+C\x1b[0m (Windows) and hover over elements');
  console.log('    4. Click to grab — your AI agent can query it immediately');
  console.log('');
}
