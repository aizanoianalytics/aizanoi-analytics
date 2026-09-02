# Aizanoi Web Editor

Aizanoi Web Editor is the browser-local single-file web playground inside AizanoiOS.

## Contract

- Module id: `web-editor`
- Public entry: `src/index.js`
- Shared services arrive only through declared capabilities.
- New work is saved under the browser-local Workspace `Editor` folder as one self-contained `.html` file.
- HTML, CSS and JavaScript share the same source area; authors place CSS in `<style>` and JavaScript in `<script>` as normal HTML.
- Older three-file Web Editor project folders remain readable and are merged into one HTML document when opened; saving converts the work to the new single-file format without deleting the legacy folder.
- Preview code runs only inside a sandboxed iframe without `allow-same-origin`, `allow-popups`, forms, downloads or top-navigation privileges.
- The editor never uploads project source to the server.

## UX

The app uses the full available window body as a split authoring workspace: one compact action bar, one dark source pane and one live preview pane. There are no HTML/CSS/JavaScript tabs or duplicate internal title bars. `Ctrl/Cmd+Enter` runs the current document and `Ctrl/Cmd+S` saves it.

The preview route reports an explicit in-app error if its isolated runner cannot start. Production deployments must have the route-scoped Web Editor preview Nginx policy installed before promotion.
