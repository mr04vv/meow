import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { KeyValuePair } from "@/store/requestStore";

interface Props {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

/** Placeholder row that buffers input locally until blur/Enter, then promotes to a real pair */
function NewRow({
  keyPlaceholder,
  valuePlaceholder,
  onAdd,
}: {
  keyPlaceholder: string;
  valuePlaceholder: string;
  onAdd: (pair: Omit<KeyValuePair, "id">) => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");

  const flush = () => {
    if (!key && !value) return;
    onAdd({ key, value, description: desc, enabled: true });
    setKey("");
    setValue("");
    setDesc("");
  };

  return (
    <TableRow className="hover:bg-muted/30">
      <TableCell className="px-2 py-1 w-8" />
      <TableCell className="px-2 py-1">
        <Input
          placeholder={keyPlaceholder}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => { if (e.key === "Enter") flush(); }}
          className="h-7 font-mono text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring"
        />
      </TableCell>
      <TableCell className="px-2 py-1">
        <Input
          placeholder={valuePlaceholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => { if (e.key === "Enter") flush(); }}
          className="h-7 font-mono text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring"
        />
      </TableCell>
      <TableCell className="px-2 py-1">
        <Input
          placeholder="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => { if (e.key === "Enter") flush(); }}
          className="h-7 text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground"
        />
      </TableCell>
      <TableCell className="px-2 py-1 w-8" />
    </TableRow>
  );
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: Props) {
  const update = (id: string, field: keyof KeyValuePair, val: string | boolean) => {
    onChange(pairs.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const remove = (id: string) => {
    onChange(pairs.filter((p) => p.id !== id));
  };

  const addPair = (pair: Omit<KeyValuePair, "id">) => {
    onChange([...pairs, { ...pair, id: crypto.randomUUID() }]);
  };

  return (
    <div className="w-full overflow-x-auto">
    <Table className="table-fixed w-full">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8 px-2"></TableHead>
          <TableHead className="w-[30%] text-[11px] px-2">Key</TableHead>
          <TableHead className="w-[30%] text-[11px] px-2">Value</TableHead>
          <TableHead className="text-[11px] px-2">Description</TableHead>
          <TableHead className="w-8 px-2"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pairs.map((pair) => (
          <TableRow
            key={pair.id}
            className={`hover:bg-muted/30 ${!pair.enabled ? "opacity-50" : ""}`}
          >
            <TableCell className="px-2 py-1 w-8">
              <Checkbox
                checked={pair.enabled}
                onCheckedChange={(v) => update(pair.id, "enabled", !!v)}
                className="size-3.5"
              />
            </TableCell>
            <TableCell className="px-2 py-1">
              <Input
                value={pair.key}
                onChange={(e) => update(pair.id, "key", e.target.value)}
                className="h-7 font-mono text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring"
              />
            </TableCell>
            <TableCell className="px-2 py-1">
              <Input
                value={pair.value}
                onChange={(e) => update(pair.id, "value", e.target.value)}
                className="h-7 font-mono text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring"
              />
            </TableCell>
            <TableCell className="px-2 py-1">
              <Input
                value={pair.description ?? ""}
                onChange={(e) => update(pair.id, "description", e.target.value)}
                className="h-7 text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground"
              />
            </TableCell>
            <TableCell className="px-2 py-1 w-8">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => remove(pair.id)}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </TableCell>
          </TableRow>
        ))}

        <NewRow
          keyPlaceholder={keyPlaceholder}
          valuePlaceholder={valuePlaceholder}
          onAdd={addPair}
        />
      </TableBody>
    </Table>
    </div>
  );
}
