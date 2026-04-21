import type { AngularGrabOptions, ToolbarState } from './types';

export interface GrabState {
  active: boolean;
  frozen: boolean;
  hoveredElement: Element | null;
  options: AngularGrabOptions;
  toolbar: ToolbarState;
}

export type StateListener = (state: GrabState, key: keyof GrabState) => void;

export interface Store {
  state: GrabState;
  subscribe(listener: StateListener): () => void;
}

export function createStore(initialOptions: AngularGrabOptions): Store {
  const listeners = new Set<StateListener>();

  const raw: GrabState = {
    active: false,
    frozen: false,
    hoveredElement: null,
    options: initialOptions,
    toolbar: {
      visible: initialOptions.showToolbar,
      themeMode: initialOptions.themeMode,
      history: [],
    },
  };

  const state = new Proxy(raw, {
    set(target, prop, value) {
      const key = prop as keyof GrabState;
      if (target[key] === value) return true;

      Reflect.set(target, key, value);
      listeners.forEach((fn) => fn(state, key));
      return true;
    },
  });

  return {
    state,
    subscribe(listener: StateListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
