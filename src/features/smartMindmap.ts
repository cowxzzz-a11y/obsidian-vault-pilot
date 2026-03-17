import { App, ItemView, MarkdownFileInfo, Plugin, debounce, editorInfoField } from "obsidian"
import { EditorView } from "@codemirror/view"
import { CanvasData, CanvasTextData } from "obsidian/canvas"

const MIN_NODE_WIDTH = 180
const MIN_NODE_HEIGHT = 56
const MAX_NODE_WIDTH = 960
const NODE_HORIZONTAL_PADDING = 72
const NODE_VERTICAL_PADDING = 10
const HORIZONTAL_GAP = 220
const VERTICAL_GAP = 36
const URL_VISUAL_LIMIT = 36
const DEFAULT_LINE_HEIGHT = 24
const PREVIEW_RESYNC_DELAYS = [0, 32, 120, 260, 520, 1000, 2000]
const PREVIEW_HEIGHT_BUFFER = 8

const manualNodeSizeOverrides = new Map<string, { width: number; height: number; text: string }>()
const autoResizingNodeIds = new Set<string>()
const pendingPreviewResyncs = new Map<string, number[]>()
const pendingManualRelayouts = new Map<string, number>()

type CanvasLeafLike = {
  view?: ItemView
}

type CanvasEditorInfoLike = MarkdownFileInfo & {
  node?: CanvasNodeLike
  containerEl?: HTMLElement
}

type CanvasNodeLike = {
  id: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  isEditing?: boolean
  nodeEl?: HTMLElement
  getData?: () => Record<string, unknown>
  setData?: (data: Record<string, unknown>, addHistory?: boolean) => void
  render?: () => void
  child?: {
    text?: string
    editMode?: {
      cm?: {
        dom?: HTMLElement
      }
    }
    previewMode?: {
      renderer?: {
        previewEl?: HTMLElement & { isShown?: () => boolean }
      }
    }
  }
  canvas?: CanvasLike
  moveTo(position: { x: number; y: number }): void
  resize(size: { width: number; height: number }): void
  startEditing(): void
  setIsEditing?: (editing: boolean, ...args: unknown[]) => void
}

type CanvasEdgeLike = {
  from: { node: CanvasNodeLike; side: string }
  to: { node: CanvasNodeLike; side: string }
}

type CanvasLike = {
  x: number
  y: number
  readonly: boolean
  nodes: Map<string, CanvasNodeLike>
  selection: Set<CanvasNodeLike>
  getData(): CanvasData
  importData(data: CanvasData): void
  getEdgesForNode(node: CanvasNodeLike): CanvasEdgeLike[]
  requestFrame(): void
  requestSave(save?: boolean, triggerBySelf?: boolean): void
  deselectAll(): void
  selectOnly(node: CanvasNodeLike): void
  zoomToSelection(): void
}

export type CanvasViewLike = {
  canvas: CanvasLike
}

type TreeNode = {
  node: CanvasNodeLike
  children: TreeNode[]
  subtreeWidth: number
  subtreeHeight: number
  x: number
  y: number
}

