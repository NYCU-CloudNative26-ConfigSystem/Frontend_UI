<script setup lang="ts">
import * as d3 from 'd3'
import { computed, resolveComponent } from 'vue'
import type { ConfigHistoryItem } from '~/composables/useApi'

interface LineageTreeNode extends ConfigHistoryItem {
  children?: LineageTreeNode[]
}

interface AncestorNode {
  uuid: string
  cmp_id: string | null
  environment: string
  approval_status: string | null
  name: string | null
  branches: LineageTreeNode[]
}

interface CurrentNode {
  uuid: string
  environment: string
  approval_status: string | null
  name: string | null
}

type LineageView = 'focus' | 'deep'
type GraphNodeKind = 'origin' | 'ancestor' | 'branch' | 'current' | 'current-marker' | 'child' | 'empty'

interface GraphNode {
  id: string
  label: string
  environment: string
  status: string | null
  tag: string
  kind: GraphNodeKind
  to?: string
  x: number
  y: number
  compact: boolean
}

interface GraphLink {
  id: string
  source: GraphNode
  target: GraphNode
  kind: 'trunk' | 'branch'
}

const props = defineProps<{
  view: LineageView
  ancestors: AncestorNode[]
  ancestorsLoaded: boolean
  children: LineageTreeNode[]
  childrenLoaded: boolean
  current: CurrentNode
  projId: string
  cmpId: string
}>()

const NuxtLink = resolveComponent('NuxtLink')

const TRUNK_Y = 74
const DOT_STEP_X = 124
const CARD_WIDTH = 176
const CARD_HEIGHT = 104
const CARD_TOP_OFFSET = 14
const FOCUS_STEP_X = CARD_WIDTH + 112
const NODE_PAD_X = 96
const CARD_BRANCH_GAP_Y = 46
const DOT_BRANCH_GAP_Y = 54
const FOCUS_ANCESTOR_COUNT = 3

function snapshotTo(snapshotUuid: string, environment: string): string {
  return `/config-snapshot/${snapshotUuid}?proj=${props.projId}&cmp=${props.cmpId}&env=${environment}`
}

function shortUuid(snapshotUuid: string): string {
  return snapshotUuid.slice(0, 8)
}

function statusClass(status: string | null, current = false): string {
  if (current) return 'bg-indigo-500 ring-indigo-100'
  if (status === 'pending') return 'bg-yellow-400 ring-yellow-100'
  if (status === 'approved') return 'bg-green-400 ring-green-100'
  if (status === 'rejected') return 'bg-red-400 ring-red-100'
  return 'bg-slate-300 ring-slate-100'
}

function statusPillClass(status: string | null): string {
  if (status === 'pending') return 'bg-yellow-100 text-yellow-700'
  if (status === 'approved') return 'bg-green-100 text-green-700'
  if (status === 'rejected') return 'bg-red-100 text-red-600'
  return 'bg-slate-100 text-slate-500'
}

function cardLeft(node: GraphNode): number {
  return node.x - CARD_WIDTH / 2
}

function cardRight(node: GraphNode): number {
  return node.x + CARD_WIDTH / 2
}

function cardBottom(node: GraphNode): number {
  return node.y - CARD_TOP_OFFSET + CARD_HEIGHT
}

function linkPoint(node: GraphNode, side: 'source' | 'target', kind: GraphLink['kind']) {
  if (node.compact) return { x: node.x, y: node.y }

  if (kind === 'trunk') {
    return {
      x: side === 'source' ? cardRight(node) : cardLeft(node),
      y: node.y,
    }
  }

  if (side === 'source') {
    return { x: node.x, y: cardBottom(node) }
  }

  return { x: cardLeft(node), y: node.y }
}

