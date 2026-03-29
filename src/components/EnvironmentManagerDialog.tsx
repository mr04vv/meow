import { useEffect, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollectionStore } from "@/store/collectionStore";

interface EnvironmentManagerDialogProps {
  open: boolean;
  onClose: () => void;
  collectionId: string | null;
}

export function EnvironmentManagerDialog({
  open,
  onClose,
  collectionId,
}: EnvironmentManagerDialogProps) {
  const {
    environments,
    activeEnvironmentId,
    setActiveEnvironment,
    createEnvironment,
    deleteEnvironment,
    variableKeys,
    variables,
    loadVariables,
    createVariableKey,
    deleteVariableKey,
    upsertVariableValue,
  } = useCollectionStore();

  const [newEnvName, setNewEnvName] = useState("");
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarValue, setNewVarValue] = useState("");
  const [newVarSecret, setNewVarSecret] = useState(false);

  const activeEnvId = activeEnvironmentId ?? environments[0]?.id;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm">Manage Environments</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          {/* Add Environment */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="New environment name (e.g., dev, staging, prod)"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              className="h-8 text-xs flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newEnvName.trim() && collectionId) {
                  createEnvironment(collectionId, newEnvName.trim());
                  setNewEnvName("");
                }
              }}
            />
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              disabled={!newEnvName.trim() || !collectionId}
              onClick={() => {
                if (collectionId && newEnvName.trim()) {
                  createEnvironment(collectionId, newEnvName.trim());
                  setNewEnvName("");
                }
              }}
            >
              <PlusIcon className="size-3" />
              Add
            </Button>
          </div>

          {/* Environment Tabs */}
          {environments.length > 0 ? (
            <Tabs
              value={activeEnvId}
              onValueChange={(v) => {
                if (collectionId) {
                  setActiveEnvironment(collectionId, v);
                }
              }}
              className="flex-1 min-h-0 flex flex-col"
            >
              <TabsList className="h-8 bg-muted/30 w-full justify-start gap-0 shrink-0">
                {environments.map((env) => (
                  <TabsTrigger key={env.id} value={env.id} className="text-xs h-7 px-3 gap-1.5">
                    {env.name}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEnvironment(env.id);
                      }}
                      className="text-muted-foreground/50 hover:text-destructive ml-1"
                      title="Delete environment"
                    >
                      <Trash2Icon className="size-2.5" />
                    </button>
                  </TabsTrigger>
                ))}
              </TabsList>

              {environments.map((env) => (
                <TabsContent key={env.id} value={env.id} className="flex-1 min-h-0 m-0 mt-2">
                  <div className="flex flex-col gap-2 h-full">
                    <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">
                      Variables
                    </Label>

                    {/* Variables list */}
                    <div className="flex-1 min-h-0 overflow-auto">
                      <div className="rounded border border-border overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Key</th>
                              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Value</th>
                              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground w-16">Secret</th>
                              <th className="w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {variableKeys.map((vk) => {
                              const v = variables.find((x) => x.key_id === vk.id);
                              return (
                                <tr key={vk.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                                  <td className="px-3 py-1">
                                    <span className="font-mono text-foreground">{vk.key}</span>
                                  </td>
                                  <td className="px-3 py-1">
                                    <EnvVarInput
                                      initialValue={v?.value ?? ""}
                                      isSecret={vk.is_secret}
                                      onSave={async (newValue) => {
                                        await upsertVariableValue(vk.id, env.id, newValue);
                                        if (collectionId) {
                                          await loadVariables(collectionId, env.id);
                                        }
                                      }}
                                    />
                                  </td>
                                  <td className="px-3 py-1 text-center">
                                    {vk.is_secret && <span className="text-yellow-500 text-[10px]">secret</span>}
                                  </td>
                                  <td className="px-1 py-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                      onClick={() => deleteVariableKey(vk.id)}
                                    >
                                      <Trash2Icon className="size-3" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Add variable */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        placeholder="KEY"
                        value={newVarKey}
                        onChange={(e) => setNewVarKey(e.target.value)}
                        className="h-7 text-xs font-mono flex-1"
                      />
                      <Input
                        placeholder="value"
                        value={newVarValue}
                        onChange={(e) => setNewVarValue(e.target.value)}
                        className="h-7 text-xs font-mono flex-1"
                        type={newVarSecret ? "password" : "text"}
                      />
                      <div className="flex items-center gap-1">
                        <Checkbox
                          id="new-var-secret"
                          checked={newVarSecret}
                          onCheckedChange={(v) => setNewVarSecret(!!v)}
                          className="size-3.5"
                        />
                        <Label htmlFor="new-var-secret" className="text-[10px] text-muted-foreground">
                          Secret
                        </Label>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!newVarKey.trim() || !collectionId}
                        onClick={async () => {
                          if (newVarKey.trim() && collectionId) {
                            const vk = await createVariableKey(collectionId, newVarKey.trim(), newVarSecret);
                            await upsertVariableValue(vk.id, env.id, newVarValue);
                            await loadVariables(collectionId, env.id);
                            setNewVarKey("");
                            setNewVarValue("");
                            setNewVarSecret(false);
                          }
                        }}
                      >
                        <PlusIcon className="size-3" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              No environments yet. Add one above.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EnvVarInput({
  initialValue,
  isSecret,
  onSave,
}: {
  initialValue: string;
  isSecret: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) onSave(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (value !== initialValue) onSave(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      type={isSecret ? "password" : "text"}
      className="h-6 text-xs font-mono border-transparent bg-transparent focus:border-border focus:bg-background px-1"
    />
  );
}
