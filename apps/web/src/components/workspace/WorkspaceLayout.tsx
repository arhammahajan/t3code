import { PanelRight } from "lucide-react";
import { WorkspaceFilesDock } from "./WorkspaceFilesDock";
import { WorkspaceDockAction } from "./WorkspaceDockChrome";
import { useFileExplorerOpen } from "../files/fileExplorerState";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { TerminalSquare, Globe, Folder, GitCompare, Smartphone } from "lucide-react";
import { useWorkspaceTabClose } from "./useWorkspaceTabClose";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { MessageSquare, File, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useComposerDraftStore } from "~/composerDraftStore";
import { ComposerHandleContext } from "~/composerHandleContext";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useQuietThreadShell } from "~/state/entities";
import { surfaceTitle } from "~/panelSurfaceTitle";
import { useThreadPreviewState } from "~/previewStateStore";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { connectWorkspacePanels, restoreWorkspacePanels } from "~/workspacePanels";
import {
  useWorkspaceStore,
  workspaceGroups,
  type WorkspaceNode,
  type WorkspaceGroup,
  type WorkspaceSource,
  type WorkspaceTab,
} from "~/workspaceStore";
import { WorkspacePaneContext } from "~/workspacePaneContext";
import type { ThreadRouteTarget } from "~/threadRoutes";
import { ThreadRouteView } from "../ThreadRouteView";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { WorkspaceGroupActions } from "./WorkspaceGroupActions";
import { SidebarInset } from "../ui/sidebar";

const TAB_DRAG_TYPE = "application/x-t3-workspace-tab";
type WindowEdges = { top: boolean; left: boolean; right: boolean };

function targetFor(source: WorkspaceSource): ThreadRouteTarget {
  return source.draftId
    ? { kind: "draft", draftId: source.draftId }
    : { kind: "server", threadRef: source.ref };
}
function activeTab(state: { root: WorkspaceNode; activeGroupId: string }) {
  const group = workspaceGroups(state.root).find((entry) => entry.id === state.activeGroupId);
  return group?.tabs.find((tab) => tab.id === group.activeTabId);
}

function ChatTabTitle({ source }: { source: WorkspaceSource }) {
  const shell = useQuietThreadShell(source.ref);
  return <>{shell?.title ?? source.title}</>;
}
function SurfaceTabTitle({ source }: { source: Extract<WorkspaceSource, { kind: "surface" }> }) {
  const surface = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, source.ref).surfaces.find(
      (entry) => entry.id === source.surfaceId,
    ),
  );
  const preview = useThreadPreviewState(source.surfaceKind === "preview" ? source.ref : null);
  return <>{surface ? surfaceTitle(surface, preview.sessions, new Map()) : source.title}</>;
}
function WorkspaceTabIcon({ source }: { source: WorkspaceSource }) {
  const Icon =
    source.kind === "chat"
      ? MessageSquare
      : {
          file: File,
          files: Folder,
          terminal: TerminalSquare,
          preview: Globe,
          diff: GitCompare,
          "pull-request": PullRequestGlyph.pullRequest,
          "pull-requests": PullRequestGlyph.stack,
          device: Smartphone,
          "side-chat": MessageSquare,
        }[source.surfaceKind];
  return <Icon className="size-3 shrink-0 text-muted-foreground" />;
}
function TabCloseButton({ tab }: { tab: WorkspaceTab }) {
  const close = useWorkspaceTabClose(tab);
  return (
    <button
      type="button"
      aria-label={`Close ${tab.source.title}`}
      className="mr-1.5 flex size-5 shrink-0 items-center justify-center rounded opacity-0 text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover/tab:opacity-100 group-data-[selected=true]/tab:opacity-70 pointer-coarse:opacity-100"
      onClick={close}
    >
      <X className="size-3" />
    </button>
  );
}