function randomId(length = 16): string {
  const chars = "0123456789abcdef"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function getActiveCanvasView(view: ItemView | null): CanvasViewLike | null {
  if (!view || view.getViewType() !== "canvas") return null
  return view as unknown as CanvasViewLike
}

function addEdge(canvas: CanvasLike, fromNode: CanvasNodeLike, toNode: CanvasNodeLike): void {
  const data = canvas.getData()
  canvas.importData({
    nodes: data.nodes,
    edges: [
      ...data.edges,
      {
        id: randomId(),
        fromNode: fromNode.id,
        fromSide: "right",
        toNode: toNode.id,
        toSide: "left",
      },
    ],
  })
}

function createTextNode(
  canvas: CanvasLike,
  x: number,
  y: number,
  width: number,
  height: number,
): CanvasNodeLike | null {
  const data = canvas.getData()
  const nodeId = randomId()
  const node: CanvasTextData = {
    id: nodeId,
    x,
    y,
    width,
    height,
    type: "text",
    text: "",
  }

  canvas.importData({
    nodes: [...data.nodes, node],
    edges: data.edges,
  })
  canvas.requestFrame()
  return canvas.nodes.get(nodeId) ?? null
}

function getParentNode(canvas: CanvasLike, node: CanvasNodeLike): CanvasNodeLike | null {
  const incoming = canvas.getEdgesForNode(node).find((edge) => edge.to.node.id === node.id)
  return incoming?.from.node ?? null
}

function getChildNodes(canvas: CanvasLike, node: CanvasNodeLike): CanvasNodeLike[] {
  return canvas
    .getEdgesForNode(node)
    .filter((edge) => edge.from.node.id === node.id && edge.to.side === "left")
    .map((edge) => edge.to.node)
    .sort((a, b) => a.y - b.y)
}

function getLastChildNode(canvas: CanvasLike, node: CanvasNodeLike): CanvasNodeLike | null {
  const children = getChildNodes(canvas, node)
  return children.length > 0 ? children[children.length - 1] : null
}

function getRootNode(canvas: CanvasLike, node: CanvasNodeLike): CanvasNodeLike {
  let current = node
  let parent = getParentNode(canvas, current)

  while (parent) {
    current = parent
    parent = getParentNode(canvas, current)
  }

  return current
}

function buildTree(canvas: CanvasLike, node: CanvasNodeLike): TreeNode {
  const children = getChildNodes(canvas, node).map((child) => buildTree(canvas, child))
  return {
    node,
    children,
    subtreeWidth: node.width,
    subtreeHeight: node.height,
    x: node.x,
    y: node.y,
  }
}

function measureTree(tree: TreeNode): void {
  if (tree.children.length === 0) {
    tree.subtreeWidth = tree.node.width
    tree.subtreeHeight = tree.node.height
    return
  }

  tree.children.forEach(measureTree)
  tree.subtreeWidth =
    tree.node.width + HORIZONTAL_GAP + Math.max(...tree.children.map((child) => child.subtreeWidth))
  tree.subtreeHeight = Math.max(
    tree.node.height,
    tree.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
      VERTICAL_GAP * (tree.children.length - 1),
  )
}

function positionTree(tree: TreeNode, left: number, top: number): void {
  tree.x = left
  tree.y = top + (tree.subtreeHeight - tree.node.height) / 2

  if (tree.children.length === 0) return

  let childTop =
    top +
    (tree.subtreeHeight -
      (tree.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
        VERTICAL_GAP * (tree.children.length - 1))) /
      2
  const childLeft = left + tree.node.width + HORIZONTAL_GAP

  for (const child of tree.children) {
    positionTree(child, childLeft, childTop)
    childTop += child.subtreeHeight + VERTICAL_GAP
  }
}

function applyTree(tree: TreeNode): void {
  tree.node.moveTo({ x: tree.x, y: tree.y })
  tree.children.forEach(applyTree)
}

function relayoutFromRoot(canvas: CanvasLike, root: CanvasNodeLike): void {
  const tree = buildTree(canvas, root)
  measureTree(tree)
  positionTree(tree, root.x, root.y - (tree.subtreeHeight - root.height) / 2)
  applyTree(tree)
  canvas.requestSave()
}

const debouncedCanvasRelayout = debounce(
  (canvas: CanvasLike, node: CanvasNodeLike) => {
    const root = getRootNode(canvas, node)
    relayoutFromRoot(canvas, root)
  },
  150,
  false,
)

function focusNode(canvas: CanvasLike, node: CanvasNodeLike): void {
  canvas.deselectAll()
  canvas.selectOnly(node)
  canvas.zoomToSelection()
  window.setTimeout(() => node.startEditing(), 50)
}

function getNodeTextSnapshot(node: CanvasNodeLike): string {
  return node.text ?? ""
}

function setManualNodeSizeOverride(node: CanvasNodeLike): void {
  manualNodeSizeOverrides.set(node.id, {
    width: node.width,
    height: node.height,
    text: getNodeTextSnapshot(node),
  })
}

function clearManualNodeSizeOverride(node: CanvasNodeLike): void {
  manualNodeSizeOverrides.delete(node.id)
}

function hasActiveManualNodeSizeOverride(node: CanvasNodeLike): boolean {
  void node
  return false
}

function clearPendingPreviewResyncs(nodeId: string): void {
  const timers = pendingPreviewResyncs.get(nodeId)
  if (!timers) return
  for (const timer of timers) {
    window.clearTimeout(timer)
  }
  pendingPreviewResyncs.delete(nodeId)
}

function scheduleFollowupRelayout(node: CanvasNodeLike, canvas: CanvasLike): void {
  const existingTimer = pendingManualRelayouts.get(node.id)
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer)
  }

  const timer = window.setTimeout(() => {
    pendingManualRelayouts.delete(node.id)
    if (!node.canvas) return
    const root = getRootNode(canvas, node)
    relayoutFromRoot(canvas, root)
  }, 180)

  pendingManualRelayouts.set(node.id, timer)
}

