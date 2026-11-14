import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { deriveWorkspaceMutationId } from "@t3tools/client-runtime/state/threads";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import {
  useProject,
  useQuietThreadShell,
  useQuietThreadVisibleTurnItems,
  useThreadCheckpointSummaries,
} from "~/state/entities";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import type { WorkspaceSource } from "~/workspaceStore";
import { FileExplorerPane } from "../files/FileExplorerPane";
import FileBrowserPanel from "../files/FileBrowserPanel";
import { useFileExplorerOpen } from "../files/fileExplorerState";

export function WorkspaceFilesDock({ source }: { source: WorkspaceSource | undefined }) {
  const [open, setOpen] = useFileExplorerOpen();
  const wide = useMediaQuery("(min-width: 768px)");
  const ref = source?.ref ?? null;
  const shell = useQuietThreadShell(ref);
  const draft = useComposerDraftStore((state) =>
    source?.draftId ? state.getDraftSession(source.draftId) : null,
  );
  const projectId = shell?.projectId ?? draft?.projectId;
  const project = useProject(
    ref && projectId ? scopeProjectRef(ref.environmentId, projectId) : null,
  );
  const items = useQuietThreadVisibleTurnItems(ref);
  const checkpoints = useThreadCheckpointSummaries(ref);
  const surface = useRightPanelStore((state) =>
    source?.kind === "surface"
      ? selectThreadRightPanelState(state.byThreadKey, ref).surfaces.find(
          (entry) => entry.id === source.surfaceId,
        )
      : null,
  );
  const cwd = shell?.worktreePath ?? draft?.worktreePath ?? project?.workspaceRoot;
  if (!wide || !ref || !project || !cwd) return null;
  return (
    <FileExplorerPane
      hidden={!open}
      resizable
      storageKey="t3code.workspaceFilesDockWidth"
      minWidth={208}
    >
      <FileBrowserPanel
        windowTitlebar
        key={`${ref.environmentId}:${cwd}`}
        environmentId={ref.environmentId}
        cwd={cwd}
        projectName={project.title}
        selectedPath={surface?.kind === "file" && !surface.attachment ? surface.relativePath : null}
        selectedPathRevealId={surface?.kind === "file" ? surface.revealRequestId : 0}
        onOpenFile={(path) => useRightPanelStore.getState().openFile(ref, path)}
        onClose={() => setOpen(false)}
        workspaceMutationId={
          open ? deriveWorkspaceMutationId(items, checkpoints.at(-1)?.completedAt ?? null) : null
        }
      />
    </FileExplorerPane>
  );
}
