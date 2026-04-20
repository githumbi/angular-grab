import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export function modifyAppConfig(projectRoot: string, sourceRoot: string): boolean {
  const configPath = join(projectRoot, sourceRoot, 'app', 'app.config.ts');
  if (!existsSync(configPath)) return false;

  let content = readFileSync(configPath, 'utf8');

  // Skip if already has provideAngularGrab
  if (content.includes('provideAngularGrab')) return false;

  // Add import for provideAngularGrab
  const importStatement = "import { provideAngularGrab } from '@githumbi/angular-grab/angular';";

  // Find the last import block end by matching `from '...'` or `from "..."` lines
  const lines = content.split('\n');
  let lastImportEndIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('import ') || /\}\s*from\s+['"]/.test(trimmed) || /from\s+['"]/.test(trimmed)) {
      lastImportEndIndex = i;
    }
  }

  if (lastImportEndIndex >= 0) {
    lines.splice(lastImportEndIndex + 1, 0, importStatement);
    content = lines.join('\n');
  } else {
    content = importStatement + '\n' + content;
  }

  // Try to add provideAngularGrab() to the providers array
  const providersMatch = content.match(/providers\s*:\s*\[/);
  if (providersMatch && providersMatch.index != null) {
    const insertPos = providersMatch.index + providersMatch[0].length;
    content = content.slice(0, insertPos) + '\n    provideAngularGrab(),' + content.slice(insertPos);
  }

  writeFileSync(configPath, content, 'utf8');
  return true;
}
