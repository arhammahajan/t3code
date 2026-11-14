import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { randomUUID } from "./lib/utils";
import type { DraftId } from "./composerDraftStore";
import type { RightPanelSurface } from "./rightPanelStore";
import { createMemoryStorage, resolveStorage, type StateStorage } from "./lib/storage";

type Owner = { ref: ScopedThreadRef; draftId: DraftId | null; title: string };
export type WorkspaceSource = Owner &
  (
    | { kind: "chat" }
    | { kind: "surface"; surfaceId: string; surfaceKind: RightPanelSurface["kind"] }
  );
export interface WorkspaceTab {
  id: string;
  source: WorkspaceSource;
}
export interface WorkspaceGroup {
  kind: "group";
  id: string;
  tabs: WorkspaceTab[];
  activeTabId: string | null;
}
export type WorkspaceNode =
  | WorkspaceGroup
  | {
      kind: "split";
      id: string;
      direction: "horizontal" | "vertical";
      ratio: number;
      first: WorkspaceNode;
      second: WorkspaceNode;
    };
interface WorkspaceState {
  root: WorkspaceNode;
  activeGroupId: string;
  receiveRoute: (
    source: WorkspaceSource | null,
    navigationKey: string | undefined,
    marker: unknown,
    background: boolean,
  ) => void;
  maximizedGroupId: string | null;
  toggleMaximized: (groupId: string) => void;
  open: (source: WorkspaceSource, activate?: boolean) => void;
  activate: (groupId: string, tabId?: string) => void;
  close: (tabId: string) => void;
  split: (groupId: string, direction: "horizontal" | "vertical") => void;
  join: (groupId: string) => void;
  move: (tabId: string, groupId: string, index?: number) => void;
  resize: (splitId: string, ratio: number) => void;
  removeSurface: (ref: ScopedThreadRef, surfaceId: string) => void;
  updateOwner: (ref: ScopedThreadRef, draftId: DraftId | null, title: string) => void;
}

export function workspaceGroups(node: WorkspaceNode): WorkspaceGroup[] {
  return node.kind === "group"
    ? [node]
    : [...workspaceGroups(node.first), ...workspaceGroups(node.second)];
}
export function workspaceSourceKey(source: WorkspaceSource): string {
  return `${scopedThreadKey(source.ref)}:${source.kind === "chat" ? "chat" : source.surfaceId}`;
}
function mapGroups(
  node: WorkspaceNode,
  update: (group: WorkspaceGroup) => WorkspaceGroup,
): WorkspaceNode {
  if (node.kind === "group") return update(node);
  const first = mapGroups(node.first, update);
  const second = mapGroups(node.second, update);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}
function prune(node: WorkspaceNode): WorkspaceNode | null {
  if (node.kind === "group") return node.tabs.length ? node : null;
  const first = prune(node.first);
  const second = prune(node.second);
  return first && second ? { ...node, first, second } : (first ?? second);
}
function removeTabs(
  state: Pick<WorkspaceState, "root" | "activeGroupId">,
  remove: (tab: WorkspaceTab) => boolean,
) {
  const root = mapGroups(state.root, (group) => {
    const tabs = group.tabs.filter((tab) => !remove(tab));
    if (tabs.length === group.tabs.length) return group;
    const oldIndex = group.tabs.findIndex((tab) => tab.id === group.activeTabId);
    return {
      ...group,
      tabs,
      activeTabId: tabs.some((tab) => tab.id === group.activeTabId)
        ? group.activeTabId
        : (tabs[Math.min(oldIndex, tabs.length - 1)]?.id ?? null),
    };
  });
  const remaining = prune(root) ?? {
    kind: "group" as const,
    id: state.activeGroupId,
    tabs: [],
    activeTabId: null,
  };
  const groups = workspaceGroups(remaining);
  return {
    root: remaining,
    activeGroupId: groups.some((group) => group.id === state.activeGroupId)
      ? state.activeGroupId
      : groups[0]!.id,
  };
}
const isRef = Schema.is(ScopedThreadRef);
const surfaceKinds = new Set([
  "file",
  "files",
  "diff",
  "preview",
  "terminal",
  "device",
  "pull-request",
  "pull-requests",
  "side-chat",
]);
function isSource(value: unknown): value is WorkspaceSource {
  if (!value || typeof value !== "object") return false;
  const source = value as WorkspaceSource;
  return (
    isRef(source.ref) &&
    typeof source.title === "string" &&
    (source.draftId === null || typeof source.draftId === "string") &&
    (source.kind === "chat" ||
      (source.kind === "surface" &&
        typeof source.surfaceId === "string" &&
        surfaceKinds.has(source.surfaceKind)))
  );
}
function isLayout(value: unknown, ids = new Set<string>(), depth = 0): value is WorkspaceNode {
  if (!value || typeof value !== "object" || depth > 20) return false;
  const node = value as WorkspaceNode;
  if (typeof node.id !== "string" || ids.has(node.id)) return false;
  ids.add(node.id);
  if (node.kind === "split")
    return (
      (node.direction === "horizontal" || node.direction === "vertical") &&
      Number.isFinite(node.ratio) &&
      node.ratio >= 0.1 &&
      node.ratio <= 0.9 &&
      isLayout(node.first, ids, depth + 1) &&
      isLayout(node.second, ids, depth + 1)
    );
  if (node.kind !== "group" || !Array.isArray(node.tabs)) return false;
  for (const tab of node.tabs) {
    if (!tab || typeof tab.id !== "string" || ids.has(tab.id) || !isSource(tab.source))
      return false;
    ids.add(tab.id);
  }
  return node.tabs.length === 0
    ? node.activeTabId === null
    : node.tabs.some((tab) => tab.id === node.activeTabId);
}

