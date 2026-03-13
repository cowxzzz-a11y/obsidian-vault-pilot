import { ItemView, Notice } from "obsidian"
import VaultPilotPlugin from "../main"
import { createSmartChildNode, createSmartSiblingNode, getActiveCanvasView } from "../features/smartMindmap"

export function registerCanvasCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "smart-create-canvas-child-node",
    name: "Canvas：智能创建子节点",
    callback: async () => {
      const view = getActiveCanvasView(plugin.app.workspace.getActiveViewOfType(ItemView))
      if (!view) {
        new Notice("Vault Pilot：请先打开 Canvas 白板")
        return
      }

      const created = await createSmartChildNode(view)
      if (!created) {
        new Notice("Vault Pilot：请先选中一个非编辑状态的节点")
      }
    },
  })

  plugin.addCommand({
    id: "smart-create-canvas-sibling-node",
    name: "Canvas：智能创建兄弟节点",
    callback: async () => {
      const view = getActiveCanvasView(plugin.app.workspace.getActiveViewOfType(ItemView))
      if (!view) {
        new Notice("Vault Pilot：请先打开 Canvas 白板")
        return
      }

      const created = await createSmartSiblingNode(view)
      if (!created) {
        new Notice("Vault Pilot：兄弟节点需要当前选中的是非根节点")
      }
    },
  })
}
