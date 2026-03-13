import "obsidian"
import { CanvasData } from "obsidian/canvas"

declare module "obsidian" {
  interface CanvasView {
    canvas: Canvas
  }

  interface Canvas {
    x: number
    y: number
    readonly: boolean
    nodes: Map<string, CanvasNode>
    selection: Set<CanvasNode>
    getData(): CanvasData
    importData(data: CanvasData): void
    getEdgesForNode(node: CanvasNode): CanvasEdge[]
    requestFrame(): void
    requestSave(save?: boolean, triggerBySelf?: boolean): void
    deselectAll(): void
    selectOnly(node: CanvasNode): void
    zoomToSelection(): void
  }

  interface CanvasNode {
    id: string
    x: number
    y: number
    width: number
    height: number
    isEditing?: boolean
    moveTo(position: { x: number; y: number }): void
    startEditing(): void
  }

  interface CanvasEdgeSide {
    node: CanvasNode
    side: string
  }

  interface CanvasEdge {
    id: string
    from: CanvasEdgeSide
    to: CanvasEdgeSide
  }
}