import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { createMemoryStorage } from "./lib/storage";
import { describe, expect, it } from "vite-plus/test";
import { createWorkspaceStore, workspaceGroups, type WorkspaceSource } from "./workspaceStore";

const ref = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("thread") };
const chat: WorkspaceSource = { kind: "chat", ref, draftId: null, title: "Chat" };
const file: WorkspaceSource = {
  kind: "surface",
  ref,
  draftId: null,
  surfaceId: "file:a.ts",
  surfaceKind: "file",
  title: "a.ts",
};

describe("unified workspace", () => {
  it("opens every resource in the focused group, deduplicates, and keeps environments distinct", () => {
    const store = createWorkspaceStore();
    store.getState().open(chat);
    store.getState().open(file);
    store.getState().open(file);
    store
      .getState()
      .open({ ...file, ref: { ...ref, environmentId: EnvironmentId.make("remote") } });
    expect(workspaceGroups(store.getState().root)[0]!.tabs.map((tab) => tab.source.kind)).toEqual([
      "chat",
      "surface",
      "surface",
    ]);
  });

  it("splits in both directions, moves tabs, collapses empty groups, and joins without losing resources", () => {
    const store = createWorkspaceStore();
    store.getState().open(chat);
    store.getState().open(file);
    const firstId = store.getState().activeGroupId;
    store.getState().split(firstId, "horizontal");
    let groups = workspaceGroups(store.getState().root);
    expect(groups).toHaveLength(2);
    expect(groups[1]!.tabs[0]!.source).toEqual(file);
    store.getState().split(groups[1]!.id, "vertical");
    groups = workspaceGroups(store.getState().root);
    expect(groups).toHaveLength(3);
    const moved = groups[2]!.tabs[0]!;
    store.getState().move(moved.id, firstId, 0);
    groups = workspaceGroups(store.getState().root);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.tabs).toHaveLength(2);
    expect(groups[0]!.activeTabId).toBe(
      groups[0]!.tabs.find((tab) => tab.source.kind === "surface")!.id,
    );
    store.getState().join(groups[1]!.id);
    groups = workspaceGroups(store.getState().root);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.tabs.map((tab) => tab.source.kind)).toEqual(["chat", "surface"]);
  });

  it("closing a view preserves split copies and closing a resource removes all its views", () => {
    const store = createWorkspaceStore();
    store.getState().open(chat);
    store.getState().open(file);
    store.getState().split(store.getState().activeGroupId, "horizontal");
    const groups = workspaceGroups(store.getState().root);
    store.getState().close(groups[1]!.tabs[0]!.id);
    expect(workspaceGroups(store.getState().root)).toHaveLength(1);
    store.getState().removeSurface(ref, "file:a.ts");
    expect(workspaceGroups(store.getState().root)[0]!.tabs.map((tab) => tab.source.kind)).toEqual([
      "chat",
    ]);
  });

  it("promotes owners without replacing tab identity or activating the chat over a file", () => {
    const store = createWorkspaceStore();
    store.getState().open({ ...chat, draftId: "draft" as never });
    store.getState().open({ ...file, draftId: "draft" as never });
    const before = workspaceGroups(store.getState().root)[0]!;
    store.getState().updateOwner(ref, null, "Renamed");
    const after = workspaceGroups(store.getState().root)[0]!;
    expect(after.activeTabId).toBe(before.activeTabId);
    expect(after.tabs.map((tab) => tab.id)).toEqual(before.tabs.map((tab) => tab.id));
    expect(after.tabs[0]!.source.title).toBe("Renamed");
    expect(after.tabs.every((tab) => tab.source.draftId === null)).toBe(true);
  });
  it("restores nested groups and sizes, and rejects malformed persisted layouts", () => {
    const storage = createMemoryStorage();
    const store = createWorkspaceStore(storage);
    store.getState().open(chat);
    store.getState().open(file);
    store.getState().split(store.getState().activeGroupId, "horizontal");
    store.getState().split(store.getState().activeGroupId, "vertical");
    const root = store.getState().root;
    store.getState().resize(root.id, 0.7);
    const restored = createWorkspaceStore(storage);
    expect(restored.getState().root).toEqual(store.getState().root);
    expect(restored.getState().activeGroupId).toBe(store.getState().activeGroupId);
    storage.setItem(
      "t3code:workspace:v1",
      JSON.stringify({
        state: { root: { ...root, ratio: null }, activeGroupId: "missing" },
        version: 0,
      }),
    );
    const invalid = createWorkspaceStore(storage);
    expect(workspaceGroups(invalid.getState().root)).toHaveLength(1);
    expect(workspaceGroups(invalid.getState().root)[0]!.tabs).toEqual([]);
  });
  it("keeps restored file focus through repeated route effects and opens chats only for new external navigation", () => {
    const store = createWorkspaceStore();
    store.getState().open(chat);
    store.getState().open(file);
    const group = workspaceGroups(store.getState().root)[0]!;
    const fileTabId = group.activeTabId!;
    store.getState().receiveRoute(chat, "initial", null, false);
    store.getState().receiveRoute(chat, "initial", null, false);
    expect(workspaceGroups(store.getState().root)[0]!.activeTabId).toBe(fileTabId);
    store.getState().receiveRoute(chat, "external", null, false);
    expect(workspaceGroups(store.getState().root)[0]!.activeTabId).toBe(group.tabs[0]!.id);
    store.getState().receiveRoute(chat, "workspace", fileTabId, false);
    expect(workspaceGroups(store.getState().root)[0]!.activeTabId).toBe(fileTabId);
    store.getState().receiveRoute(null, "settings", null, true);
    store.getState().receiveRoute(chat, "return", null, false);
    expect(workspaceGroups(store.getState().root)[0]!.activeTabId).toBe(fileTabId);
  });
});
