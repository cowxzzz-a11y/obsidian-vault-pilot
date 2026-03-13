import VaultPilotPlugin from "../main"
import { registerGitCommands } from "./quickPush"
import { registerNasVideoCommands } from "./nasVideo"
import { registerCanvasCommands } from "./smartMindmap"

export function registerCommands(plugin: VaultPilotPlugin) {
  registerNasVideoCommands(plugin)
  registerGitCommands(plugin)
  registerCanvasCommands(plugin)
}