function patchResizePrototype(
  plugin: Plugin,
  target: Record<string, unknown>,
  methodName: "resize" | "moveAndResize",
): void {
  const original = target[methodName]
  if (typeof original !== "function") return
  if ((original as { __vaultPilotPatched?: boolean }).__vaultPilotPatched) return

  const wrapped = function (this: CanvasNodeLike, ...args: unknown[]) {
    const widthBefore = this.width
    const heightBefore = this.height
    const result = (original as (...innerArgs: unknown[]) => unknown).apply(this, args)
    const changed = widthBefore !== this.width || heightBefore !== this.height

    if (changed && this.canvas) {
      if (!autoResizingNodeIds.has(this.id)) {
        setManualNodeSizeOverride(this)
        scheduleFollowupRelayout(this, this.canvas)
      }
      debouncedCanvasRelayout(this.canvas, this)
    }

    return result
  } as typeof original & { __vaultPilotPatched?: boolean }

  wrapped.__vaultPilotPatched = true
  target[methodName] = wrapped

  plugin.register(() => {
    if (target[methodName] === wrapped) {
      target[methodName] = original
    }
  })
}

function patchEditingStatePrototype(plugin: Plugin, target: Record<string, unknown>): void {
  const original = target.setIsEditing
  if (typeof original !== "function") return
  if ((original as { __vaultPilotPatched?: boolean }).__vaultPilotPatched) return

  const wrapped = function (this: CanvasNodeLike, ...args: unknown[]) {
    const result = (original as (...innerArgs: unknown[]) => unknown).apply(this, args)
    const editing = typeof args[0] === "boolean" ? args[0] : (this.isEditing ?? false)

    if (this.canvas) {
      handleNodeEditingStateChange(this, this.canvas, Boolean(editing))
    }

    return result
  } as typeof original & { __vaultPilotPatched?: boolean }

  wrapped.__vaultPilotPatched = true
  target.setIsEditing = wrapped

  plugin.register(() => {
    if (target.setIsEditing === wrapped) {
      target.setIsEditing = original
    }
  })
}

function ensureCanvasNodePrototypePatched(
  plugin: Plugin,
  node: CanvasNodeLike | null | undefined,
): void {
  if (!node) return

  const nodeProto = Object.getPrototypeOf(node) as Record<string, unknown> | null
  if (nodeProto) {
    patchResizePrototype(plugin, nodeProto, "resize")
    patchEditingStatePrototype(plugin, nodeProto)
  }

  const parentProto = nodeProto
    ? (Object.getPrototypeOf(nodeProto) as Record<string, unknown> | null)
    : null
  if (parentProto) {
    patchResizePrototype(plugin, parentProto, "moveAndResize")
  }
}

function patchExistingCanvasNodes(plugin: Plugin & { app: App }): void {
  const canvasLeaves = plugin.app.workspace.getLeavesOfType("canvas") as unknown as CanvasLeafLike[]
  for (const leaf of canvasLeaves) {
    const view = getActiveCanvasView((leaf.view ?? null) as ItemView | null)
    const firstNode = view ? Array.from(view.canvas.nodes.values())[0] : null
    ensureCanvasNodePrototypePatched(plugin, firstNode)
  }
}

