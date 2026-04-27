import VaultPilotPlugin from "../main"
import { registerNasVideoCommands } from "./nasVideo"
import { registerCanvasCommands } from "./smartMindmap"

export function registerCommands(plugin: VaultPilotPlugin) {
  registerNasVideoCommands(plugin)
  registerCanvasCommands(plugin)
}
