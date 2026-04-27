import { ItemView, Notice } from "obsidian"
import VaultPilotPlugin from "../main"
import { createSmartChildNode, createSmartSiblingNode, getActiveCanvasView } from "../features/smartMindmap"

export function registerCanvasCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "smart-create-canvas-child-node",
    name: "Canvas: create smart child node",
    callback: () => {
      const view = getActiveCanvasView(plugin.app.workspace.getActiveViewOfType(ItemView))
      if (!view) {
        new Notice("Vault Pilot: open a Canvas first")
        return
      }

      const created = createSmartChildNode(view)
      if (!created) {
        new Notice("Vault Pilot: select one node that is not being edited")
      }
    },
  })

  plugin.addCommand({
    id: "smart-create-canvas-sibling-node",
    name: "Canvas: create smart sibling node",
    callback: () => {
      const view = getActiveCanvasView(plugin.app.workspace.getActiveViewOfType(ItemView))
      if (!view) {
        new Notice("Vault Pilot: open a Canvas first")
        return
      }

      const created = createSmartSiblingNode(view)
      if (!created) {
        new Notice("Vault Pilot: select a non-root node first")
      }
    },
  })
}