export async function createSmartChildNode(canvasView: CanvasViewLike): Promise<boolean> {
  const canvas = canvasView.canvas
  if (canvas.readonly || canvas.selection.size !== 1) return false

  const parent = Array.from(canvas.selection)[0]
  if (parent.isEditing) return false
  const lastChild = getLastChildNode(canvas, parent)
  const childY = lastChild ? lastChild.y + lastChild.height + VERTICAL_GAP : parent.y

  const child = createTextNode(
    canvas,
    parent.x + parent.width + HORIZONTAL_GAP,
    childY,
    MIN_NODE_WIDTH,
    MIN_NODE_HEIGHT,
  )

  if (!child) return false

  ensureCanvasNodePrototypePatched({ register: () => undefined } as unknown as Plugin, child)
  addEdge(canvas, parent, child)
  const root = getRootNode(canvas, parent)
  relayoutFromRoot(canvas, root)
  focusNode(canvas, child)
  return true
}

export async function createSmartSiblingNode(canvasView: CanvasViewLike): Promise<boolean> {
  const canvas = canvasView.canvas
  if (canvas.readonly || canvas.selection.size !== 1) return false

  const selected = Array.from(canvas.selection)[0]
  if (selected.isEditing) return false

  const parent = getParentNode(canvas, selected)
  if (!parent) return false

  const sibling = createTextNode(
    canvas,
    selected.x,
    selected.y + selected.height + VERTICAL_GAP,
    MIN_NODE_WIDTH,
    MIN_NODE_HEIGHT,
  )

  if (!sibling) return false

  ensureCanvasNodePrototypePatched({ register: () => undefined } as unknown as Plugin, sibling)
  addEdge(canvas, parent, sibling)
  const root = getRootNode(canvas, parent)
  relayoutFromRoot(canvas, root)
  focusNode(canvas, sibling)
  return true
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const editable = target.closest(
    "input, textarea, [contenteditable='true'], .cm-content, .canvas-node-content.is-editing, .canvas-node.is-editing",
  )
  return Boolean(editable)
}

function isCanvasInteractionTarget(view: CanvasViewLike, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const container = (view as unknown as { contentEl?: HTMLElement }).contentEl
  return container ? container.contains(target) : true
}

async function runSmartShortcut(app: App, key: "Tab" | "Enter"): Promise<boolean> {
  const view = getActiveCanvasView(app.workspace.getActiveViewOfType(ItemView))
  if (!view) return false

  if (key === "Tab") {
    return createSmartChildNode(view)
  }

  return createSmartSiblingNode(view)
}

export function registerSmartMindmapHotkeys(plugin: Plugin & { app: App }): void {
  plugin.registerDomEvent(document, "keydown", (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key !== "Tab" && event.key !== "Enter") return
    if (isEditableTarget(event.target)) return

    const view = getActiveCanvasView(plugin.app.workspace.getActiveViewOfType(ItemView))
    if (!view) return
    if (!isCanvasInteractionTarget(view, event.target)) return

    event.preventDefault()
    void runSmartShortcut(plugin.app, event.key)
  })
}

function getVisualLineLength(text: string): number {
  let length = 0
  for (const char of text) {
    length +=
      /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(
        char,
      )
        ? 2
        : 1
  }
  return length
}

function truncateUrlForSizing(url: string): string {
  if (url.length <= URL_VISUAL_LIMIT) return url
  return `${url.slice(0, URL_VISUAL_LIMIT - 1)}…`
}

