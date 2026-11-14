import { useRightPanelSurfaceClose } from "~/hooks/useRightPanelSurfaceClose";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import {
  useWorkspaceStore,
  workspaceGroups,
  workspaceSourceKey,
  type WorkspaceTab,
} from "~/workspaceStore";

export function useWorkspaceTabClose(tab: WorkspaceTab | undefined) {
  const { closeSurface } = useRightPanelSurfaceClose({
    threadRef: tab?.source.ref ?? null,
    terminalLabelsById: new Map(),
  });
  return () => {
    if (!tab) return;
    const source = tab.source;
    const views = workspaceGroups(useWorkspaceStore.getState().root)
      .flatMap((group) => group.tabs)
      .filter((entry) => workspaceSourceKey(entry.source) === workspaceSourceKey(source));
    if (views.length > 1 || source.kind !== "surface")
      return useWorkspaceStore.getState().close(tab.id);
    const surface = selectThreadRightPanelState(
      useRightPanelStore.getState().byThreadKey,
      source.ref,
    ).surfaces.find((entry) => entry.id === source.surfaceId);
    if (surface) closeSurface(surface);
    else useWorkspaceStore.getState().close(tab.id);
  };
}
