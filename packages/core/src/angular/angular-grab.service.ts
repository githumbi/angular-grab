import { init, createNoopApi } from '../core';
import type { AngularGrabAPI, AngularGrabOptions, Plugin } from '../core';
import { resolveComponent } from './resolvers/component-resolver';
import { resolveSource } from './resolvers/source-resolver';

declare const ngDevMode: boolean | undefined;

let instance: AngularGrabAPI | null = null;

/**
 * Initialize angular-grab. Registers Angular-specific component and source
 * resolvers, then returns the API handle. Idempotent — subsequent calls
 * return the same instance.
 */
export function initAngularGrab(options?: Partial<AngularGrabOptions>): AngularGrabAPI {
  if (instance) return instance;

  // No-op in production
  if (options?.devOnly !== false && typeof ngDevMode !== 'undefined' && !ngDevMode) {
    instance = createNoopApi();
    return instance;
  }

  instance = init(options);
  instance.setComponentResolver((el) => resolveComponent(el));
  instance.setSourceResolver((el) => resolveSource(el));

  return instance;
}

export function getAngularGrabApi(): AngularGrabAPI | null {
  return instance;
}

export function registerAngularGrabPlugin(plugin: Plugin): void {
  instance?.registerPlugin(plugin);
}

export function disposeAngularGrab(): void {
  instance?.dispose();
  instance = null;
}