function linkPath(link: GraphLink): string {
  const source = linkPoint(link.source, 'source', link.kind)
  const target = linkPoint(link.target, 'target', link.kind)
  const sx = source.x
  const sy = source.y
  const tx = target.x
  const ty = target.y
  const line = d3.line<{ x: number; y: number }>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(link.kind === 'trunk' ? d3.curveMonotoneX : d3.curveBasis)

  if (link.kind === 'trunk') {
    return line([{ x: sx, y: sy }, { x: tx, y: ty }]) ?? ''
  }

  const midX = sx + Math.max(32, (tx - sx) * 0.55)
  return line([
    { x: sx, y: sy },
    { x: midX, y: sy + (ty > sy ? 18 : -18) },
    { x: midX, y: ty },
    { x: tx, y: ty },
  ]) ?? ''
}

const graph = computed(() => {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const trunk: GraphNode[] = []
  let branchRow = 0

  function addNode(node: GraphNode): GraphNode {
    nodes.push(node)
    return node
  }

  const cardStepX = props.view === 'focus' ? FOCUS_STEP_X : DOT_STEP_X
  const branchGapY = props.view === 'focus' ? CARD_HEIGHT + CARD_BRANCH_GAP_Y : DOT_BRANCH_GAP_Y

  function nextBranchY(): number {
    branchRow += 1
    return TRUNK_Y + 64 + branchRow * branchGapY
  }

  function addBranchTree(source: GraphNode, items: LineageTreeNode[], depth: number, tag: 'branch' | 'child') {
    items.forEach(item => {
      const branchNode = addNode({
        id: item.config_relation_uuid,
        label: item.name || shortUuid(item.config_relation_uuid),
        environment: item.environment,
        status: item.approval_status ?? null,
        tag,
        kind: tag,
        to: snapshotTo(item.config_relation_uuid, item.environment),
        x: source.x + Math.max(74, cardStepX - depth * 14),
        y: nextBranchY(),
        compact: props.view === 'deep',
      })
      links.push({ id: `${source.id}-${branchNode.id}`, source, target: branchNode, kind: 'branch' })
      if (props.view === 'deep' && item.children?.length) {
        addBranchTree(branchNode, item.children, depth + 1, tag)
      }
    })
  }

  if (props.view === 'focus') {
    if (props.ancestorsLoaded && props.ancestors.length > 0) {
      const visibleAncestors = props.ancestors.slice(-FOCUS_ANCESTOR_COUNT)
      visibleAncestors.forEach((ancestor, i) => {
        const absoluteIndex = props.ancestors.length - visibleAncestors.length + i
        trunk.push(addNode({
          id: ancestor.uuid,
          label: ancestor.name || shortUuid(ancestor.uuid),
          environment: ancestor.environment,
          status: ancestor.approval_status,
          tag: absoluteIndex === props.ancestors.length - 1 ? 'parent' : '',
          kind: 'ancestor',
          to: snapshotTo(ancestor.uuid, ancestor.environment),
          x: NODE_PAD_X + i * cardStepX,
          y: TRUNK_Y,
          compact: false,
        }))
      })
    } else if (props.ancestorsLoaded) {
      trunk.push(addNode({
        id: 'origin',
        label: 'Origin snapshot',
        environment: '',
        status: null,
        tag: '',
        kind: 'origin',
        x: NODE_PAD_X,
        y: TRUNK_Y,
        compact: true,
      }))
    }
  } else if (props.ancestorsLoaded && props.ancestors.length > 0) {
    props.ancestors.forEach((ancestor, i) => {
      const ancestorNode = addNode({
        id: ancestor.uuid,
        label: ancestor.name || shortUuid(ancestor.uuid),
        environment: ancestor.environment,
        status: ancestor.approval_status,
        tag: i === props.ancestors.length - 1 ? 'parent' : '',
        kind: 'ancestor',
        to: snapshotTo(ancestor.uuid, ancestor.environment),
        x: NODE_PAD_X + i * DOT_STEP_X,
        y: TRUNK_Y,
        compact: true,
      })
      trunk.push(ancestorNode)

      addBranchTree(ancestorNode, ancestor.branches, 0, 'branch')
    })
  } else if (props.ancestorsLoaded) {
    trunk.push(addNode({
      id: 'origin',
      label: 'Origin snapshot',
      environment: '',
      status: null,
      tag: '',
      kind: 'origin',
      x: NODE_PAD_X,
      y: TRUNK_Y,
      compact: true,
    }))
  }

  const currentX = trunk.length ? trunk[trunk.length - 1].x + cardStepX : NODE_PAD_X
  const currentNode = addNode({
    id: props.current.uuid,
    label: props.current.name || shortUuid(props.current.uuid),
    environment: props.current.environment,
    status: props.current.approval_status,
    tag: 'this snapshot',
    kind: 'current',
    x: currentX,
    y: TRUNK_Y,
    compact: props.view === 'deep',
    to: snapshotTo(props.current.uuid, props.current.environment),
  })
  trunk.push(currentNode)

  if (props.view === 'deep') {
    addNode({
      id: `${props.current.uuid}-marker`,
      label: 'You are here',
      environment: '',
      status: props.current.approval_status,
      tag: 'this snapshot',
      kind: 'current-marker',
      x: currentX,
      y: TRUNK_Y - 38,
      compact: false,
    })
  }

  for (let i = 0; i < trunk.length - 1; i += 1) {
    links.push({ id: `${trunk[i].id}-${trunk[i + 1].id}`, source: trunk[i], target: trunk[i + 1], kind: 'trunk' })
  }

  if (props.childrenLoaded && props.children.length > 0) {
    props.children.forEach(child => {
      const childNode = addNode({
        id: child.config_relation_uuid,
        label: child.name || shortUuid(child.config_relation_uuid),
        environment: child.environment,
        status: child.approval_status,
        tag: 'child',
        kind: 'child',
        to: snapshotTo(child.config_relation_uuid, child.environment),
        x: currentNode.x + cardStepX,
        y: nextBranchY(),
        compact: props.view === 'deep',
      })
      links.push({ id: `${currentNode.id}-${childNode.id}`, source: currentNode, target: childNode, kind: 'branch' })
      if (props.view === 'deep' && child.children?.length) {
        addBranchTree(childNode, child.children, 1, 'child')
      }
    })
  }

  const minY = Math.min(...nodes.map(n => n.y), TRUNK_Y)
  const maxY = Math.max(...nodes.map(n => n.y), TRUNK_Y)
  const minX = Math.min(...nodes.map(n => n.compact ? n.x - 16 : cardLeft(n)), NODE_PAD_X)
  const maxX = Math.max(...nodes.map(n => n.compact ? n.x + 16 : cardRight(n)), currentNode.x)

  return {
    nodes,
    links,
    width: maxX + 120,
    height: Math.max(props.view === 'focus' ? 310 : 230, maxY - minY + (props.view === 'focus' ? CARD_HEIGHT + 104 : 126)),
    xOffset: minX < 28 ? 28 - minX : 0,
    yOffset: minY < 34 ? 34 - minY : 0,
  }
})
</script>

