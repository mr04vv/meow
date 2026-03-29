import { useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Decoration, ViewPlugin, hoverTooltip } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";

interface CodeMirrorUrlBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  variables: Record<string, string>;
  placeholder?: string;
}

const VARIABLE_RE = /\{\{([^}]+)\}\}/g;

function buildDecorations(view: EditorView, variables: Record<string, string>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  VARIABLE_RE.lastIndex = 0;
  let match;
  while ((match = VARIABLE_RE.exec(text)) !== null) {
    const varName = match[1];
    const exists = varName in variables;
    const deco = Decoration.mark({
      class: exists ? "cm-var-defined" : "cm-var-undefined",
    });
    builder.add(match.index, match.index + match[0].length, deco);
  }
  return builder.finish();
}

function variableHighlighter(variables: Record<string, string>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, variables);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, variables);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

function variableHoverTooltip(variables: Record<string, string>) {
  return hoverTooltip((view, pos) => {
    const text = view.state.doc.toString();
    VARIABLE_RE.lastIndex = 0;
    let match;
    while ((match = VARIABLE_RE.exec(text)) !== null) {
      if (pos >= match.index && pos <= match.index + match[0].length) {
        const varName = match[1];
        const exists = varName in variables;
        return {
          pos: match.index,
          end: match.index + match[0].length,
          above: false,
          create() {
            const dom = document.createElement("div");
            dom.className = "cm-var-tooltip";
            if (exists) {
              dom.innerHTML = `<div style="font-size:11px;color:#888">${varName}</div><div style="font-size:12px;font-family:monospace">${variables[varName]}</div>`;
            } else {
              dom.innerHTML = `<div style="font-size:11px;color:#f97316">${varName} — not defined</div>`;
            }
            return { dom };
          },
        };
      }
    }
    return null;
  });
}

const urlBarTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "hsl(var(--foreground))",
    fontSize: "14px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    height: "100%",
  },
  ".cm-content": {
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    height: "100%",
    caretColor: "hsl(var(--foreground))",
  },
  ".cm-line": {
    padding: "0",
    lineHeight: "36px",
  },
  ".cm-editor": {
    height: "100%",
  },
  ".cm-scroller": {
    overflow: "hidden",
    height: "100%",
    alignItems: "center",
  },
  ".cm-focused": {
    outline: "none",
  },
  "&.cm-focused": {
    outline: "none",
  },
}, { dark: true });

export function CodeMirrorUrlBar({
  value,
  onChange,
  onSend,
  variables,
  placeholder,
}: CodeMirrorUrlBarProps) {
  const extensions = useMemo(() => [
    urlBarTheme,
    variableHighlighter(variables),
    variableHoverTooltip(variables),
    EditorView.domEventHandlers({
      keydown(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          onSend();
          return true;
        }
      },
    }),
    EditorState.transactionFilter.of((tr) => {
      if (tr.newDoc.lines > 1) {
        return {
          ...tr,
          changes: {
            from: 0,
            to: tr.newDoc.length,
            insert: tr.newDoc.toString().replace(/\n/g, ""),
          },
        };
      }
      return tr;
    }),
    EditorView.lineWrapping,
  ], [variables, onSend]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      placeholder={placeholder}
      basicSetup={false}
      className="h-full flex-1"
    />
  );
}
