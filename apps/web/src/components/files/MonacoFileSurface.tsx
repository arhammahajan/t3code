import "culori/css";
import { formatHex, formatHex8, parse } from "culori/fn";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { MonacoFileComments } from "./MonacoFileComments";
import type { ComposerThreadTarget } from "~/composerDraftStore";
import { setProjectFileQueryData } from "./projectFilesQueryState";
import { changeFileSaveSession, useFileSaveSession } from "./fileSaveSessions";

self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === "typescript" || label === "javascript") return new TypeScriptWorker();
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    return new EditorWorker();
  },
};

type CachedModel = {
  model: monaco.editor.ITextModel;
  view: monaco.editor.ICodeEditorViewState | null;
  leases: number;
};
// Keep undo and cursor history across tab switches, with a bound on inactive models.
const models = new Map<string, CachedModel>();
function releaseModel(key: string, entry: CachedModel) {
  entry.leases--;
  models.delete(key);
  models.set(key, entry);
  const inactive = [...models].filter(([, value]) => value.leases === 0);
  for (const [oldKey, value] of inactive.slice(0, Math.max(0, inactive.length - 20))) {
    value.model.dispose();
    models.delete(oldKey);
  }
}

interface Props {
  readOnly?: boolean;
  commentTarget?: ComposerThreadTarget | undefined;
  projectId?: ProjectId | undefined;
  environmentId: EnvironmentId;
  cwd: string;
  relativePath: string;
  contents: string;
  resolvedTheme: "light" | "dark";
  wordWrap: boolean;
  revealLine: number | null;
  revealRequestId: number;
  onPendingChange: (path: string, pending: boolean) => void;
}

export default function MonacoFileSurface(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { environmentId, cwd, relativePath } = props;
  useFileSaveSession({ environmentId, cwd, relativePath }, props.onPendingChange);
  const onChange = useEffectEvent((contents: string) => {
    if (props.readOnly) return;
    setProjectFileQueryData(environmentId, cwd, relativePath, contents);
    changeFileSaveSession({ environmentId, cwd, relativePath }, contents);
  });
  const initialContents = useEffectEvent(() => props.contents);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the imperative Monaco editor and its model lease for this file surface
  useEffect(() => {
    if (!container.current) return;
    const key = JSON.stringify([environmentId, cwd, relativePath]);
    let entry = models.get(key);
    if (!entry) {
      const uri = monaco.Uri.from({
        scheme: "t3-file",
        authority: encodeURIComponent(environmentId),
        path: `/${encodeURIComponent(cwd)}/${relativePath}`,
      });
      entry = {
        model: monaco.editor.createModel(initialContents(), undefined, uri),
        view: null,
        leases: 0,
      };
      models.set(key, entry);
    }
    entry.leases++;
    const editor = monaco.editor.create(container.current, {
      model: entry.model,
      automaticLayout: true,
      minimap: { enabled: false },
      // Monaco's word highlighter rejects an uncaught cancellation when disposed during a tab switch.
      occurrencesHighlight: "off",
      fontSize: 13,
      fontFamily: "'SF Mono', Menlo, Monaco, monospace",
      lineHeight: 21,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 12,
      renderLineHighlight: "gutter",
      overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
      scrollBeyondLastLine: false,
      ariaLabel: `Code editor: ${relativePath}`,
      cursorBlinking: "solid",
      smoothScrolling: false,
      padding: { top: 12 },
    });
    editorRef.current = editor;
    setEditor(editor);
    if (entry.view) editor.restoreViewState(entry.view);
    const listener = editor.onDidChangeModelContent((event) => {
      if (!event.isFlush) onChange(editor.getValue());
    });
    return () => {
      entry.view = editor.saveViewState();
      listener.dispose();
      editor.dispose();
      editorRef.current = null;
      releaseModel(key, entry);
    };
  }, [environmentId, cwd, relativePath]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- applies refreshed disk contents and appearance preferences to Monaco without replacing its model on edit echoes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== props.contents) editor.setValue(props.contents);
    editor.updateOptions({
      wordWrap: props.wordWrap ? "on" : "off",
      readOnly: props.readOnly ?? false,
      glyphMargin: props.commentTarget !== undefined,
    });
  }, [props.contents, props.wordWrap, props.readOnly, props.commentTarget]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- maps app palette changes, including live theme previews, to Monaco's imperative theme API
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const applyTheme = () => {
      const probe = document.createElement("span");
      root.append(probe);
      const color = (token: string, fallback: string, alpha = false) => {
        probe.style.color = `var(--${token}, ${fallback})`;
        return (alpha ? formatHex8 : formatHex)(parse(getComputedStyle(probe).color)) ?? fallback;
      };
      const dark = props.resolvedTheme === "dark";
      const background = color("background", dark ? "#141414" : "#ffffff");
      const foreground = color("foreground", dark ? "#eeeeee" : "#202020");
      const muted = color("muted-foreground", dark ? "#888888" : "#777777");
      const accent = color("ring", "#6688cc");
      const panel = color("popover", background);
      const border = color("border", dark ? "#333333" : "#dddddd", true);
      probe.remove();
      monaco.editor.defineTheme("t3-workspace", {
        base: dark ? "vs-dark" : "vs",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": background,
          "editor.foreground": foreground,
          "editorGutter.background": background,
          "editorLineNumber.foreground": muted,
          "editorLineNumber.activeForeground": foreground,
          "editor.lineHighlightBackground": "#00000000",
          "editor.lineHighlightBorder": "#00000000",
          "editor.selectionBackground": `${accent}40`,
          "editor.inactiveSelectionBackground": `${accent}25`,
          "editorWidget.background": panel,
          "editorWidget.border": border,
          "editorSuggestWidget.background": panel,
          "editorSuggestWidget.border": border,
          "editorSuggestWidget.foreground": foreground,
          focusBorder: accent,
          "scrollbar.shadow": "#00000000",
          "editorOverviewRuler.border": "#00000000",
        },
      });
      monaco.editor.setTheme("t3-workspace");
    };
    applyTheme();
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, [props.resolvedTheme]);
  const reveal = { line: props.revealLine, requestId: props.revealRequestId };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- forwards file-link line reveal requests to the imperative editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal.line) return;
    editor.setPosition({ lineNumber: reveal.line, column: 1 });
    editor.revealLineInCenter(reveal.line);
  }, [reveal]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div ref={container} className="min-h-0 min-w-0 flex-1" />
      {editor && props.commentTarget ? (
        <MonacoFileComments
          editor={editor}
          environmentId={environmentId}
          projectId={props.projectId}
          relativePath={relativePath}
          target={props.commentTarget}
        />
      ) : null}
    </div>
  );
}