function EditorGroup({
  group,
  focused,
  background,
  multiple,
  windowEdges,
}: {
  group: WorkspaceGroup;
  focused: boolean;
  background: boolean;
  multiple: boolean;
  windowEdges: WindowEdges;
}) {
  const [filesOpen, setFilesOpen] = useFileExplorerOpen();
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const tab = group.tabs.find((entry) => entry.id === group.activeTabId);
  const source = tab?.source;
  const closeTab = useWorkspaceTabClose(tab);
  const activate = (id?: string) => useWorkspaceStore.getState().activate(group.id, id);
  const drop = (event: React.DragEvent, index?: number) => {
    const id = event.dataTransfer.getData(TAB_DRAG_TYPE);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    useWorkspaceStore.getState().move(id, group.id, index);
  };
  return (
    <section
      className="group/editor flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      aria-label="Editor group"
      data-workspace-group={group.id}
      data-workspace-group-active={focused}
      onPointerDownCapture={() => activate()}
      onFocusCapture={() => activate()}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(TAB_DRAG_TYPE)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => drop(event)}
    >
      <div
        className={cn(
          "flex h-10 shrink-0 items-center gap-1 border-b border-border/45 bg-sidebar/45 px-1.5",
          !focused && "text-muted-foreground",
          windowEdges.top && isElectron && "drag-region h-[var(--workspace-topbar-height)]",
          windowEdges.top && windowEdges.left && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          windowEdges.top &&
            windowEdges.right &&
            isElectron &&
            "wco:pr-(--workspace-native-controls-inset)",
        )}
      >
        <div
          role="tablist"
          aria-label="Workspace tabs"
          className="flex min-w-0 flex-1 items-center gap-0.5 self-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {group.tabs.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                "group/tab relative flex h-8 min-w-28 max-w-56 shrink-0 items-center rounded-md border border-transparent",
                entry.id === tab?.id
                  ? cn(
                      "bg-background shadow-xs",
                      focused
                        ? "border-border/65 text-foreground"
                        : "border-border/35 text-foreground/70",
                    )
                  : "text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
              )}
              data-selected={entry.id === tab?.id}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(TAB_DRAG_TYPE)) event.preventDefault();
              }}
              onDrop={(event) => drop(event, index)}
            >
              <button
                type="button"
                role="tab"
                aria-selected={entry.id === tab?.id}
                tabIndex={entry.id === tab?.id ? 0 : -1}
                aria-controls={`workspace-content-${group.id}`}
                draggable
                className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2.5 pr-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => activate(entry.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(TAB_DRAG_TYPE, entry.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onKeyDown={(event) => {
                  const offset =
                    event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
                  if (!offset && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? group.tabs.length - 1
                        : (index + offset + group.tabs.length) % group.tabs.length;
                  const next = group.tabs[nextIndex];
                  if (next) {
                    activate(next.id);
                    const buttons = event.currentTarget
                      .closest('[role="tablist"]')
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                    buttons?.[nextIndex]?.focus();
                  }
                }}
              >
                <WorkspaceTabIcon source={entry.source} />
                <span className="truncate">
                  {entry.source.kind === "chat" ? (
                    <ChatTabTitle source={entry.source} />
                  ) : (
                    <SurfaceTabTitle source={entry.source} />
                  )}
                </span>
              </button>
              <TabCloseButton tab={entry} />
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 pl-1">
          <div ref={setToolbar} className="flex items-center" />
          <WorkspaceGroupActions groupId={group.id} multiple={multiple} />
          {windowEdges.top && windowEdges.right ? (
            <WorkspaceDockAction
              label={filesOpen ? "Hide files sidebar" : "Show files sidebar"}
              size="icon-xs"
              onClick={() => setFilesOpen((current) => !current)}
            >
              <PanelRight className="size-3.5" />
            </WorkspaceDockAction>
          ) : null}
        </div>
      </div>
      <div
        id={`workspace-content-${group.id}`}
        role="tabpanel"
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {source ? (
          <WorkspacePaneContext
            value={{
              groupId: group.id,
              surfaceId: source.kind === "surface" ? source.surfaceId : null,
              focused: focused && !background,
              toolbar,
              closeTab,
              toggleMaximized: () => useWorkspaceStore.getState().toggleMaximized(group.id),
            }}
          >
            <ComposerHandleContext value={null}>
              <ThreadRouteView
                target={targetFor(source)}
                background={!focused || background}
                workspace
              />
            </ComposerHandleContext>
          </WorkspacePaneContext>
        ) : (
          <div className="m-auto max-w-sm p-8 text-center text-sm text-muted-foreground">
            Open a thread from the sidebar, or drag a tab here.
          </div>
        )}
      </div>
    </section>
  );
}

function EditorSplit({
  node,
  activeGroupId,
  background,
  multiple,
  windowEdges = { top: true, left: true, right: true },
}: {
  node: WorkspaceNode;
  activeGroupId: string;
  background: boolean;
  multiple: boolean;
  windowEdges?: WindowEdges;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  if (node.kind === "group")
    return (
      <EditorGroup
        group={node}
        focused={activeGroupId === node.id}
        background={background}
        multiple={multiple}
        windowEdges={windowEdges}
      />
    );
  const horizontal = node.direction === "horizontal";
  const ratio = dragRatio ?? node.ratio;
  const ratioAt = (event: React.PointerEvent) => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect) return node.ratio;
    return Math.max(
      0.1,
      Math.min(
        0.9,
        horizontal
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height,
      ),
    );
  };
  return (
    <div
      ref={container}
      className={cn("flex min-h-0 min-w-0 flex-1 overflow-hidden", !horizontal && "flex-col")}
    >
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: ratio }}>
        <EditorSplit
          node={node.first}
          activeGroupId={activeGroupId}
          background={background}
          multiple={multiple}
          windowEdges={{ ...windowEdges, right: windowEdges.right && !horizontal }}
        />
      </div>
      <div
        role="separator"
        aria-label="Resize editor groups"
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={10}
        aria-valuemax={90}
        tabIndex={0}
        className={cn(
          "relative z-10 shrink-0 bg-border/55 hover:bg-ring/70 focus-visible:bg-ring focus-visible:outline-none before:absolute before:content-['']",
          horizontal
            ? "w-px cursor-col-resize before:inset-y-0 before:-inset-x-1"
            : "h-px cursor-row-resize before:inset-x-0 before:-inset-y-1",
        )}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          setDragRatio(ratioAt(event));
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          useWorkspaceStore.getState().resize(node.id, ratioAt(event));
          event.currentTarget.releasePointerCapture(event.pointerId);
          setDragRatio(null);
        }}
        onLostPointerCapture={() => setDragRatio(null)}
        onDoubleClick={() => useWorkspaceStore.getState().resize(node.id, 0.5)}
        onKeyDown={(event) => {
          const delta =
            event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? -0.05
              : event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 0.05
                : 0;
          if (!delta && event.key !== "Home") return;
          event.preventDefault();
          useWorkspaceStore
            .getState()
            .resize(node.id, event.key === "Home" ? 0.5 : node.ratio + delta);
        }}
      />
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: 1 - ratio }}>
        <EditorSplit
          node={node.second}
          activeGroupId={activeGroupId}
          background={background}
          multiple={multiple}
          windowEdges={{
            ...windowEdges,
            top: windowEdges.top && horizontal,
            left: windowEdges.left && !horizontal,
          }}
        />
      </div>
    </div>
  );
}

