// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createGrabInstance } from '../grab';
import type { AngularGrabAPI } from '../types';

function dispatchEscape(target: EventTarget = document) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('Escape-to-deactivate', () => {
  let api: AngularGrabAPI;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    api = createGrabInstance({
      devOnly: false,
      persistHistory: false,
      mcpWebhook: false,
    });
  });

  it('Escape deactivates when active and no popover is open', () => {
    api.activate();
    expect(api.isActive()).toBe(true);
    dispatchEscape();
    expect(api.isActive()).toBe(false);
    api.dispose();
  });

  it('Escape is a no-op when not active', () => {
    expect(api.isActive()).toBe(false);
    dispatchEscape();
    expect(api.isActive()).toBe(false);
    api.dispose();
  });

  it('Escape does not deactivate when focus is in an input', () => {
    api.activate();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    dispatchEscape(input);
    expect(api.isActive()).toBe(true);
    api.dispose();
  });
});
