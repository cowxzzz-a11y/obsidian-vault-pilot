import { Editor } from "obsidian"
import { CanvasData, CanvasTextData } from "obsidian/canvas"

export type VideoDimensions = {
  width: number
  height: number
}

type VideoSource =
  | {
      kind: "direct"
      url: string
    }
  | {
      kind: "bilibili"
      embedUrl: string
    }

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

function buildDirectVideoHtml(url: string, posterUrl?: string | null): string {
  const safeUrl = escapeHtmlAttribute(url)
  const posterAttr = posterUrl ? ` poster="${escapeHtmlAttribute(posterUrl)}"` : ""
  return `<div data-vault-pilot-node="video-direct" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; padding:8px; box-sizing:border-box;"><video controls playsinline preload="metadata"${posterAttr} style="display:block; width:100%; height:100%; border-radius:8px; background:#000; object-fit:contain;" src="${safeUrl}"></video></div>`
}

function buildBilibiliEmbedHtml(embedUrl: string): string {
  const safeUrl = escapeHtmlAttribute(embedUrl)
  return `<div data-vault-pilot-node="video-bilibili" style="position:relative; width:100%; padding-bottom:56.25%;"><iframe src="${safeUrl}" style="position:absolute; inset:0; width:100%; height:100%; border:0;" scrolling="no" allowfullscreen="true"></iframe></div>`
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function buildBilibiliPlayerUrl(
  identifier: { bvid: string } | { aid: string },
  page: number | null,
): string {
  const url = new URL("https://player.bilibili.com/player.html")

  if ("bvid" in identifier) {
    url.searchParams.set("bvid", identifier.bvid)
  } else {
    url.searchParams.set("aid", identifier.aid)
  }

  if (page && page > 1) {
    url.searchParams.set("page", String(page))
  }

  url.searchParams.set("danmaku", "false")
  return url.toString()
}

function resolveBilibiliSource(input: string): VideoSource | null {
  try {
    const url = new URL(input)
    const hostname = url.hostname.toLowerCase()

    if (hostname === "player.bilibili.com" && url.pathname.startsWith("/player.html")) {
      return {
        kind: "bilibili",
        embedUrl: url.toString(),
      }
    }

    if (!hostname.endsWith("bilibili.com")) {
      return null
    }

    const match = url.pathname.match(/\/video\/((?:BV[0-9A-Za-z]+)|(?:av\d+))/i)
    if (!match) {
      return null
    }

    const videoId = match[1]
    const page = parsePositiveInteger(url.searchParams.get("p"))

    if (/^BV/i.test(videoId)) {
      return {
        kind: "bilibili",
        embedUrl: buildBilibiliPlayerUrl({ bvid: videoId }, page),
      }
    }

    return {
      kind: "bilibili",
      embedUrl: buildBilibiliPlayerUrl({ aid: videoId.replace(/^av/i, "") }, page),
    }
  } catch {
    return null
  }
}

function resolveVideoSource(input: string): VideoSource {
  const trimmedInput = input.trim()
  return resolveBilibiliSource(trimmedInput) ?? { kind: "direct", url: trimmedInput }
}

export async function prepareVideoEmbed(
  input: string,
  extensions: string[],
): Promise<{
  html: string
  dimensions: VideoDimensions | null
}> {
  const source = resolveVideoSource(input)

  if (source.kind === "bilibili") {
    return {
      html: buildBilibiliEmbedHtml(source.embedUrl),
      dimensions: null,
    }
  }

  const [posterUrl, videoDimensions] = await Promise.all([
    detectPosterUrl(source.url, extensions),
    getVideoDimensions(source.url),
  ])

  return {
    html: buildDirectVideoHtml(source.url, posterUrl),
    dimensions: videoDimensions,
  }
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

export function insertHtmlIntoCanvas(
  view: CanvasViewLike,
  html: string,
  dimensions?: VideoDimensions | null,
): void {
  const canvas = view.canvas
  const selectedNode = canvas.selection.size === 1 ? Array.from(canvas.selection)[0] : null
  const x = selectedNode ? selectedNode.x + selectedNode.width + 80 : canvas.x + 80
  const y = selectedNode ? selectedNode.y : canvas.y + 80
  const nodeSize = calculateCanvasVideoNodeSize(dimensions)

  const data = canvas.getData()
  const nodeId = randomId()
  const node: CanvasTextData = {
    id: nodeId,
    x,
    y,
    width: nodeSize.width,
    height: nodeSize.height,
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

function calculateCanvasVideoNodeSize(dimensions?: VideoDimensions | null): VideoDimensions {
  const fallbackWidth = 760
  const shellPadding = 16

  if (!dimensions || !dimensions.width || !dimensions.height) {
    return {
      width: fallbackWidth,
      height: Math.round(fallbackWidth / (16 / 9) + shellPadding),
    }
  }

  const aspectRatio = dimensions.width / dimensions.height

  if (aspectRatio >= 1) {
    const width = Math.min(Math.max(dimensions.width, 640), 920)
    return {
      width,
      height: Math.round(width / aspectRatio + shellPadding),
    }
  }

  const height = Math.min(Math.max(dimensions.height, 480), 860)
  return {
    width: Math.round(height * aspectRatio),
    height: height + shellPadding,
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

function probeImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    const timeoutId = window.setTimeout(() => {
      image.src = ""
      resolve(false)
    }, 5000)

    image.onload = () => {
      window.clearTimeout(timeoutId)
      resolve(true)
    }
    image.onerror = () => {
      window.clearTimeout(timeoutId)
      resolve(false)
    }
    image.src = url
  })
}

export async function detectPosterUrl(
  videoUrl: string,
  extensions: string[],
): Promise<string | null> {
  const candidates = extensions
    .map((extension) => buildPosterCandidateUrl(videoUrl, extension))
    .filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (await probeImageUrl(candidate)) {
      return candidate
    }
  }

  return null
}

export function getVideoDimensions(url: string): Promise<VideoDimensions | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const timeoutId = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, 8000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeAttribute("src")
      video.load()
    }

    video.preload = "metadata"
    video.playsInline = true
    video.muted = true
    video.onloadedmetadata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      cleanup()
      resolve(width > 0 && height > 0 ? { width, height } : null)
    }
    video.onerror = () => {
      cleanup()
      resolve(null)
    }
    video.src = url
  })
}
