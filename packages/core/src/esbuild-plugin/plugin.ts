import type { Plugin } from 'esbuild';
import { scanComponentSources } from './scan';

export function angularGrabEsbuildPlugin(options?: {
  rootDir?: string;
  /** Set to false to disable the transform (e.g., in production). Default: true */
  enabled?: boolean;
}): Plugin {
  return {
    name: 'angular-grab',
    setup(build) {
      if (options?.enabled === false) return;

      const rootDir = options?.rootDir || process.cwd();
      const sourceMap = scanComponentSources(rootDir);

      if (Object.keys(sourceMap).length === 0) return;

      // Inject the source map as a global variable via banner
      const json = JSON.stringify(sourceMap);
      const existingBanner = build.initialOptions.banner;
      const bannerObj = typeof existingBanner === 'object' ? existingBanner : {};
      const existingJs = bannerObj.js || '';
      build.initialOptions.banner = {
        ...bannerObj,
        js: `globalThis.__ANGULAR_GRAB_SOURCE_MAP__=${json};${existingJs}`,
      };
    },
  };
}
