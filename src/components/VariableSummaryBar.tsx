import { useEffect, useRef, useState } from "react";
import { CheckIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VariableSummaryBarProps {
  text: string;
  variables: Record<string, string>;
  onUpdateVariable?: (key: string, value: string) => void;
}

/**
 * Displays a compact summary bar below the URL input showing all {{variables}}
 * with their resolved values. Click to edit.
 */
export function VariableSummaryBar({ text, variables, onUpdateVariable }: VariableSummaryBarProps) {
  const varNames = extractVariableNames(text);
  if (varNames.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-t bg-muted/20 text-[11px]">
      {varNames.map((name) => (
        <VariableChip
          key={name}
          name={name}
          value={variables[name]}
          onUpdate={onUpdateVariable}
        />
      ))}
    </div>
  );
}

function VariableChip({
  name,
  value,
  onUpdate,
}: {
  name: string;
  value: string | undefined;
  onUpdate?: (key: string, value: string) => void;
}) {
  const exists = value !== undefined;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(value ?? "");
  }, [value]);

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(name, editValue);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5 border border-border">
        <span className="font-mono text-muted-foreground">{name}=</span>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={handleSave}
          className="h-5 text-[11px] font-mono w-32 px-1 py-0 border-0 bg-transparent focus-visible:ring-0"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4"
          onClick={handleSave}
        >
          <CheckIcon className="size-2.5" />
        </Button>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
        exists
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-orange-500/10 text-orange-400 border border-orange-500/20"
      }`}
    >
      <span className="font-mono">{name}</span>
      {exists ? (
        <>
          <span className="text-muted-foreground">=</span>
          <span className="font-mono text-foreground max-w-[200px] truncate">{value}</span>
          {onUpdate && (
            <button
              onClick={() => setEditing(true)}
              className="text-muted-foreground hover:text-foreground ml-0.5"
            >
              <PencilIcon className="size-2.5" />
            </button>
          )}
        </>
      ) : (
        <span className="text-orange-400/70 ml-0.5">undefined</span>
      )}
    </span>
  );
}

function extractVariableNames(text: string): string[] {
  const names: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }
  return names;
}
