import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEnvironmentStore } from "@/store/environmentStore";
import type { Variable } from "@/store/environmentStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function EnvironmentManager({ open, onClose }: Props) {
  const {
    environments,
    variables,
    loadEnvironments,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    loadVariables,
    upsertVariable,
    deleteVariable,
  } = useEnvironmentStore();

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState("");
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editingEnvName, setEditingEnvName] = useState("");
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarValue, setNewVarValue] = useState("");
  const [newVarIsSecret, setNewVarIsSecret] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      loadEnvironments();
    }
  }, [open, loadEnvironments]);

  useEffect(() => {
    if (selectedEnvId) {
      loadVariables(selectedEnvId);
    }
  }, [selectedEnvId, loadVariables]);

  const selectedEnv = environments.find((e) => e.id === selectedEnvId);
  const envVars = selectedEnvId ? (variables[selectedEnvId] ?? []) : [];

  const handleCreateEnv = async () => {
    if (!newEnvName.trim()) return;
    await createEnvironment(newEnvName.trim());
    setNewEnvName("");
  };

  const handleRenameEnv = async () => {
    if (!editingEnvId || !editingEnvName.trim()) return;
    await updateEnvironment(editingEnvId, editingEnvName.trim());
    setEditingEnvId(null);
    setEditingEnvName("");
  };

  const handleAddVar = async () => {
    if (!selectedEnvId || !newVarKey.trim()) return;
    await upsertVariable(selectedEnvId, newVarKey.trim(), newVarValue, newVarIsSecret);
    setNewVarKey("");
    setNewVarValue("");
    setNewVarIsSecret(false);
  };

  const toggleSecret = (varId: string) => {
    setShowSecrets((prev) => ({ ...prev, [varId]: !prev[varId] }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Environment Manager</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-96">
          {/* Left: Environment list */}
          <div className="w-44 shrink-0 flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Environments
            </span>
            <ScrollArea className="flex-1 border rounded-md">
              <div className="p-1 flex flex-col gap-0.5">
                {environments.map((env) => (
                  <div
                    key={env.id}
                    onClick={() => setSelectedEnvId(env.id)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group text-xs hover:bg-muted/60 ${
                      selectedEnvId === env.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="truncate flex-1">{env.name}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEnvId(env.id);
                          setEditingEnvName(env.name);
                        }}
                        className="hover:text-foreground p-0.5"
                      >
                        <PencilIcon className="size-2.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEnvironment(env.id);
                          if (selectedEnvId === env.id) setSelectedEnvId(null);
                        }}
                        className="hover:text-destructive p-0.5"
                      >
                        <Trash2Icon className="size-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Add new environment */}
            <div className="flex gap-1">
              <Input
                placeholder="New env..."
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateEnv()}
                className="h-7 text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCreateEnv}
              >
                <PlusIcon className="size-3" />
              </Button>
            </div>
          </div>

          {/* Right: Variables */}
          <div className="flex-1 flex flex-col gap-2">
            {editingEnvId && (
              <div className="flex items-center gap-2 p-2 bg-muted/30 rounded border">
                <Input
                  value={editingEnvName}
                  onChange={(e) => setEditingEnvName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameEnv();
                    if (e.key === "Escape") setEditingEnvId(null);
                  }}
                  className="h-7 text-xs"
                  autoFocus
                />
                <Button size="sm" className="h-7 text-xs" onClick={handleRenameEnv}>
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setEditingEnvId(null)}
                >
                  Cancel
                </Button>
              </div>
            )}

            {selectedEnv ? (
              <>
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  Variables — {selectedEnv.name}
                </span>

                <ScrollArea className="flex-1 border rounded-md">
                  <div className="p-2 flex flex-col gap-1.5">
                    {envVars.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        No variables yet
                      </p>
                    )}
                    {envVars.map((v) => (
                      <VariableRow
                        key={v.id}
                        variable={v}
                        showSecret={showSecrets[v.id] ?? false}
                        onToggleSecret={() => toggleSecret(v.id)}
                        onDelete={() =>
                          deleteVariable(v.id, selectedEnvId!)
                        }
                        onUpdate={(key, value, isSecret) =>
                          upsertVariable(selectedEnvId!, key, value, isSecret)
                        }
                      />
                    ))}
                  </div>
                </ScrollArea>

                {/* Add variable */}
                <div className="flex gap-1.5 items-center">
                  <Input
                    placeholder="KEY"
                    value={newVarKey}
                    onChange={(e) => setNewVarKey(e.target.value)}
                    className="h-7 text-xs font-mono w-32"
                  />
                  <Input
                    placeholder="value"
                    type={newVarIsSecret ? "password" : "text"}
                    value={newVarValue}
                    onChange={(e) => setNewVarValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddVar()}
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <button
                    onClick={() => setNewVarIsSecret((v) => !v)}
                    className={`text-xs px-1.5 py-1 rounded border h-7 transition-colors ${
                      newVarIsSecret
                        ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-600"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    title={newVarIsSecret ? "Secret" : "Not secret"}
                  >
                    <Label className="text-[10px] cursor-pointer">
                      {newVarIsSecret ? "secret" : "plain"}
                    </Label>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={handleAddVar}
                  >
                    <PlusIcon className="size-3" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Select an environment to manage variables
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VariableRowProps {
  variable: Variable;
  showSecret: boolean;
  onToggleSecret: () => void;
  onDelete: () => void;
  onUpdate: (key: string, value: string, isSecret: boolean) => Promise<void>;
}

function VariableRow({
  variable,
  showSecret,
  onToggleSecret,
  onDelete,
}: VariableRowProps) {
  return (
    <div className="flex items-center gap-1.5 group">
      <span className="font-mono text-xs text-muted-foreground w-28 truncate shrink-0">
        {variable.key}
      </span>
      <span className="font-mono text-xs flex-1 truncate">
        {variable.is_secret && !showSecret
          ? "••••••••"
          : variable.value}
      </span>
      <div className="flex gap-0.5 shrink-0">
        {variable.is_secret && (
          <button
            onClick={onToggleSecret}
            className="text-muted-foreground hover:text-foreground p-0.5"
          >
            {showSecret ? (
              <EyeOffIcon className="size-3" />
            ) : (
              <EyeIcon className="size-3" />
            )}
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive p-0.5 opacity-0 group-hover:opacity-100"
        >
          <Trash2Icon className="size-3" />
        </button>
      </div>
    </div>
  );
}
