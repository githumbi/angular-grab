# angular-grab

> Grab any element in your Angular app and give it to AI coding agents

Point at any element and press **Cmd+C** (Mac) or **Ctrl+C** (Windows/Linux) to copy the component name, file path, and HTML source code to your clipboard. Paste it into Claude, ChatGPT, Copilot, or any AI coding agent for instant context.

## Install

```bash
npx @githumbi/angular-grab init
```

Or manually:

```bash
npm install @githumbi/angular-grab
```

Then add the provider to your app config:

```typescript
import { provideAngularGrab } from '@githumbi/angular-grab/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAngularGrab(),
  ],
};
```

And update `angular.json` to use the angular-grab builders:

```json
{
  "architect": {
    "build": {
      "builder": "@githumbi/angular-grab:application"
    },
    "serve": {
      "builder": "@githumbi/angular-grab:dev-server"
    }
  }
}
```

## Usage

Once installed, hover over any UI element in your browser and press:

- **Cmd+C** on Mac
- **Ctrl+C** on Windows/Linux

This copies the element's context to your clipboard:

```
<button class="submit-btn">Save</button>
in SubmitButtonComponent at src/app/submit-button/submit-button.component.ts:12
in FormComponent at src/app/form/form.component.ts:8
in AppComponent at src/app/app.component.ts:5
```

The output includes the cleaned HTML, the full Angular component stack trace, and source file locations.

## Features

- **Element selection** via keyboard shortcut or floating toolbar
- **Component stack trace** -- full Angular component ancestor chain with file paths
- **Open in VS Code** -- click file paths in the toast to open at the exact line
- **Freeze mode** -- press **F** during selection to freeze the page and grab tooltips, dropdowns, and hover menus
- **Floating toolbar** with selection, history, and enable controls
- **History** of previously grabbed elements with one-click re-copy; persists across page refreshes via localStorage
- **Light-only theme** for all UI
- **Plugin system** for custom actions, hooks, and theme overrides
- **Crosshair guidelines** during selection mode
- **Zero production impact** -- automatically disabled outside dev mode

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+C / Ctrl+C (hold) | Activate selection mode |
| Click | Select element and copy |
| F (during selection) | Toggle freeze mode |
| Escape | Cancel comment popover |

## Configuration

```typescript
provideAngularGrab({
  activationKey: 'Meta+C',       // Keyboard shortcut
  activationMode: 'hold',        // 'hold' or 'toggle'
  keyHoldDuration: 0,            // ms to hold before activating
  maxContextLines: 20,           // Max HTML lines in clipboard
  enabled: true,                 // Master switch
  enableInInputs: false,         // Allow in input/textarea
  devOnly: true,                 // Only active in dev mode
  showToolbar: true,             // Show floating toolbar
  themeMode: 'light',            // only 'light' is supported
  persistHistory: true,          // persist history across page refresh
});
```

## Toolbar

The floating toolbar provides quick access to core features without keyboard shortcuts:

| Button | Action |
|--------|--------|
| Hand | Toggle selection mode |
| Clock | Show grab history (one-click re-copy, clear all) |
| Power | Enable/disable angular-grab |
| X | Dismiss toolbar |

The grab flow is: hover → click → enter a comment → copy. Past grabs are listed in the history popover (clock icon) where you can re-copy (Copy all), clear them (Clear all), or click any entry to edit its comment.

Dismissing the toolbar doesn't disable angular-grab -- keyboard shortcuts still work, and activating selection mode brings the toolbar back.

## Plugin system

```typescript
import { registerAngularGrabPlugin } from '@githumbi/angular-grab/angular';

registerAngularGrabPlugin({
  name: 'my-plugin',
  hooks: {
    onElementSelect(context) {
      console.log('Selected:', context.selector);
    },
    onCopySuccess(text, context) {
      console.log('Copied:', context.componentName);
    },
    transformCopyContent(text, context) {
      return `// From ${context.componentName}\n${text}`;
    },
  },
});
```

### Plugin hooks

| Hook | Description |
|------|-------------|
| `onActivate` | Selection mode activated |
| `onDeactivate` | Selection mode deactivated |
| `onElementHover` | Mouse hovers over an element |
| `onElementSelect` | Element is selected |
| `onBeforeCopy` | About to copy to clipboard |
| `onCopySuccess` | Successfully copied |
| `onCopyError` | Copy failed |
| `transformCopyContent` | Transform clipboard text before copying |

### Plugin theme overrides

```typescript
registerAngularGrabPlugin({
  name: 'custom-theme',
  theme: {
    overlayBorderColor: '#10b981',
    overlayBgColor: 'rgba(16, 185, 129, 0.1)',
    toolbarBgColor: '#1a1a2e',
    toolbarAccentColor: '#10b981',
  },
});
```

## API

Access the API programmatically via Angular's dependency injection:

```typescript
import { inject } from '@angular/core';
import { ANGULAR_GRAB_API } from '@githumbi/angular-grab/angular';

const api = inject(ANGULAR_GRAB_API);
api.activate();
```

### `AngularGrabAPI`

| Method | Description |
|--------|-------------|
| `activate()` | Enter selection mode |
| `deactivate()` | Exit selection mode |
| `toggle()` | Toggle selection mode |
| `isActive()` | Check if selection mode is active |
| `setOptions(opts)` | Update options |
| `registerPlugin(plugin)` | Register a plugin |
| `unregisterPlugin(name)` | Remove a plugin |
| `setComponentResolver(fn)` | Custom component resolver |
| `setSourceResolver(fn)` | Custom source file resolver |
| `showToolbar()` | Show the floating toolbar |
| `hideToolbar()` | Hide the floating toolbar |
| `setThemeMode(mode)` | Retained for API compatibility; library is light-only |
| `getHistory()` | Get grab history entries |
| `clearHistory()` | Clear grab history |
| `dispose()` | Clean up everything |

## Subpath exports

The `@githumbi/angular-grab` package provides subpath exports for different build tool integrations:

| Import | Description |
|--------|-------------|
| `@githumbi/angular-grab` | Core picker engine and types |
| `@githumbi/angular-grab/angular` | Angular integration (providers, services, resolvers) |
| `@githumbi/angular-grab/esbuild` | esbuild plugin for source location injection |
| `@githumbi/angular-grab/vite` | Vite plugin for source location injection |
| `@githumbi/angular-grab/webpack` | Webpack plugin for source location injection |
| `@githumbi/angular-grab/builder` | Angular CLI custom builders |
| `@githumbi/angular-grab/global` | IIFE browser bundle |

## MCP server (AI agent integration)

Connect angular-grab to AI coding agents like Claude Code, Cursor, or Windsurf so they can query your grabbed elements directly — no copy-pasting required.

Run this in your project root:

```bash
npx @githumbi/angular-grab add mcp
```

This writes a `.mcp.json` file to your project root. That file is the standard MCP config format read by Claude Code, Cursor, Windsurf, and other MCP-compatible editors. Commit it so teammates get the same setup, then restart your editor.

For a Claude Code global (user-level) install instead:

```bash
claude mcp add angular-grab -- npx -y @githumbi/angular-grab-mcp@latest
```

See [@githumbi/angular-grab-mcp](./packages/mcp-server) for the full setup guide, Docker option, and available MCP tools.

## License

MIT
