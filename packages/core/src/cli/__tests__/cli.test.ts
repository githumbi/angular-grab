import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { findAngularJson, detectProject } from '../utils/detect-project';

describe('findAngularJson', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds angular.json in the given directory', () => {
    writeFileSync(join(tempDir, 'angular.json'), '{}');
    const result = findAngularJson(tempDir);
    expect(result).toBe(join(tempDir, 'angular.json'));
  });

  it('finds angular.json in a parent directory', () => {
    writeFileSync(join(tempDir, 'angular.json'), '{}');
    const subDir = join(tempDir, 'src', 'app');
    mkdirSync(subDir, { recursive: true });

    const result = findAngularJson(subDir);
    expect(result).toBe(join(tempDir, 'angular.json'));
  });

  it('returns null when no angular.json exists', () => {
    const result = findAngularJson(tempDir);
    expect(result).toBeNull();
  });
});

describe('detectProject', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeAngularJson(content: object): string {
    const path = join(tempDir, 'angular.json');
    writeFileSync(path, JSON.stringify(content));
    return path;
  }

  it('detects project name from angular.json', () => {
    const path = writeAngularJson({
      projects: {
        'my-app': {
          sourceRoot: 'src',
          architect: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.projectName).toBe('my-app');
  });

  it('detects "application" builder type', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.builderType).toBe('application');
  });

  it('detects "browser-esbuild" builder type', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@angular-devkit/build-angular:browser-esbuild' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.builderType).toBe('browser-esbuild');
  });

  it('detects "browser" builder type', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@angular-devkit/build-angular:browser' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.builderType).toBe('browser');
  });

  it('detects @githumbi/angular-grab:application as "application"', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@githumbi/angular-grab:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.builderType).toBe('application');
  });

  it('defaults sourceRoot to "src" when not specified', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.sourceRoot).toBe('src');
  });

  it('uses custom sourceRoot when specified', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          sourceRoot: 'projects/app/src',
          architect: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.sourceRoot).toBe('projects/app/src');
  });

  it('throws when no projects are found', () => {
    const path = writeAngularJson({ projects: {} });
    expect(() => detectProject(path)).toThrow('No projects found');
  });

  it('throws when no build target is found', () => {
    const path = writeAngularJson({
      projects: {
        app: { architect: {} },
      },
    });

    expect(() => detectProject(path)).toThrow('No build target found');
  });

  it('detects npm as default package manager', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.packageManager).toBe('npm');
  });

  it('detects pnpm when pnpm-lock.yaml exists', () => {
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.packageManager).toBe('pnpm');
  });

  it('detects yarn when yarn.lock exists', () => {
    writeFileSync(join(tempDir, 'yarn.lock'), '');
    const path = writeAngularJson({
      projects: {
        app: {
          architect: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.packageManager).toBe('yarn');
  });

  it('supports "targets" as an alternative to "architect"', () => {
    const path = writeAngularJson({
      projects: {
        app: {
          targets: {
            build: { builder: '@angular/build:application' },
          },
        },
      },
    });

    const info = detectProject(path);
    expect(info.builderType).toBe('application');
  });
});
