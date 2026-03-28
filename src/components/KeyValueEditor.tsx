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

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: Props) {
  const update = (id: string, field: keyof KeyValuePair, val: string | boolean) => {
    const updated = pairs.map((p) => (p.id === id ? { ...p, [field]: val } : p));
    // Auto-add empty row if the last row has a key
    const last = updated[updated.length - 1];
    if (last && (last.key || last.value)) {
      onChange([
        ...updated,
        { id: `kv-${Date.now()}`, key: "", value: "", description: "", enabled: true },
      ]);
    } else {
      onChange(updated);
    }
  };

  const remove = (id: string) => {
    onChange(pairs.filter((p) => p.id !== id));
  };

  // Ensure at least one empty row
  const rows =
    pairs.length === 0 || pairs[pairs.length - 1].key || pairs[pairs.length - 1].value
      ? [
          ...pairs,
          { id: `kv-new-${Date.now()}`, key: "", value: "", description: "", enabled: true },
        ]
      : pairs;

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
        {rows.map((pair, idx) => {
          const isNewRow = idx === rows.length - 1 && !pair.key && !pair.value;
          return (
            <TableRow
              key={pair.id}
              className={`hover:bg-muted/30 ${!pair.enabled && !isNewRow ? "opacity-50" : ""}`}
            >
              <TableCell className="px-2 py-1 w-8">
                {!isNewRow && (
                  <Checkbox
                    checked={pair.enabled}
                    onCheckedChange={(v) => update(pair.id, "enabled", !!v)}
                    className="size-3.5"
                  />
                )}
              </TableCell>
              <TableCell className="px-2 py-1">
                <Input
                  placeholder={isNewRow ? keyPlaceholder : ""}
                  value={pair.key}
                  onChange={(e) => update(pair.id, "key", e.target.value)}
                  className="h-7 font-mono text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring"
                />
              </TableCell>
              <TableCell className="px-2 py-1">
                <Input
                  placeholder={isNewRow ? valuePlaceholder : ""}
                  value={pair.value}
                  onChange={(e) => update(pair.id, "value", e.target.value)}
                  className="h-7 font-mono text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring"
                />
              </TableCell>
              <TableCell className="px-2 py-1">
                <Input
                  placeholder={isNewRow ? "Description" : ""}
                  value={pair.description ?? ""}
                  onChange={(e) => update(pair.id, "description", e.target.value)}
                  className="h-7 text-[13px] border-0 bg-transparent px-1 focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground"
                />
              </TableCell>
              <TableCell className="px-2 py-1 w-8">
                {!isNewRow && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(pair.id)}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}
