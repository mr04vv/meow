import { useMemo } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Decoration, ViewPlugin, hoverTooltip, tooltips } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";

interface CodeMirrorUrlBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  variables: Record<string, string>;
  onUpdateVariable?: (key: string, value: string) => void;
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

function variableHoverTooltip(
  variables: Record<string, string>,
  onUpdateVariable?: (key: string, value: string) => void,
) {
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
            dom.style.cssText = "min-width:200px;max-width:320px";

            // Variable name label
            const nameEl = document.createElement("div");
            nameEl.style.cssText = "font-size:11px;color:#888;font-weight:600;margin-bottom:4px";
            nameEl.textContent = varName;
            dom.appendChild(nameEl);

            if (!exists) {
              const msg = document.createElement("div");
              msg.style.cssText = "font-size:11px;color:#f97316;margin-bottom:4px";
              msg.textContent = "Not defined in active environment";
              dom.appendChild(msg);
            }

            // Editable input — auto-saves on blur or Enter
            const input = document.createElement("input");
            input.type = "text";
            input.value = exists ? variables[varName] : "";
            input.placeholder = exists ? "" : "Enter value...";
            input.style.cssText = "width:100%;height:26px;font-size:12px;font-family:ui-monospace,monospace;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:0 8px;color:#e5e5e5;outline:none;box-sizing:border-box";
            input.addEventListener("focus", () => { input.style.borderColor = "rgba(255,255,255,0.3)"; });

            const doSave = () => {
              if (onUpdateVariable && input.value !== (exists ? variables[varName] : "")) {
                onUpdateVariable(varName, input.value);
              }
            };

            input.addEventListener("blur", doSave);
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                doSave();
                input.blur();
              }
            });

            setTimeout(() => { input.focus(); }, 50);

            dom.appendChild(input);

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
    overflowX: "auto",
    overflowY: "hidden",
    height: "100%",
    alignItems: "center",
    scrollbarWidth: "none",
    "&::-webkit-scrollbar": { display: "none" },
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
  onUpdateVariable,
  placeholder,
}: CodeMirrorUrlBarProps) {
  const extensions = useMemo(() => [
    urlBarTheme,
    tooltips({ parent: document.body }),
    variableHighlighter(variables),
    variableHoverTooltip(variables, onUpdateVariable),
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
  ], [variables, onSend, onUpdateVariable]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="dark"
      placeholder={placeholder}
      basicSetup={false}
      className="h-full flex-1 cm-url-bar"
    />
  );
}