function normalizeTextForSizing(text: string, preserveMarkdown = false): string {
  let result = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\u00A0/g, " ")

  if (!preserveMarkdown) {
    result = result
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/<((?:https?:\/\/|obsidian:\/\/)[^>\s]+)>/g, (_match, url: string) =>
        truncateUrlForSizing(url),
      )
      .replace(/(?:https?:\/\/|obsidian:\/\/)[^\s)]+/g, (url) => truncateUrlForSizing(url))
      .replace(/`([^`]+)`/g, "$1")
  }

  return result
    .replace(/\t/g, "  ")
    .replace(/[ \t]+$/gm, "")
    .replace(/(?:\r?\n[ \t]*){2,}$/g, "")
}

function splitVisibleLines(text: string, preserveMarkdown = false): string[] {
  const normalized = normalizeTextForSizing(text, preserveMarkdown)
  const lines = normalized.split(/\r?\n/)
  return lines.length > 0 ? lines : [""]
}

function getLineHeightFromElement(element: HTMLElement | null | undefined): number {
  if (!element) return DEFAULT_LINE_HEIGHT
  const computed = window.getComputedStyle(element)
  const parsed = Number.parseFloat(computed.lineHeight)
  if (Number.isFinite(parsed)) return parsed

  const fontSize = Number.parseFloat(computed.fontSize)
  if (Number.isFinite(fontSize)) return fontSize * 1.5
  return DEFAULT_LINE_HEIGHT
}

function getCharacterWidthFromElement(element: HTMLElement | null | undefined): number {
  if (!element) return 8
  const computed = window.getComputedStyle(element)
  const fontSize = Number.parseFloat(computed.fontSize)
  if (Number.isFinite(fontSize)) return Math.max(fontSize * 0.6, 8)
  return 8
}

function estimateNodeSizeFromText(
  text: string,
  characterWidth: number,
  lineHeight: number,
  preserveMarkdown = false,
): { width: number; height: number } {
  const lines = splitVisibleLines(text, preserveMarkdown)
  const longestLineLength = lines.reduce(
    (longest, line) => Math.max(longest, getVisualLineLength(line)),
    0,
  )
  const width = Math.min(
    Math.max(
      Math.ceil(longestLineLength * characterWidth + NODE_HORIZONTAL_PADDING),
      MIN_NODE_WIDTH,
    ),
    MAX_NODE_WIDTH,
  )

  const availableWidth = Math.max(width - NODE_HORIZONTAL_PADDING, characterWidth)
  const charsPerLine = Math.max(1, Math.floor(availableWidth / Math.max(characterWidth, 1)))
  const wrappedLineCount = lines.reduce((count, line) => {
    const visualLength = getVisualLineLength(line)
    return count + Math.max(1, Math.ceil(visualLength / charsPerLine))
  }, 0)

  const height = Math.max(
    Math.ceil(wrappedLineCount * lineHeight + NODE_VERTICAL_PADDING),
    MIN_NODE_HEIGHT,
  )
  return { width, height }
}

function getNormalizedVisibleLines(text: string): string[] {
  const normalized = normalizeTextForSizing(text)
  const trimmed = normalized.replace(/(?:\r?\n[ \t]*)+$/g, "")
  return (trimmed.length > 0 ? trimmed : normalized).split(/\r?\n/)
}

function getSuspiciousPreviewHeightLimit(text: string, lineHeight: number): number {
  const lines = getNormalizedVisibleLines(text)
  const lineCount = Math.max(lines.length, 1)
  const blankLineCount = lines.filter((line) => line.trim().length === 0).length
  return Math.ceil(
    lineCount * lineHeight + blankLineCount * lineHeight + NODE_VERTICAL_PADDING + lineHeight * 2,
  )
}

function calculateNodeSizeFromEditor(view: EditorView): { width: number; height: number } {
  const text = view.state.doc.toString()
  const characterWidth = Math.max(view.defaultCharacterWidth, 8)
  const lineHeight =
    (view as EditorView & { defaultLineHeight?: number }).defaultLineHeight ?? DEFAULT_LINE_HEIGHT
  return estimateNodeSizeFromText(text, characterWidth, lineHeight, true)
}

function calculateNodeSizeFromContainer(
  containerEl: HTMLElement,
  node?: CanvasNodeLike | null,
): { width: number; height: number } | null {
  const contentEl = containerEl.querySelector<HTMLElement>(".cm-content")
  const previewEl = containerEl.querySelector<HTMLElement>(
    ".markdown-preview-view, .markdown-rendered",
  )
  const measureEl = previewEl ?? contentEl ?? containerEl
  const rawText =
    previewEl?.innerText ?? contentEl?.innerText ?? node?.text ?? containerEl.innerText

  if (!rawText.trim()) {
    return {
      width: MIN_NODE_WIDTH,
      height: MIN_NODE_HEIGHT,
    }
  }

  const isEditorMode = Boolean(contentEl && !previewEl)
  return estimateNodeSizeFromText(
    rawText,
    getCharacterWidthFromElement(measureEl),
    getLineHeightFromElement(measureEl),
    isEditorMode,
  )
}

function calculateEditingDomSizeFromContainer(
  containerEl: HTMLElement,
): { width: number; height: number } | null {
  const contentEl = containerEl.querySelector<HTMLElement>(".cm-content")
  if (!contentEl) return null

  const scrollerEl =
    containerEl.querySelector<HTMLElement>(".cm-scroller") ??
    contentEl.closest<HTMLElement>(".cm-scroller")
  const lineHeight = getLineHeightFromElement(contentEl)
  const rawWidth = Math.max(contentEl.scrollWidth, scrollerEl?.scrollWidth ?? 0)
  const rawHeight = Math.max(contentEl.scrollHeight, scrollerEl?.scrollHeight ?? 0)

  return {
    width: Math.min(
      Math.max(Math.ceil(rawWidth + NODE_HORIZONTAL_PADDING / 2), MIN_NODE_WIDTH),
      MAX_NODE_WIDTH,
    ),
    height: Math.max(Math.ceil(rawHeight + NODE_VERTICAL_PADDING + lineHeight), MIN_NODE_HEIGHT),
  }
}

function getLargestNodeSize(
  ...sizes: Array<{ width: number; height: number } | null | undefined>
): { width: number; height: number } | null {
  const validSizes = sizes.filter(
    (size): size is { width: number; height: number } => Boolean(size),
  )
  if (validSizes.length === 0) return null

  return validSizes.reduce(
    (largest, size) => ({
      width: Math.max(largest.width, size.width),
      height: Math.max(largest.height, size.height),
    }),
    validSizes[0],
  )
}

function findCanvasNodeElement(
  containerEl: HTMLElement | null | undefined,
  node: CanvasNodeLike,
): HTMLElement | null {
  const closestNodeEl = containerEl?.closest<HTMLElement>(".canvas-node")
  if (closestNodeEl) return closestNodeEl

  const escapedId =
    typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(node.id) : node.id
  return (
    document.querySelector<HTMLElement>(`.canvas-node[data-node-id="${escapedId}"]`) ??
    document.querySelector<HTMLElement>(`.canvas-node[data-id="${escapedId}"]`)
  )
}

function getPreviewElement(
  containerEl: HTMLElement | null | undefined,
  node: CanvasNodeLike,
): HTMLElement | null {
  const internalPreviewEl = node.child?.previewMode?.renderer?.previewEl
  if (internalPreviewEl) {
    const isShown =
      typeof internalPreviewEl.isShown === "function" ? internalPreviewEl.isShown() : true
    if (isShown) return internalPreviewEl
  }

  return (
    containerEl?.querySelector<HTMLElement>(".markdown-preview-view, .markdown-rendered") ??
    findCanvasNodeElement(containerEl, node)?.querySelector<HTMLElement>(
      ".markdown-preview-view, .markdown-rendered",
    ) ??
    null
  )
}

function isPreviewElementReady(previewEl: HTMLElement | null): previewEl is HTMLElement {
  if (!previewEl || !previewEl.isConnected) return false
  if (previewEl.getClientRects().length === 0) return false
  return previewEl.scrollHeight > 0 || previewEl.clientHeight > 0
}

function fitNodeHeightToPreview(node: CanvasNodeLike, previewEl: HTMLElement): number | null {
  if (!node.canvas) return null

  const originalInlineHeight = previewEl.style.height
  let nextHeight = node.height

  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const clientHeight = previewEl.clientHeight
      previewEl.style.height = "1px"
      const scrollHeight = previewEl.scrollHeight
      previewEl.style.height = originalInlineHeight

      const distance = scrollHeight - clientHeight + 1
      if (Math.abs(distance) < 1) {
        break
      }

      nextHeight = Math.max(MIN_NODE_HEIGHT, Math.ceil(nextHeight + distance))

      autoResizingNodeIds.add(node.id)
      try {
        node.resize({ width: node.width, height: nextHeight })
        node.render?.()
      } finally {
        autoResizingNodeIds.delete(node.id)
      }
    }
  } finally {
    previewEl.style.height = originalInlineHeight
  }

  return Math.max(MIN_NODE_HEIGHT, Math.ceil(nextHeight))
}

function measureNodeHeightFromRenderedPreview(
  node: CanvasNodeLike,
  previewEl: HTMLElement,
): number | null {
  const originalInlineHeight = previewEl.style.height
  const baseClientHeight = previewEl.clientHeight

  try {
    previewEl.style.height = "min-content"
    const renderedHeight = Math.max(previewEl.clientHeight, previewEl.scrollHeight)
    if (renderedHeight <= 0) return null

    const chromeHeight = Math.max(node.height - baseClientHeight, NODE_VERTICAL_PADDING)
    return Math.max(
      MIN_NODE_HEIGHT,
      Math.ceil(renderedHeight + chromeHeight + PREVIEW_HEIGHT_BUFFER),
    )
  } finally {
    previewEl.style.height = originalInlineHeight
  }
}

function getEditingStableSize(
  node: CanvasNodeLike,
  size: { width: number; height: number },
): { width: number; height: number } {
  return {
    width: Math.max(node.width, size.width),
    height: Math.max(node.height, size.height),
  }
}

function resolveNodeContainerElement(
  containerEl: HTMLElement | null | undefined,
  node: CanvasNodeLike,
): HTMLElement | null {
  return findCanvasNodeElement(containerEl, node) ?? containerEl ?? node.nodeEl ?? null
}

function getCurrentEditingContainerElement(node: CanvasNodeLike): HTMLElement | null {
  const editorDom = node.child?.editMode?.cm?.dom
  return resolveNodeContainerElement(editorDom ?? null, node)
}

function schedulePrecisePreviewResync(
  node: CanvasNodeLike,
  canvas: CanvasLike,
  containerEl: HTMLElement | null | undefined,
  attempt = 0,
): void {
  if (attempt === 0) {
    clearPendingPreviewResyncs(node.id)
  }

  const delay = PREVIEW_RESYNC_DELAYS[Math.min(attempt, PREVIEW_RESYNC_DELAYS.length - 1)]
  const timer = window.setTimeout(() => {
    try {
      if (!node.canvas || node.isEditing || hasActiveManualNodeSizeOverride(node)) return

      node.render?.()
      canvas.requestFrame()

      const effectiveContainerEl = resolveNodeContainerElement(containerEl, node)
      const baseSize = effectiveContainerEl
        ? calculateNodeSizeFromContainer(effectiveContainerEl, node)
        : null

      if (baseSize) {
        syncNodeSize(node, canvas, baseSize)
      }

      const previewEl = getPreviewElement(effectiveContainerEl, node)
      if (!isPreviewElementReady(previewEl)) {
        if (attempt + 1 < PREVIEW_RESYNC_DELAYS.length) {
          schedulePrecisePreviewResync(node, canvas, effectiveContainerEl, attempt + 1)
        } else {
          pendingPreviewResyncs.delete(node.id)
        }
        return
      }

      const fittedHeight = fitNodeHeightToPreview(node, previewEl)
      const renderedPreviewHeight = measureNodeHeightFromRenderedPreview(node, previewEl)
      const rawText = previewEl.innerText || node.text || ""
      const lineHeight = getLineHeightFromElement(previewEl)
      const suspiciousHeightLimit = getSuspiciousPreviewHeightLimit(rawText, lineHeight)
      const boundedHeight =
        fittedHeight !== null
          ? Math.min(fittedHeight, suspiciousHeightLimit + PREVIEW_HEIGHT_BUFFER)
          : null
      const finalHeight = Math.max(
        renderedPreviewHeight ?? MIN_NODE_HEIGHT,
        boundedHeight ?? MIN_NODE_HEIGHT,
      )

      if (renderedPreviewHeight !== null || boundedHeight !== null) {
        syncNodeSize(node, canvas, {
          width: baseSize?.width ?? node.width,
          height: finalHeight,
        })
      } else if (baseSize) {
        syncNodeSize(node, canvas, baseSize)
      } else {
        debouncedCanvasRelayout(canvas, node)
      }
      clearPendingPreviewResyncs(node.id)
    } finally {
      if (attempt + 1 >= PREVIEW_RESYNC_DELAYS.length) {
        pendingPreviewResyncs.delete(node.id)
      }
    }
  }, delay)

  const timers = pendingPreviewResyncs.get(node.id) ?? []
  timers.push(timer)
  pendingPreviewResyncs.set(node.id, timers)
}

function syncNodeSize(
  node: CanvasNodeLike,
  canvas: CanvasLike,
  size: { width: number; height: number } | null,
): void {
  if (!size) return
  if (node.width === size.width && node.height === size.height) return
  ensureCanvasNodePrototypePatched({ register: () => undefined } as unknown as Plugin, node)
  autoResizingNodeIds.add(node.id)
  try {
    node.resize(size)
    const nodeData = node.getData?.()
    if (nodeData && typeof node.setData === "function") {
      node.setData(
        {
          ...nodeData,
          width: size.width,
          height: size.height,
        },
        false,
      )
      node.render?.()
    }
    node.render?.()
    canvas.requestFrame()
    canvas.requestSave()
  } finally {
    autoResizingNodeIds.delete(node.id)
  }
  debouncedCanvasRelayout(canvas, node)
}

function syncNodeSizeDuringEditing(
  node: CanvasNodeLike,
  canvas: CanvasLike,
  size: { width: number; height: number } | null,
): void {
  if (!size) return
  syncNodeSize(node, canvas, getEditingStableSize(node, size))
}

function handleNodeEditingStateChange(
  node: CanvasNodeLike,
  canvas: CanvasLike,
  editing: boolean,
): void {
  clearPendingPreviewResyncs(node.id)

  if (editing) {
    window.setTimeout(() => {
      if (!node.canvas || !(node.isEditing ?? false)) return
      const containerEl = getCurrentEditingContainerElement(node)
      const size = getLargestNodeSize(
        containerEl ? calculateNodeSizeFromContainer(containerEl, node) : null,
        containerEl ? calculateEditingDomSizeFromContainer(containerEl) : null,
      )
      syncNodeSizeDuringEditing(node, canvas, size)
    }, 0)
    return
  }

  clearManualNodeSizeOverride(node)
  ;[0, 24, 80].forEach((delay) => {
    window.setTimeout(() => {
      if (!node.canvas || node.isEditing) return
      node.render?.()
      canvas.requestFrame()
      schedulePrecisePreviewResync(node, canvas, resolveNodeContainerElement(null, node))
    }, delay)
  })
}

export function registerSmartMindmapAutoResize(plugin: Plugin & { app: App }): void {
  patchExistingCanvasNodes(plugin)
  plugin.registerEvent(
    plugin.app.workspace.on("layout-change", () => {
      patchExistingCanvasNodes(plugin)
    }),
  )
  plugin.registerEvent(
    plugin.app.workspace.on("active-leaf-change", () => {
      patchExistingCanvasNodes(plugin)
    }),
  )
  plugin.registerDomEvent(document, "mouseup", (event: MouseEvent) => {
    const view = getActiveCanvasView(plugin.app.workspace.getActiveViewOfType(ItemView))
    if (!view || !isCanvasInteractionTarget(view, event.target)) return

    const target = event.target instanceof HTMLElement ? event.target : null
    const nodeEl = target?.closest<HTMLElement>(".canvas-node")
    if (!nodeEl) return

    const node = Array.from(view.canvas.selection)[0]
    if (!node?.canvas || node.isEditing) return

    node.render?.()
    view.canvas.requestFrame()
    schedulePrecisePreviewResync(node, view.canvas, nodeEl)
  })
  plugin.registerEditorExtension(
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return

      const editorInfo = update.state.field(editorInfoField) as unknown as CanvasEditorInfoLike
      const node = editorInfo?.node
      const canvas = node?.canvas

      if (!node || !canvas || typeof node.resize !== "function") return

      ensureCanvasNodePrototypePatched(plugin, node)
      clearPendingPreviewResyncs(node.id)
      clearManualNodeSizeOverride(node)
      const containerEl =
        editorInfo.containerEl ?? getCurrentEditingContainerElement(node) ?? update.view.dom
      const nextSize = getLargestNodeSize(
        calculateNodeSizeFromEditor(update.view),
        calculateNodeSizeFromContainer(containerEl, node),
        calculateEditingDomSizeFromContainer(containerEl),
      )
      syncNodeSizeDuringEditing(node, canvas, nextSize)
    }),
  )
}
