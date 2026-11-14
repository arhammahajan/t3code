import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useComposerDraftStore } from "./composerDraftStore";
import { useTerminalUiStateStore } from "./terminalUiStateStore";
import { surfaceTitle } from "./panelSurfaceTitle";
import { useRightPanelStore, type RightPanelSurface } from "./rightPanelStore";
import { useWorkspaceStore, workspaceGroups, type WorkspaceSource } from "./workspaceStore";

function sourceFor(ref: ScopedThreadRef, surface: RightPanelSurface): WorkspaceSource {
  return {
    kind: "surface",
    ref,
    draftId: useComposerDraftStore.getState().getDraftIdByRef(ref),
    surfaceId: surface.id,
    surfaceKind: surface.kind,
    title: surfaceTitle(surface, {}, new Map()),
  };
}

/** Resource stores retain runtime ownership; this subscription projects their opens into editor groups. */
export function connectWorkspacePanels() {
  const unsubscribePanels = useRightPanelStore.subscribe((next, previous) => {
    if (next.byThreadKey === previous.byThreadKey) return;
    for (const [key, before] of Object.entries(previous.byThreadKey)) {
      const after = next.byThreadKey[key];
      if (before === after) continue;
      const ref = parseScopedThreadKey(key);
      if (!ref) continue;
      for (const surface of before.surfaces) {
        if (!after?.surfaces.some((entry) => entry.id === surface.id))
          useWorkspaceStore.getState().removeSurface(ref, surface.id);
      }
    }
    for (const [key, after] of Object.entries(next.byThreadKey)) {
      const before = previous.byThreadKey[key];
      if (after === before) continue;
      const ref = parseScopedThreadKey(key);
      if (!ref) continue;
      const closing = next.closeRevisionByThreadKey[key] !== previous.closeRevisionByThreadKey[key];
      const opening =
        !closing &&
        after.isOpen &&
        (!before?.isOpen ||
          before.activeSurfaceId !== after.activeSurfaceId ||
          next.userActionRevisionByThreadKey[key] !== previous.userActionRevisionByThreadKey[key]);
      for (const surface of after.surfaces) {
        const existing = before?.surfaces.find((entry) => entry.id === surface.id);
        if (opening && surface.id === after.activeSurfaceId)
          useWorkspaceStore.getState().open(sourceFor(ref, surface));
        else if (!existing) useWorkspaceStore.getState().open(sourceFor(ref, surface), false);
      }
    }
  });
  const unsubscribeTerminals = useTerminalUiStateStore.subscribe((next, previous) => {
    for (const [key, terminal] of Object.entries(next.terminalUiStateByThreadKey)) {
      if (!terminal.terminalOpen || terminal === previous.terminalUiStateByThreadKey[key]) continue;
      const ref = parseScopedThreadKey(key);
      if (!ref) continue;
      for (const terminalId of terminal.terminalIds)
        useRightPanelStore.getState().openTerminal(ref, terminalId);
      if (terminal.activeTerminalId)
        useRightPanelStore.getState().activateSurface(ref, `terminal:${terminal.activeTerminalId}`);
      useTerminalUiStateStore.getState().setTerminalOpen(ref, false);
    }
  });
  return () => {
    unsubscribePanels();
    unsubscribeTerminals();
  };
}

export function restoreWorkspacePanels(ref: ScopedThreadRef) {
  const state = useRightPanelStore.getState().byThreadKey[scopedThreadKey(ref)];
  if (!state) return;
  const openSources = workspaceGroups(useWorkspaceStore.getState().root)
    .flatMap((group) => group.tabs)
    .map((tab) => tab.source);
  for (const source of openSources) {
    if (
      source.kind === "surface" &&
      scopedThreadKey(source.ref) === scopedThreadKey(ref) &&
      !state.surfaces.some((surface) => surface.id === source.surfaceId)
    ) {
      useWorkspaceStore.getState().removeSurface(ref, source.surfaceId);
    }
  }
}