export function createWorkspaceStore(storage: StateStorage = createMemoryStorage()) {
  let receivedRoute: { navigationKey: string | undefined; ownerKey: string } | null = null;
  return create<WorkspaceState>()(
    persist(
      (set, get) => ({
        receiveRoute: (source, navigationKey, marker, background) => {
          if (background) {
            receivedRoute = null;
            return;
          }
          if (!source) return;
          const ownerKey = scopedThreadKey(source.ref);
          if (
            receivedRoute?.navigationKey === navigationKey &&
            receivedRoute?.ownerKey === ownerKey
          )
            return;
          const first = receivedRoute === null;
          receivedRoute = { navigationKey, ownerKey };
          const state = get();
          const groups = workspaceGroups(state.root);
          const focused = groups.find((group) => group.id === state.activeGroupId);
          const selected = focused?.tabs.find((tab) => tab.id === focused.activeTabId);
          if (first && selected && scopedThreadKey(selected.source.ref) === ownerKey) return;
          const existing = groups.find((group) => group.tabs.some((tab) => tab.id === marker));
          if (existing && typeof marker === "string") state.activate(existing.id, marker);
          else state.open(source);
        },
        root: { kind: "group", id: "main", tabs: [], activeTabId: null },
        activeGroupId: "main",
        maximizedGroupId: null,
        toggleMaximized: (groupId) =>
          set((state) => ({
            maximizedGroupId: state.maximizedGroupId === groupId ? null : groupId,
          })),
        open: (source, activate = true) =>
          set((state) => {
            const groups = workspaceGroups(state.root);
            const focused = groups.find((group) => group.id === state.activeGroupId) ?? groups[0]!;
            const key = workspaceSourceKey(source);
            const group =
              [focused, ...groups].find((candidate) =>
                candidate.tabs.some((tab) => workspaceSourceKey(tab.source) === key),
              ) ?? focused;
            const existing = group.tabs.find((tab) => workspaceSourceKey(tab.source) === key);
            const tab = existing ? { ...existing, source } : { id: randomUUID(), source };
            return {
              root: mapGroups(state.root, (entry) =>
                entry.id !== group.id
                  ? entry
                  : {
                      ...entry,
                      tabs: existing
                        ? entry.tabs.map((item) => (item.id === tab.id ? tab : item))
                        : [...entry.tabs, tab],
                      activeTabId:
                        activate || entry.activeTabId === null ? tab.id : entry.activeTabId,
                    },
              ),
              activeGroupId: activate ? group.id : state.activeGroupId,
            };
          }),
        activate: (groupId, tabId) =>
          set((state) => {
            const group = workspaceGroups(state.root).find((entry) => entry.id === groupId);
            if (!group || (tabId && !group.tabs.some((tab) => tab.id === tabId))) return state;
            if (state.activeGroupId === groupId && (!tabId || group.activeTabId === tabId))
              return state;
            return {
              activeGroupId: groupId,
              root: tabId
                ? mapGroups(state.root, (entry) =>
                    entry.id === groupId ? { ...entry, activeTabId: tabId } : entry,
                  )
                : state.root,
            };
          }),
        close: (tabId) => set((state) => removeTabs(state, (tab) => tab.id === tabId)),
        removeSurface: (ref, surfaceId) =>
          set((state) =>
            removeTabs(
              state,
              (tab) =>
                tab.source.kind === "surface" &&
                scopedThreadKey(tab.source.ref) === scopedThreadKey(ref) &&
                tab.source.surfaceId === surfaceId,
            ),
          ),
        updateOwner: (ref, draftId, title) =>
          set((state) => ({
            root: mapGroups(state.root, (group) => {
              let changed = false;
              const tabs = group.tabs.map((tab) => {
                if (
                  scopedThreadKey(tab.source.ref) !== scopedThreadKey(ref) ||
                  (tab.source.draftId === draftId &&
                    (tab.source.kind !== "chat" || tab.source.title === title))
                )
                  return tab;
                changed = true;
                return {
                  ...tab,
                  source: {
                    ...tab.source,
                    draftId,
                    title: tab.source.kind === "chat" ? title : tab.source.title,
                  },
                };
              });
              return changed ? { ...group, tabs } : group;
            }),
          })),
        split: (groupId, direction) =>
          set((state) => {
            const replace = (node: WorkspaceNode): WorkspaceNode => {
              if (node.kind === "split")
                return { ...node, first: replace(node.first), second: replace(node.second) };
              if (node.id !== groupId) return node;
              const active = node.tabs.find((tab) => tab.id === node.activeTabId);
              const tab = active ? { ...active, id: randomUUID() } : null;
              const next: WorkspaceGroup = {
                kind: "group",
                id: randomUUID(),
                tabs: tab ? [tab] : [],
                activeTabId: tab?.id ?? null,
              };
              return {
                kind: "split",
                id: randomUUID(),
                direction,
                ratio: 0.5,
                first: node,
                second: next,
              };
            };
            const root = replace(state.root);
            const groups = workspaceGroups(root);
            const index = groups.findIndex((group) => group.id === groupId);
            return { root, activeGroupId: groups[index + 1]?.id ?? state.activeGroupId };
          }),
        move: (tabId, groupId, index) =>
          set((state) => {
            const groups = workspaceGroups(state.root);
            const tab = groups.flatMap((group) => group.tabs).find((entry) => entry.id === tabId);
            if (!tab || !groups.some((group) => group.id === groupId)) return state;
            const root = mapGroups(state.root, (group) => {
              const tabs = group.tabs.filter((entry) => entry.id !== tabId);
              const existing =
                group.id === groupId
                  ? tabs.find(
                      (entry) =>
                        workspaceSourceKey(entry.source) === workspaceSourceKey(tab.source),
                    )
                  : undefined;
              if (group.id === groupId && !existing) {
                const previousIndex = group.tabs.findIndex((entry) => entry.id === tabId);
                const insertion =
                  index === undefined
                    ? tabs.length
                    : index - (previousIndex >= 0 && previousIndex < index ? 1 : 0);
                tabs.splice(Math.max(0, Math.min(insertion, tabs.length)), 0, tab);
              }
              return {
                ...group,
                tabs,
                activeTabId:
                  group.id === groupId
                    ? (existing?.id ?? tabId)
                    : group.activeTabId === tabId
                      ? (tabs.at(-1)?.id ?? null)
                      : group.activeTabId,
              };
            });
            return { root: prune(root) ?? root, activeGroupId: groupId };
          }),
        join: (groupId) =>
          set((state) => {
            const groups = workspaceGroups(state.root);
            const index = groups.findIndex((group) => group.id === groupId);
            const source = groups[index];
            const destination = groups[index - 1] ?? groups[index + 1];
            if (!source || !destination) return state;
            const combined = [...destination.tabs];
            for (const tab of source.tabs) {
              if (
                !combined.some(
                  (entry) => workspaceSourceKey(entry.source) === workspaceSourceKey(tab.source),
                )
              )
                combined.push(tab);
            }
            const selected = source.tabs.find((tab) => tab.id === source.activeTabId);
            const activeTabId = selected
              ? (combined.find(
                  (tab) => workspaceSourceKey(tab.source) === workspaceSourceKey(selected.source),
                )?.id ?? destination.activeTabId)
              : destination.activeTabId;
            const root = mapGroups(state.root, (group) =>
              group.id === destination.id
                ? { ...group, tabs: combined, activeTabId }
                : group.id === source.id
                  ? { ...group, tabs: [], activeTabId: null }
                  : group,
            );
            return { root: prune(root) ?? root, activeGroupId: destination.id };
          }),
        resize: (splitId, ratio) =>
          set((state) => {
            if (!Number.isFinite(ratio)) return state;
            const resize = (node: WorkspaceNode): WorkspaceNode =>
              node.kind === "group"
                ? node
                : node.id === splitId
                  ? { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) }
                  : { ...node, first: resize(node.first), second: resize(node.second) };
            return { root: resize(state.root) };
          }),
      }),
      {
        name: "t3code:workspace:v1",
        storage: createJSONStorage(() => storage),
        partialize: ({ root, activeGroupId }) => ({ root, activeGroupId }),
        merge: (persisted, current) => {
          const saved = persisted as Partial<WorkspaceState> | null;
          if (!isLayout(saved?.root)) return current;
          const groups = workspaceGroups(saved.root);
          return {
            ...current,
            root: saved.root,
            activeGroupId: groups.some((group) => group.id === saved.activeGroupId)
              ? saved.activeGroupId!
              : groups[0]!.id,
          };
        },
      },
    ),
  );
}
export const useWorkspaceStore = createWorkspaceStore(
  resolveStorage(typeof window === "undefined" ? undefined : window.localStorage),
);
