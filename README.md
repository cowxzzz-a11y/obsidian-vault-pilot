# Vault Pilot

Vault Pilot is an Obsidian plugin for Canvas mind mapping and media-heavy notes.

## Features

- Create smart child and sibling nodes in Canvas.
- Automatically relayout connected Canvas nodes as a tree.
- Resize text Canvas nodes after editing and preview changes.
- Insert video links into Markdown notes.
- Create video cards directly in Canvas.
- Try configured poster image extensions when inserting Alist or NAS video links.

## Commands

- `Insert video link`
- `Canvas: create smart child node`
- `Canvas: create smart sibling node`

## Settings

Vault Pilot currently provides one setting:

- `Poster extension priority`: comma-separated image extensions to try when looking for video poster images, such as `png,jpg,webp`.

## Manual installation

Copy these files into `.obsidian/plugins/vault-pilot/`:

- `main.js`
- `manifest.json`
- `styles.css`

Then enable Vault Pilot from `Settings -> Community plugins -> Installed plugins`.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## License

MIT
