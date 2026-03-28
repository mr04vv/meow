import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { AuthConfig } from "@/store/requestStore";

interface CollectionAuthSummary {
  type: AuthConfig["type"];
  collectionName: string;
}

interface Props {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
  /** When true, show the "Inherit from Collection" toggle */
  collectionAuth?: CollectionAuthSummary | null;
  inheritAuth?: boolean;
  onInheritChange?: (inherit: boolean) => void;
}

const AUTH_TYPE_LABELS: Record<AuthConfig["type"], string> = {
  none: "No Auth",
  bearer: "Bearer Token",
  basic: "Basic Auth",
  api_key: "API Key",
  cognito: "AWS Cognito",
};

export function AuthEditor({
  auth,
  onChange,
  collectionAuth,
  inheritAuth = false,
  onInheritChange,
}: Props) {
  const showInheritOption = collectionAuth !== undefined && collectionAuth !== null;

  return (
    <div className="flex flex-col gap-3">
      {/* Inherit from Collection toggle */}
      {showInheritOption && collectionAuth && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="inherit-auth"
                checked={inheritAuth}
                onCheckedChange={(checked) => onInheritChange?.(!!checked)}
              />
              <Label htmlFor="inherit-auth" className="text-xs cursor-pointer">
                Inherit from Collection
              </Label>
            </div>

            {inheritAuth && (
              <div className="ml-6 flex flex-col gap-1 text-xs text-muted-foreground">
                <span>
                  Using:{" "}
                  <span className="font-medium text-foreground">
                    {AUTH_TYPE_LABELS[collectionAuth.type] ?? collectionAuth.type}
                  </span>{" "}
                  ({collectionAuth.collectionName})
                </span>
              </div>
            )}
          </div>

          {!inheritAuth && <Separator />}
        </>
      )}

      {/* Custom auth form (shown when not inheriting) */}
      {!inheritAuth && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 shrink-0">
              Type
            </span>
            <Select
              value={auth.type}
              onValueChange={(v) =>
                onChange({ ...auth, type: v as AuthConfig["type"] })
              }
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Auth</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
                <SelectItem value="cognito">AWS Cognito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {auth.type === "bearer" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">
                Token
              </span>
              <Input
                placeholder="Bearer token"
                value={auth.bearerToken ?? ""}
                onChange={(e) => onChange({ ...auth, bearerToken: e.target.value })}
                className="font-mono text-xs h-8"
              />
            </div>
          )}

          {auth.type === "basic" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">
                  Username
                </span>
                <Input
                  placeholder="Username"
                  value={auth.basicUsername ?? ""}
                  onChange={(e) =>
                    onChange({ ...auth, basicUsername: e.target.value })
                  }
                  className="text-xs h-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">
                  Password
                </span>
                <Input
                  type="password"
                  placeholder="Password"
                  value={auth.basicPassword ?? ""}
                  onChange={(e) =>
                    onChange({ ...auth, basicPassword: e.target.value })
                  }
                  className="text-xs h-8"
                />
              </div>
            </>
          )}

          {auth.type === "api_key" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">
                  Key Name
                </span>
                <Input
                  placeholder="X-API-Key"
                  value={auth.apiKeyName ?? ""}
                  onChange={(e) =>
                    onChange({ ...auth, apiKeyName: e.target.value })
                  }
                  className="font-mono text-xs h-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">
                  Key Value
                </span>
                <Input
                  placeholder="API key value"
                  value={auth.apiKeyValue ?? ""}
                  onChange={(e) =>
                    onChange({ ...auth, apiKeyValue: e.target.value })
                  }
                  className="font-mono text-xs h-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">
                  Add to
                </span>
                <Select
                  value={auth.apiKeyIn ?? "header"}
                  onValueChange={(v) =>
                    onChange({ ...auth, apiKeyIn: v as "header" | "query" })
                  }
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
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

          {auth.type === "cognito" && (
            <p className="text-xs text-muted-foreground">
              Configure Cognito authentication in Collection Settings.
            </p>
          )}

          {auth.type === "none" && (
            <p className="text-xs text-muted-foreground">
              No authentication will be used.
            </p>
          )}
        </>
      )}
    </div>
  );
}
