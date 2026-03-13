import { Notice } from "obsidian"
import VaultPilotPlugin from "../main"

export function registerCanvasCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "smart-create-canvas-child-node",
    name: "Canvas：智能创建子节点",
    callback: async () => {
      new Notice("Vault Pilot：Canvas 智能思维导图模块骨架已就位，后面会重做布局算法。")
    },
  })

  plugin.addCommand({
    id: "smart-create-canvas-sibling-node",
    name: "Canvas：智能创建兄弟节点",
    callback: async () => {
      new Notice("Vault Pilot：Canvas 智能思维导图模块骨架已就位，后面会重做布局算法。")
    },
  })
}
