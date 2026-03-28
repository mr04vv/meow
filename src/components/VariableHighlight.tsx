interface VariableHighlightProps {
  text: string;
  variables: Record<string, string>;
}

/**
 * Renders text with {{variable}} tokens highlighted (visual only, no interaction).
 * - Green: variable exists in environment
 * - Orange: variable not found in environment
 */
export function VariableHighlight({ text, variables }: VariableHighlightProps) {
  const parts = parseVariableTokens(text);

  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={i}>{part.value}</span>;
        }
        const exists = variables[part.varName] !== undefined;
        return (
          <span
            key={i}
            className={`rounded ${
              exists
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-orange-500/20 text-orange-400"
            }`}
          >
            {part.value}
          </span>
        );
      })}
    </span>
  );
}

interface Token {
  type: "text" | "variable";
  value: string;
  varName: string;
}

function parseVariableTokens(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index), varName: "" });
    }
    tokens.push({ type: "variable", value: match[0], varName: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex), varName: "" });
  }

  if (tokens.length === 0) {
    tokens.push({ type: "text", value: text, varName: "" });
  }

  return tokens;
}
