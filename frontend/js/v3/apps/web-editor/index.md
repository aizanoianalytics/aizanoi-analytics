# Aizanoi Web Editor

Aizanoi Web Editor is the browser-local HTML/CSS/JavaScript playground inside AizanoiOS.

## Contract

- Module id: `web-editor`
- Public entry: `src/index.js`
- Shared services arrive only through declared capabilities.
- Projects are saved under the browser-local Workspace `Editor` folder as project folders containing `index.html`, `style.css`, and `script.js`.
- Preview code runs only inside a sandboxed iframe without `allow-same-origin`, `allow-popups`, or top-navigation privileges.
- The editor never uploads project source to the server.

## UX

The app exposes HTML, CSS, and JavaScript tabs, a manual Run action, New/Open/Save/Save As project actions, and a live preview pane. `Ctrl/Cmd+Enter` runs the current project and `Ctrl/Cmd+S` saves it.
