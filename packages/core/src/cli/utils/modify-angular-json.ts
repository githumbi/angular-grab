import { readFileSync, writeFileSync } from 'fs';

export function modifyAngularJson(angularJsonPath: string, projectName: string): boolean {
  const raw = readFileSync(angularJsonPath, 'utf8');
  const angularJson = JSON.parse(raw);

  const project = angularJson.projects?.[projectName];
  const targets = project?.architect || project?.targets;
  if (!targets) return false;

  let modified = false;

  const buildTarget = targets.build;
  if (buildTarget?.builder) {
    const currentBuilder: string = buildTarget.builder;
    if (
      currentBuilder === '@angular/build:application' ||
      currentBuilder === '@angular-devkit/build-angular:application'
    ) {
      buildTarget.builder = '@githumbi/angular-grab:application';
      modified = true;
    }
  }

  const serveTarget = targets.serve;
  if (serveTarget?.builder) {
    const currentBuilder: string = serveTarget.builder;
    if (
      currentBuilder === '@angular/build:dev-server' ||
      currentBuilder === '@angular-devkit/build-angular:dev-server'
    ) {
      serveTarget.builder = '@githumbi/angular-grab:dev-server';
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(angularJsonPath, JSON.stringify(angularJson, null, 2) + '\n', 'utf8');
  }

  return modified;
}
