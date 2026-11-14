import * as monaco from "monaco-editor";
import { useLayoutEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  useComposerDraftStore,
  composerTargetKey,
  resolveComposerDraftKey,
  type ComposerThreadTarget,
} from "~/composerDraftStore";
import { buildFileReviewComment } from "~/reviewCommentContext";
import { observeResize } from "~/lib/observeResize";
import { DiffCommentAnnotation } from "../diffs/DiffCommentAnnotation";
import { formatFileCommentRange, nextFileCommentId } from "./fileCommentAnnotations";

interface CommentZone extends monaco.editor.IViewZone {
  id: string;
  zoneId: string;
  contentNode: HTMLDivElement;
  widget: monaco.editor.IOverlayWidget;
  decoration: monaco.editor.IEditorDecorationsCollection;
  kind: "draft" | "comment";
  text: string;
  range: monaco.Range;
  remove: () => void;
}

export function MonacoFileComments({
  editor,
  environmentId,
  projectId,
  relativePath,
  target,
}: {
  editor: monaco.editor.IStandaloneCodeEditor;
  environmentId: EnvironmentId;
  projectId?: ProjectId | undefined;
  relativePath: string;
  target: ComposerThreadTarget;
}) {
  const [zones, setZones] = useState<CommentZone[]>([]);
  const targetKey = composerTargetKey(target);
  const getTarget = useEffectEvent(() => target);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns Monaco decorations, view zones, and review-store subscriptions for this editor
  useLayoutEffect(() => {
    const target = getTarget();
    const model = editor.getModel();
    if (!model) return;
    const entries = new Map<string, CommentZone>();
    const store = useComposerDraftStore;
    const rangeFor = (start: number, end: number) => {
      const last = model.getLineCount();
      const firstLine = Math.max(1, Math.min(start, end, last));
      const lastLine = Math.max(firstLine, Math.min(Math.max(start, end), last));
      return new monaco.Range(firstLine, 1, lastLine, model.getLineMaxColumn(lastLine));
    };
    const createDecoration = (range: monaco.Range) =>
      editor.createDecorationsCollection([
        {
          range,
          options: {
            isWholeLine: true,
            className: "monaco-review-range",
            glyphMarginClassName: "codicon codicon-comment monaco-review-comment",
            glyphMarginHoverMessage: { value: "Comment on these lines" },
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        },
      ]);
    const removeZone = (zone: CommentZone) => {
      if (editor.getModel() === model) {
        editor.changeViewZones((accessor) => accessor.removeZone(zone.zoneId));
        editor.removeOverlayWidget(zone.widget);
      }
      zone.decoration.clear();
      entries.delete(zone.id);
    };
    const addZone = (id: string, kind: CommentZone["kind"], range: monaco.Range, text: string) => {
      const contentNode = document.createElement("div");
      const layout = () => {
        const info = editor.getLayoutInfo();
        contentNode.style.left = `${info.contentLeft}px`;
        contentNode.style.width = `${info.contentWidth}px`;
      };
      layout();
      // Monaco hides view zones from assistive tech; an overlay holds the interactive form.
      const widget: monaco.editor.IOverlayWidget = {
        getId: () => id,
        getDomNode: () => contentNode,
        getPosition: () => null,
      };
      const zone: CommentZone = {
        id,
        contentNode,
        widget,
        showInHiddenAreas: true,
        onDomNodeTop: (top) => {
          contentNode.style.top = `${top}px`;
        },
        kind,
        range,
        text,
        domNode: document.createElement("div"),
        afterLineNumber: range.endLineNumber,
        heightInPx: kind === "draft" ? 150 : 64,
        suppressMouseDown: false,
        zoneId: "",
        decoration: createDecoration(range),
        remove: () => {
          removeZone(zone);
          setZones([...entries.values()]);
        },
      };
      contentNode.className = "bg-background text-foreground";
      contentNode.dataset.reviewOwner = targetKey;
      editor.addOverlayWidget(widget);
      editor.changeViewZones((accessor) => {
        zone.zoneId = accessor.addZone(zone);
      });
      entries.set(id, zone);
      return zone;
    };
    const sync = () => {
      const comments =
        store
          .getState()
          .getComposerDraft(target)
          ?.reviewComments.filter((comment) => comment.sectionId === `file:${relativePath}`) ?? [];
      const ids = new Set(comments.map((comment) => comment.id));
      for (const zone of entries.values()) {
        if (zone.kind === "comment" && !ids.has(zone.id)) removeZone(zone);
      }
      for (const comment of comments) {
        let zone = entries.get(comment.id);
        const range = rangeFor(comment.startIndex + 1, comment.endIndex + 1);
        if (!zone) zone = addZone(comment.id, "comment", range, comment.text);
        zone.kind = "comment";
        zone.text = comment.text;
        const tracked = zone.decoration.getRange(0);
        if (!tracked) zone.decoration = createDecoration(range);
        zone.range = tracked ?? range;
        zone.afterLineNumber = zone.range.endLineNumber;
        editor.changeViewZones((accessor) => accessor.layoutZone(zone.zoneId));
      }
      setZones([...entries.values()]);
    };
    const beginComment = (line?: number) => {
      for (const zone of entries.values()) if (zone.kind === "draft") removeZone(zone);
      const selection = editor.getSelection();
      const inSelection =
        selection &&
        line !== undefined &&
        line >= selection.startLineNumber &&
        line <= selection.endLineNumber;
      const range =
        line !== undefined && !inSelection
          ? rangeFor(line, line)
          : rangeFor(
              selection?.startLineNumber ?? 1,
              selection &&
                selection.endColumn === 1 &&
                selection.endLineNumber > selection.startLineNumber
                ? selection.endLineNumber - 1
                : (selection?.endLineNumber ?? 1),
            );
      addZone(nextFileCommentId(), "draft", range, "");
      setZones([...entries.values()]);
      editor.revealLineInCenterIfOutsideViewport(range.endLineNumber);
    };
    const action = editor.addAction({
      id: "t3.addFileComment",
      label: "Add comment to agent",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 2,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyM],
      run: () => beginComment(),
    });
    const layout = editor.onDidLayoutChange((info) => {
      for (const zone of entries.values()) {
        zone.contentNode.style.left = `${info.contentLeft}px`;
        zone.contentNode.style.width = `${info.contentWidth}px`;
      }
    });
    const hover = editor.createDecorationsCollection();
    const mouseMove = editor.onMouseMove((event) => {
      const line = event.target.position?.lineNumber;
      hover.set(
        line
          ? [
              {
                range: new monaco.Range(line, 1, line, 1),
                options: {
                  glyphMarginClassName: "monaco-review-add",
                  glyphMarginHoverMessage: { value: "Add comment to agent" },
                },
              },
            ]
          : [],
      );
    });
    const mouseLeave = editor.onMouseLeave(() => hover.clear());
    const mouseDown = editor.onMouseDown((event) => {
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      event.event.preventDefault();
      beginComment(event.target.position?.lineNumber);
    });
    const content = model.onDidChangeContent(() => {
      if (entries.size === 0) return;
      const comments = store.getState().getComposerDraft(target)?.reviewComments ?? [];
      for (const zone of entries.values()) {
        const tracked = zone.decoration.getRange(0);
        zone.range = tracked ?? rangeFor(zone.range.startLineNumber, zone.range.endLineNumber);
        if (!tracked) zone.decoration = createDecoration(zone.range);
        zone.afterLineNumber = zone.range.endLineNumber;
        editor.changeViewZones((accessor) => accessor.layoutZone(zone.zoneId));
        const comment = comments.find((candidate) => candidate.id === zone.id);
        if (!comment) continue;
        const text = model.getValueInRange(
          rangeFor(zone.range.startLineNumber, zone.range.endLineNumber),
          monaco.editor.EndOfLinePreference.LF,
        );
        if (
          comment.startIndex === zone.range.startLineNumber - 1 &&
          comment.endIndex === zone.range.endLineNumber - 1 &&
          comment.diff === text
        )
          continue;
        store.getState().addReviewComment(
          target,
          buildFileReviewComment({
            id: zone.id,
            filePath: relativePath,
            text: comment.text,
            startLine: zone.range.startLineNumber,
            endLine: zone.range.endLineNumber,
            contents: model.getValue(monaco.editor.EndOfLinePreference.LF),
          }),
          { appendReference: false },
        );
      }
      setZones([...entries.values()]);
    });
    sync();
    const unsubscribe = store.subscribe((next, previous) => {
      const key = resolveComposerDraftKey(next, target);
      if (
        key &&
        next.draftsByThreadKey[key]?.reviewComments !==
          previous.draftsByThreadKey[key]?.reviewComments
      )
        sync();
    });
    return () => {
      unsubscribe();
      layout.dispose();
      content.dispose();
      action.dispose();
      mouseMove.dispose();
      mouseLeave.dispose();
      mouseDown.dispose();
      hover.clear();
      for (const zone of entries.values()) removeZone(zone);
    };
  }, [editor, relativePath, targetKey]);

  return zones.map((zone) =>
    createPortal(
      <div
        key={zone.id}
        ref={(element) => {
          if (!element) return;
          const measure = () => {
            const height = Math.ceil(element.getBoundingClientRect().height);
            if (height === 0 || height === zone.heightInPx) return;
            zone.heightInPx = height;
            editor.changeViewZones((accessor) => accessor.layoutZone(zone.zoneId));
          };
          measure();
          return observeResize(element, measure);
        }}
        className="border-y border-border py-1"
      >
        <div className="px-3 text-xs text-muted-foreground">
          {formatFileCommentRange(zone.range.startLineNumber, zone.range.endLineNumber)}
        </div>
        <DiffCommentAnnotation
          environmentId={environmentId}
          projectId={projectId}
          ownerKey={JSON.stringify([environmentId, target, relativePath, zone.id])}
          kind={zone.kind}
          rangeLabel={formatFileCommentRange(zone.range.startLineNumber, zone.range.endLineNumber)}
          text={zone.text}
          submitLabel="Add to message"
          onCancel={() => {
            if (zone.kind === "comment")
              useComposerDraftStore.getState().removeReviewComment(target, zone.id);
            else {
              zone.remove();
            }
            editor.focus();
          }}
          onComment={(text) => {
            const model = editor.getModel();
            if (!model) return;
            const range = zone.decoration.getRange(0) ?? zone.range;
            useComposerDraftStore.getState().addReviewComment(
              target,
              buildFileReviewComment({
                id: zone.id,
                filePath: relativePath,
                startLine: range.startLineNumber,
                endLine: range.endLineNumber,
                text,
                contents: model.getValue(monaco.editor.EndOfLinePreference.LF),
              }),
            );
            editor.focus();
          }}
          onDelete={() => useComposerDraftStore.getState().removeReviewComment(target, zone.id)}
        />
      </div>,
      zone.contentNode,
      zone.id,
    ),
  );
}
