import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { useRightPanelStore } from "./rightPanelStore";
import { connectWorkspacePanels } from "./workspacePanels";
import { useWorkspaceStore, workspaceGroups } from "./workspaceStore";

it("routes resource opens into the focused group, preserves the explorer, and closes every view when its resource closes", () => {
  useWorkspaceStore.setState({
    root: { kind: "group", id: "main", tabs: [], activeTabId: null },
    activeGroupId: "main",
  });
  useRightPanelStore.setState({
    byThreadKey: {},
    userActionRevisionByThreadKey: {},
    closeRevisionByThreadKey: {},
  });
  const ref = {
    environmentId: EnvironmentId.make("workspace-panels"),
    threadId: ThreadId.make("thread"),
  };
  using _connection = { [Symbol.dispose]: connectWorkspacePanels() };
  const panels = useRightPanelStore.getState();
  panels.open(ref, "files");
  panels.openFile(ref, "src/index.ts", 12);
  let group = workspaceGroups(useWorkspaceStore.getState().root)[0]!;
  expect(
    group.tabs.map((tab) => (tab.source.kind === "surface" ? tab.source.surfaceId : "chat")),
  ).toEqual(["files", "file:src/index.ts"]);
  useWorkspaceStore.getState().split(group.id, "horizontal");
  panels.openFile(ref, "src/other.ts");
  const groups = workspaceGroups(useWorkspaceStore.getState().root);
  expect(groups[0]!.tabs).toHaveLength(2);
  expect(groups[1]!.tabs).toHaveLength(2);
  panels.openFile(ref, "src/index.ts", 42);
  group = workspaceGroups(useWorkspaceStore.getState().root)[1]!;
  expect(group.tabs).toHaveLength(2);
  expect(group.activeTabId).toBe(group.tabs[0]!.id);
  panels.closeSurface(ref, "file:src/index.ts");
  expect(
    workspaceGroups(useWorkspaceStore.getState().root)
      .flatMap((entry) => entry.tabs)
      .some((tab) => tab.source.kind === "surface" && tab.source.surfaceId === "file:src/index.ts"),
  ).toBe(false);
  useWorkspaceStore.setState({
    root: { kind: "group", id: "main", tabs: [], activeTabId: null },
    activeGroupId: "main",
  });
});
