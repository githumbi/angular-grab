import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

export interface ProjectInfo {
  angularJsonPath: string;
  projectRoot: string;
  projectName: string;
  sourceRoot: string;
  builderType: 'application' | 'browser-esbuild' | 'browser';
  packageManager: 'pnpm' | 'yarn' | 'npm';
}

export function findAngularJson(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, 'angular.json');
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function detectProject(angularJsonPath: string): ProjectInfo {
  const projectRoot = dirname(angularJsonPath);
  const raw = readFileSync(angularJsonPath, 'utf8');
  const angularJson = JSON.parse(raw);

  const projects = angularJson.projects || {};
  const projectNames = Object.keys(projects);
  if (projectNames.length === 0) {
    throw new Error('No projects found in angular.json');
  }

  const projectName = projectNames[0];
  const project = projects[projectName];
  if (!project) {
    throw new Error(`Project "${projectName}" not found in angular.json`);
  }

  const sourceRoot = project.sourceRoot || 'src';
  const targets = project.architect || project.targets;
  const buildTarget = targets?.build;
  if (!buildTarget) {
    throw new Error(`No build target found for project "${projectName}"`);
  }

  const builder: string = buildTarget.builder || '';
  let builderType: ProjectInfo['builderType'];

  if (builder.includes(':application') || builder.includes('@githumbi/angular-grab:application')) {
    builderType = 'application';
  } else if (builder.includes(':browser-esbuild')) {
    builderType = 'browser-esbuild';
  } else if (builder.includes(':browser')) {
    builderType = 'browser';
  } else {
    builderType = 'application';
  }

  const packageManager = detectPackageManager(projectRoot);

  return {
    angularJsonPath,
    projectRoot,
    projectName,
    sourceRoot,
    builderType,
    packageManager,
  };
}

function detectPackageManager(root: string): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}
