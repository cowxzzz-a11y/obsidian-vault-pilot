import { Editor } from "obsidian"
import { CanvasData, CanvasTextData } from "obsidian/canvas"

type CanvasNodeLike = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type CanvasLike = {
  x: number
  y: number
  selection: Set<CanvasNodeLike>
  nodes?: Map<string, CanvasNodeLike>
  getData(): CanvasData
  importData(data: CanvasData): void
  requestFrame(): void
  requestSave(save?: boolean, triggerBySelf?: boolean): void
  deselectAll(): void
  selectOnly(node: CanvasNodeLike): void
  zoomToSelection(): void
}

type CanvasViewLike = {
  canvas: CanvasLike
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function randomId(length = 16): string {
  const chars = "0123456789abcdef"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function buildNasVideoHtml(url: string, posterUrl?: string | null): string {
  const safeUrl = escapeHtmlAttribute(url)
  const posterAttr = posterUrl ? ` poster="${escapeHtmlAttribute(posterUrl)}"` : ""
  return `<video controls playsinline preload="metadata"${posterAttr} style="width:100%; border-radius:8px;" src="${safeUrl}"></video>`
}

export function insertHtmlIntoMarkdown(editor: Editor, html: string): void {
  const block = `${html}\n`
  if (editor.somethingSelected()) {
    editor.replaceSelection(block)
    return
  }

  const cursor = editor.getCursor()
  editor.replaceRange(block, cursor)
}

export function insertHtmlIntoCanvas(view: CanvasViewLike, html: string): void {
  const canvas = view.canvas
  const selectedNode = canvas.selection.size === 1 ? Array.from(canvas.selection)[0] : null
  const x = selectedNode ? selectedNode.x + selectedNode.width + 80 : canvas.x + 80
  const y = selectedNode ? selectedNode.y : canvas.y + 80

  const data = canvas.getData()
  const nodeId = randomId()
  const node: CanvasTextData = {
    id: nodeId,
    x,
    y,
    width: 520,
    height: 140,
    type: "text",
    text: html,
  }

  canvas.importData({
    nodes: [...data.nodes, node],
    edges: data.edges,
  })
  canvas.requestFrame()
  canvas.requestSave()

  const createdNode = canvas.nodes?.get(nodeId)
  if (createdNode) {
    canvas.deselectAll()
    canvas.selectOnly(createdNode)
    canvas.zoomToSelection()
  }
}

function buildPosterCandidateUrl(videoUrl: string, extension: string): string | null {
  try {
    const url = new URL(videoUrl)
    const path = url.pathname
    const lastSlashIndex = path.lastIndexOf("/")
    const directory = lastSlashIndex >= 0 ? path.slice(0, lastSlashIndex + 1) : "/"
    const fileName = lastSlashIndex >= 0 ? path.slice(lastSlashIndex + 1) : path
    const basename = fileName.replace(/\.[^.]+$/u, "")

    if (!basename || basename === fileName) return null

    url.pathname = `${directory}covers/${basename}.${extension.replace(/^\./u, "")}`
    return url.toString()
  } catch {
    return null
  }
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" })
    if (response.ok) return true
  } catch {
    // ignore HEAD failures and fall through
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    })
    return response.ok || response.status === 206
  } catch {
    return false
  }
}

export async function detectPosterUrl(
  videoUrl: string,
  extensions: string[],
): Promise<string | null> {
  const candidates = extensions
    .map((extension) => buildPosterCandidateUrl(videoUrl, extension))
    .filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (await urlExists(candidate)) {
      return candidate
    }
  }

  return null
}