export function WorkspaceLayout({
  target,
  background,
}: {
  target: ThreadRouteTarget | null;
  background: boolean;
}) {
  const root = useWorkspaceStore((state) => state.root);
  const activeGroupId = useWorkspaceStore((state) => state.activeGroupId);
  const maximizedGroupId = useWorkspaceStore((state) => state.maximizedGroupId);
  const router = useRouter();
  const navigate = useNavigate();
  const locationKey = useLocation({ select: (location) => location.state.__TSR_key });
  const draftId = target?.kind === "draft" ? target.draftId : null;
  const draft = useComposerDraftStore((state) => (draftId ? state.getDraftSession(draftId) : null));
  const redirect = useComposerDraftStore((state) =>
    draftId ? state.getPromotedDraftRedirect(draftId) : null,
  );
  const ref =
    target?.kind === "server"
      ? target.threadRef
      : draft
        ? { environmentId: draft.environmentId, threadId: draft.threadId }
        : redirect;
  const routeOwnerKey = ref ? scopedThreadKey(ref) : null;
  const routeChanged = useEffectEvent(
    (request: {
      locationKey: string | undefined;
      routeOwnerKey: string | null;
      background: boolean;
    }) => {
      const marker =
        "workspaceTabId" in router.state.location.state
          ? router.state.location.state.workspaceTabId
          : null;
      useWorkspaceStore.getState().receiveRoute(
        ref
          ? {
              kind: "chat",
              ref,
              draftId: draft ? draftId : null,
              title: "Chat",
            }
          : null,
        request.locationKey,
        marker,
        request.background,
      );
      if (ref) restoreWorkspacePanels(ref);
    },
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- external router navigation opens a chat in the focused editor group; workspace-owned navigation restores its exact tab
  useEffect(() => {
    routeChanged({ locationKey, routeOwnerKey, background });
  }, [locationKey, routeOwnerKey, background]);
  const syncRoute = useEffectEvent((state: ReturnType<typeof useWorkspaceStore.getState>) => {
    if (background) return;
    const tab = activeTab(state);
    if (!tab) return;
    const source = tab.source;
    const path = source.draftId
      ? `/draft/${source.draftId}`
      : `/${source.ref.environmentId}/${source.ref.threadId}`;
    if (router.state.location.pathname === path) return;
    const navigationState = (previous: typeof router.state.location.state) => ({
      ...previous,
      workspaceTabId: tab.id,
    });
    if (source.draftId)
      void navigate({
        to: "/draft/$draftId",
        params: { draftId: source.draftId },
        state: navigationState,
      });
    else
      void navigate({
        to: "/$environmentId/$threadId",
        params: source.ref,
        state: navigationState,
      });
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- synchronizes editor focus with the owning thread's route and projects resource-store opens into the workspace
  useEffect(() => {
    const unsubscribePanels = connectWorkspacePanels();
    const unsubscribeWorkspace = useWorkspaceStore.subscribe((next, previous) => {
      if (activeTab(next) !== activeTab(previous) || next.activeGroupId !== previous.activeGroupId)
        syncRoute(next);
    });
    return () => {
      unsubscribePanels();
      unsubscribeWorkspace();
    };
  }, []);
  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden md:h-dvh" inert={background}>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <EditorSplit
          node={workspaceGroups(root).find((group) => group.id === maximizedGroupId) ?? root}
          activeGroupId={activeGroupId}
          background={background}
          multiple={workspaceGroups(root).length > 1}
        />
        <WorkspaceFilesDock source={activeTab({ root, activeGroupId })?.source} />
      </div>
    </SidebarInset>
  );
}