<template>
  <div class="relative overflow-x-auto pb-2">
    <div v-if="!ancestorsLoaded" class="flex items-start gap-3 min-w-[360px]">
      <div class="mt-1 w-3.5 h-3.5 rounded-full bg-slate-200 animate-pulse shrink-0"></div>
      <div class="rounded-lg bg-slate-50 ring-1 ring-slate-100 px-3.5 py-3 w-44">
        <div class="h-2.5 bg-slate-200 rounded animate-pulse w-2/3"></div>
        <div class="h-2 bg-slate-100 rounded animate-pulse w-1/2 mt-2"></div>
      </div>
    </div>
    <div v-else class="relative" :style="{ width: `${graph.width}px`, height: `${graph.height}px` }">
      <svg
        class="absolute inset-0 pointer-events-none"
        :width="graph.width"
        :height="graph.height"
        :viewBox="`0 0 ${graph.width} ${graph.height}`"
        aria-hidden="true"
      >
        <path
          v-for="link in graph.links"
          :key="link.id"
          :d="linkPath({ ...link, source: { ...link.source, x: link.source.x + graph.xOffset, y: link.source.y + graph.yOffset }, target: { ...link.target, x: link.target.x + graph.xOffset, y: link.target.y + graph.yOffset } })"
          :class="[
            'fill-none stroke-[2.5]',
            link.kind === 'trunk' ? 'stroke-indigo-200' : 'stroke-slate-200'
          ]"
          stroke-linecap="round"
        />
      </svg>

      <component
        v-for="node in graph.nodes"
        :key="node.id"
        :is="node.to ? NuxtLink : 'div'"
        :to="node.to"
        :title="node.kind === 'empty' ? '' : `${node.label}${node.environment ? ` · ${node.environment}` : ''}`"
        :class="[
          'absolute group -translate-x-1/2',
          props.view === 'deep' || node.compact ? '-translate-y-1/2' : '-translate-y-[14px]',
          node.to && 'cursor-pointer'
        ]"
        :style="{ left: `${node.x + graph.xOffset}px`, top: `${node.y + graph.yOffset}px` }"
      >
        <div v-if="node.kind === 'current-marker'" class="pointer-events-none flex flex-col items-center">
          <div class="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600 ring-1 ring-indigo-200 shadow-sm">
            {{ node.label }}
          </div>
          <svg class="mt-0.5 h-5 w-4 overflow-visible text-indigo-300" viewBox="0 0 16 20" aria-hidden="true">
            <path d="M8 1 C8 6 8 11 8 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M4 12 L8 17 L12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>

        <div v-else-if="props.view === 'deep' || node.compact" class="relative flex items-center justify-center">
          <div
            :class="[
              'w-3.5 h-3.5 rounded-full ring-[5px] ring-white transition-transform',
              node.to && 'group-hover:scale-125',
              node.kind === 'origin' || node.kind === 'empty' ? 'border-2 border-dashed border-slate-300 bg-white' : statusClass(node.status, node.kind === 'current')
            ]"
          ></div>
          <div class="absolute top-5 left-1/2 hidden w-44 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-left shadow-lg ring-1 ring-slate-200 group-hover:block z-20">
            <div class="truncate text-xs font-semibold text-slate-700">{{ node.label }}</div>
            <div class="mt-0.5 text-[11px] capitalize text-slate-400">
              {{ node.environment }}<template v-if="node.tag"> · {{ node.tag }}</template>
            </div>
            <span v-if="node.status" :class="['mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', statusPillClass(node.status)]">
              {{ node.status }}
            </span>
          </div>
        </div>

        <div
          v-else
          :class="[
            'w-44 min-h-[104px] rounded-lg px-3.5 py-3 transition',
            node.kind === 'current'
              ? 'bg-indigo-50 ring-2 ring-indigo-400'
              : ['bg-slate-50 ring-1 ring-slate-200', node.to && 'group-hover:bg-indigo-50/40 group-hover:ring-indigo-300']
          ]"
        >
          <div class="flex items-start gap-2">
            <div class="relative mt-0.5 shrink-0">
              <div :class="['w-3.5 h-3.5 rounded-full ring-2 ring-white', statusClass(node.status, node.kind === 'current')]"></div>
              <div v-if="node.kind === 'current'" class="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-25"></div>
            </div>
            <div class="min-w-0">
              <div :class="['truncate text-xs font-semibold', node.kind === 'current' ? 'text-indigo-800' : 'text-slate-700']">
                {{ node.label }}
              </div>
              <div :class="['mt-0.5 text-[11px] capitalize', node.kind === 'current' ? 'text-indigo-400' : 'text-slate-400']">
                {{ node.environment }}<template v-if="node.tag"> · {{ node.tag }}</template>
              </div>
              <span v-if="node.status" :class="['mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', statusPillClass(node.status)]">
                {{ node.status }}
              </span>
            </div>
          </div>
        </div>
      </component>
    </div>
  </div>
</template>
