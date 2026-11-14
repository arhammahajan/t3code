import "~/index.css";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as monaco from "monaco-editor";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { useComposerDraftStore } from "~/composerDraftStore";
import { act, render } from "../../../test/render";
import MonacoFileSurface from "./MonacoFileSurface";

const { save, updateQuery } = vi.hoisted(() => ({ save: vi.fn(), updateQuery: vi.fn() }));
vi.mock(import("./fileSaveSessions"), () => ({
  useFileSaveSession: () => {},
  changeFileSaveSession: save,
}));
vi.mock(import("./projectFilesQueryState"), () => ({ setProjectFileQueryData: updateQuery }));

describe("Monaco file surface", () => {
  it("retains undo across an edit echo and tab switch, and does not save external refreshes", async () => {
    save.mockReset();
    updateQuery.mockReset();
    const props = {
      environmentId: EnvironmentId.make("monaco-browser"),
      cwd: "/workspace",
      relativePath: "history.ts",
      contents: "const value = 1;",
      resolvedTheme: "dark" as const,
      wordWrap: false,
      revealLine: null,
      revealRequestId: 0,
      onPendingChange: () => {},
    };
    await using screen = await render(<MonacoFileSurface {...props} />, {
      router: false, // The editor has no routing dependencies.
    });
    const model = monaco.editor
      .getModels()
      .find((candidate) => candidate.uri.path.endsWith("/history.ts"))!;
    expect(model.getLanguageId()).toBe("typescript");
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: "const value = 2;" }],
      () => null,
    );
    model.pushStackElement();
    await screen.rerender(<MonacoFileSurface {...props} contents="const value = 2;" />);
    await screen.rerender(<div>Another tab</div>);
    await screen.rerender(<MonacoFileSurface {...props} contents="const value = 2;" />);
    expect(model.canUndo()).toBe(true);
    model.undo();
    expect(model.getValue()).toBe("const value = 1;");
    save.mockClear();
    updateQuery.mockClear();
    await screen.rerender(<MonacoFileSurface {...props} contents="const external = 3;" />);
    expect(model.getValue()).toBe("const external = 3;");
    expect(save).not.toHaveBeenCalled();
    expect(updateQuery).not.toHaveBeenCalled();
  });
});

it("queues inline comments, tracks edits and undo, restores them across tabs, and removes them with the composer", async () => {
  save.mockReset();
  updateQuery.mockReset();
  const store = useComposerDraftStore;
  const before = store.getState().draftsByThreadKey;
  using _drafts = { [Symbol.dispose]: () => store.setState({ draftsByThreadKey: before }) };
  const target = {
    environmentId: EnvironmentId.make("monaco-comments"),
    threadId: ThreadId.make("review"),
  };
  const props = {
    environmentId: target.environmentId,
    cwd: "/workspace",
    relativePath: "comments.ts",
    contents: "const header = 0;\nconst first = 1;\nconst second = 2;\n",
    resolvedTheme: "dark" as const,
    wordWrap: true,
    revealLine: null,
    revealRequestId: 0,
    commentTarget: target,
    onPendingChange: () => {},
  };
  const surface = (readOnly = false) => (
    <div style={{ height: 600, width: 800, display: "flex" }}>
      <MonacoFileSurface {...props} readOnly={readOnly} />
    </div>
  );
  await using screen = await render(surface());
  const editor = monaco.editor
    .getEditors()
    .find((candidate) => candidate.getModel()?.uri.path.endsWith("/comments.ts"))!;
  const model = editor.getModel()!;
  editor.layout({ width: 800, height: 600 });
  editor.setSelection(new monaco.Selection(2, 1, 3, model.getLineMaxColumn(3)));
  await act(() => editor.getAction("t3.addFileComment")!.run());
  await page
    .getByRole("textbox", { name: "Comment on lines L2 to L3" })
    .fill("Keep these together.");
  await page.getByRole("button", { name: "Add to message", exact: true }).click();
  const comment = () => store.getState().getComposerDraft(target)!.reviewComments[0]!;
  expect(comment()).toMatchObject({
    startIndex: 1,
    endIndex: 2,
    text: "Keep these together.",
    diff: "const first = 1;\nconst second = 2;",
  });
  const prompt = store.getState().getComposerDraft(target)!.prompt;
  model.pushStackElement();
  await act(() =>
    model.pushEditOperations(
      [],
      [{ range: new monaco.Range(1, 1, 1, 1), text: "// inserted\n" }],
      () => null,
    ),
  );
  model.pushStackElement();
  expect(comment()).toMatchObject({
    startIndex: 2,
    endIndex: 3,
    diff: "const first = 1;\nconst second = 2;",
  });
  expect(store.getState().getComposerDraft(target)!.prompt).toBe(prompt);
  await act(() => model.undo());
  expect(comment()).toMatchObject({ startIndex: 1, endIndex: 2 });
  model.pushStackElement();
  await act(() =>
    model.pushEditOperations(
      [],
      [{ range: new monaco.Range(2, 1, 2, model.getLineMaxColumn(2)), text: "const first = 20;" }],
      () => null,
    ),
  );
  model.pushStackElement();
  expect(comment().diff).toBe("const first = 20;\nconst second = 2;");
  await act(() => model.undo());
  expect(comment().diff).toBe("const first = 1;\nconst second = 2;");
  await screen.rerender(<div>Another tab</div>);
  save.mockClear();
  updateQuery.mockClear();
  await screen.rerender(surface(true));
  monaco.editor
    .getEditors()
    .find((candidate) => candidate.getModel() === model)!
    .layout({ width: 800, height: 600 });
  await expect.element(page.getByText("Keep these together.", { exact: true })).toBeVisible();
  expect(
    monaco.editor
      .getEditors()
      .find((candidate) => candidate.getModel() === model)!
      .getOption(monaco.editor.EditorOption.readOnly),
  ).toBe(true);
  await act(() => store.getState().removeReviewComment(target, comment().id));
  await expect
    .element(page.getByText("Keep these together.", { exact: true }))
    .not.toBeInTheDocument();
  const restored = monaco.editor.getEditors().find((candidate) => candidate.getModel() === model)!;
  await act(() => restored.getAction("t3.addFileComment")!.run());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await act(() =>
    model.pushEditOperations(
      [],
      [{ range: new monaco.Range(1, 1, 1, 1), text: "// change\n" }],
      () => null,
    ),
  );
  await expect
    .element(page.getByRole("button", { name: "Add to message", exact: true }))
    .not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  expect(updateQuery).not.toHaveBeenCalled();
});
