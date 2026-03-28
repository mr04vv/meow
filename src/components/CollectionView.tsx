import { useCallback, useEffect, useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { CognitoAuthForm } from "@/components/CognitoAuthForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { CollectionVariable } from "@/store/collectionStore";
import { useCollectionStore } from "@/store/collectionStore";
import type { AuthConfig } from "@/store/requestStore";

export function CollectionView() {
  const {
    collections,
    requests,
    activeCollectionId,
    environments,
    activeEnvironmentId,
    variables,
    loadEnvironments,
    createEnvironment,
    setActiveEnvironment,
    deleteEnvironment,
    upsertVariable,
    deleteVariable,
    updateCollectionAuth,
    loadRequests,
  } = useCollectionStore();

  const collection = activeCollectionId
    ? (collections.find((c) => c.id === activeCollectionId) ?? null)
    : null;
  const childCollections = activeCollectionId
    ? collections.filter((c) => c.parent_id === activeCollectionId)
    : [];

  const [auth, setAuth] = useState<AuthConfig>({ type: "none" });
  const [saving, setSaving] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");
  const [addingEnv, setAddingEnv] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newIsSecret, setNewIsSecret] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  // Load environments when active collection changes
  useEffect(() => {
    if (activeCollectionId) {
      loadEnvironments(activeCollectionId);
    }
  }, [activeCollectionId, loadEnvironments]);

  // Initialize auth state from collection record
  useEffect(() => {
    if (!collection) return;
    if (collection.auth_type && collection.auth_config) {
      try {
        const parsed = JSON.parse(collection.auth_config) as Omit<AuthConfig, "type">;
        setAuth({ type: collection.auth_type as AuthConfig["type"], ...parsed });
      } catch {
        setAuth({ type: (collection.auth_type as AuthConfig["type"]) ?? "none" });
      }
    } else {
      setAuth({ type: (collection.auth_type as AuthConfig["type"]) ?? "none" });
    }
  }, [collection?.id, collection?.auth_type, collection?.auth_config]);

  // Load requests for child collections to show endpoint counts
  useEffect(() => {
    for (const col of childCollections) {
      if (!requests[col.id]) {
        loadRequests(col.id);
      }
    }
  }, [childCollections.length]);

  const handleSaveAuth = useCallback(async () => {
    if (!activeCollectionId) return;
    setSaving(true);
    try {
      const { type, ...rest } = auth;
      await updateCollectionAuth(
        activeCollectionId,
        type === "none" ? null : type,
        type === "none" ? null : JSON.stringify(rest)
      );
      toast.success("Authentication settings saved.");
    } catch (e) {
      toast.error(`Failed to save auth: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [activeCollectionId, auth, updateCollectionAuth]);

  const handleAddVariable = useCallback(async () => {
    if (!newKey.trim() || !activeEnvironmentId) return;
    try {
      await upsertVariable(activeEnvironmentId, newKey.trim(), newValue, newIsSecret);
      setNewKey("");
      setNewValue("");
      setNewIsSecret(false);
    } catch (e) {
      toast.error(`Failed to add variable: ${String(e)}`);
    }
  }, [activeEnvironmentId, newKey, newValue, newIsSecret, upsertVariable]);

  const handleDeleteVariable = useCallback(
    async (variable: CollectionVariable) => {
      try {
        await deleteVariable(variable.id);
      } catch (e) {
        toast.error(`Failed to delete variable: ${String(e)}`);
      }
    },
    [deleteVariable]
  );

  const handleAddEnvironment = useCallback(async () => {
    if (!newEnvName.trim() || !activeCollectionId) return;
    try {
      await createEnvironment(activeCollectionId, newEnvName.trim());
      setNewEnvName("");
      setAddingEnv(false);
    } catch (e) {
      toast.error(`Failed to create environment: ${String(e)}`);
    }
  }, [activeCollectionId, newEnvName, createEnvironment]);

  const handleDeleteEnvironment = useCallback(
    async (id: string) => {
      try {
        await deleteEnvironment(id);
      } catch (e) {
        toast.error(`Failed to delete environment: ${String(e)}`);
      }
    },
    [deleteEnvironment]
  );

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const endpointCount = (id: string) => (requests[id] ?? []).length;

  if (!collection) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a collection to view its settings.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 flex flex-col gap-6 max-w-2xl">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{collection.name}</h1>
          {collection.spec_path && (
            <p className="text-xs text-muted-foreground font-mono">
              spec: {collection.spec_path}
            </p>
          )}
        </div>

        <Separator />

        {/* Environments */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Environments
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => setAddingEnv(true)}
            >
              <PlusIcon className="size-3" />
              Add
            </Button>
          </div>

          {environments.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {environments.map((env) => (
                <div key={env.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => setActiveEnvironment(activeCollectionId!, env.id)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      activeEnvironmentId === env.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    {env.name}
                  </button>
                  <button
                    onClick={() => handleDeleteEnvironment(env.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5 rounded"
                    title="Delete environment"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingEnv && (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                placeholder="Environment name (e.g. dev, stg, prod)"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddEnvironment();
                  if (e.key === "Escape") {
                    setAddingEnv(false);
                    setNewEnvName("");
                  }
                }}
                className="h-8 text-xs flex-1"
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleAddEnvironment}
                disabled={!newEnvName.trim()}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setAddingEnv(false);
                  setNewEnvName("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {environments.length === 0 && !addingEnv && (
            <p className="text-xs text-muted-foreground">
              No environments yet. Add one to manage variables.
            </p>
          )}
        </div>

        {/* Variables */}
        {activeEnvironmentId && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Variables
              </Label>

              {variables.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-1/3">
                          Key
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                          Value
                        </th>
                        <th className="w-16 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {variables.map((v) => {
                        const revealed = revealedIds.has(v.id);
                        return (
                          <tr key={v.id} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2 font-mono">{v.key}</td>
                            <td className="px-3 py-2 font-mono">
                              {v.is_secret && !revealed ? (
                                <span className="text-muted-foreground tracking-widest">
                                  ••••••••
                                </span>
                              ) : (
                                v.value
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1 justify-end">
                                {v.is_secret && (
                                  <button
                                    onClick={() => toggleReveal(v.id)}
                                    className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                                    title={revealed ? "Hide" : "Reveal"}
                                  >
                                    {revealed ? (
                                      <EyeOffIcon className="size-3.5" />
                                    ) : (
                                      <EyeIcon className="size-3.5" />
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteVariable(v)}
                                  className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                                  title="Delete variable"
                                >
                                  <Trash2Icon className="size-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add variable row */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="KEY"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="h-8 text-xs font-mono w-36 shrink-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddVariable();
                  }}
                />
                <Input
                  placeholder="value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="h-8 text-xs font-mono flex-1"
                  type={newIsSecret ? "password" : "text"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddVariable();
                  }}
                />
                <button
                  onClick={() => setNewIsSecret((v) => !v)}
                  className={`p-1.5 rounded border text-xs shrink-0 transition-colors ${
                    newIsSecret
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={newIsSecret ? "Secret (masked)" : "Plain text"}
                >
                  {newIsSecret ? (
                    <EyeOffIcon className="size-3.5" />
                  ) : (
                    <EyeIcon className="size-3.5" />
                  )}
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs shrink-0"
                  onClick={handleAddVariable}
                  disabled={!newKey.trim()}
                >
                  <PlusIcon className="size-3.5" />
                  Add
                </Button>
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Authentication */}
        <div className="flex flex-col gap-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Authentication
          </Label>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Type</span>
              <Select
                value={auth.type}
                onValueChange={(v) => setAuth({ type: v as AuthConfig["type"] })}
              >
                <SelectTrigger className="h-8 text-xs w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="cognito">AWS Cognito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {auth.type === "bearer" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Token</span>
                <Input
                  placeholder="{{BEARER_TOKEN}}"
                  value={auth.bearerToken ?? ""}
                  onChange={(e) => setAuth({ ...auth, bearerToken: e.target.value })}
                  className="font-mono text-xs h-8 flex-1"
                />
              </div>
            )}

            {auth.type === "api_key" && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Key Name</span>
                  <Input
                    placeholder="X-API-Key"
                    value={auth.apiKeyName ?? ""}
                    onChange={(e) => setAuth({ ...auth, apiKeyName: e.target.value })}
                    className="font-mono text-xs h-8 flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Key Value</span>
                  <Input
                    placeholder="{{API_KEY}}"
                    value={auth.apiKeyValue ?? ""}
                    onChange={(e) => setAuth({ ...auth, apiKeyValue: e.target.value })}
                    className="font-mono text-xs h-8 flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Add to</span>
                  <Select
                    value={auth.apiKeyIn ?? "header"}
                    onValueChange={(v) =>
                      setAuth({ ...auth, apiKeyIn: v as "header" | "query" })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header">Header</SelectItem>
                      <SelectItem value="query">Query Param</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {auth.type === "basic" && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Username</span>
                  <Input
                    placeholder="{{BASIC_USERNAME}}"
                    value={auth.basicUsername ?? ""}
                    onChange={(e) => setAuth({ ...auth, basicUsername: e.target.value })}
                    className="text-xs h-8 flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Password</span>
                  <Input
                    type="password"
                    placeholder="{{BASIC_PASSWORD}}"
                    value={auth.basicPassword ?? ""}
                    onChange={(e) => setAuth({ ...auth, basicPassword: e.target.value })}
                    className="text-xs h-8 flex-1"
                  />
                </div>
              </>
            )}

            {auth.type === "cognito" && (
              <CognitoAuthForm auth={auth} onChange={setAuth} />
            )}

            {auth.type === "none" && (
              <p className="text-xs text-muted-foreground">
                No authentication will be applied to requests in this collection.
              </p>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveAuth}
                disabled={saving}
                className="gap-1.5 h-8 text-xs"
              >
                {saving ? (
                  <>
                    <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <SaveIcon className="size-3.5" />
                    Save Auth
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Subfolders */}
        {childCollections.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Subfolders
              </Label>
              <div className="flex flex-col gap-1">
                {childCollections.map((col) => (
                  <div
                    key={col.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/10"
                  >
                    <FolderIcon className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 truncate">{col.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {endpointCount(col.id)} endpoints
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
