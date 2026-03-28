import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircleIcon, KeyRoundIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthConfig } from "@/store/requestStore";

interface CognitoToken {
  id_token: string;
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  issued_at: number;
}

interface StoredToken {
  id_token: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
}

type TokenStatus = "not_authenticated" | "valid" | "expired";

interface Props {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

function deriveRegion(userPoolId: string): string {
  const match = userPoolId.match(/^([a-z]+-[a-z]+-\d+)_/);
  return match ? match[1] : "";
}

export function CognitoAuthForm({ auth, onChange }: Props) {
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("not_authenticated");
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);

  const userPoolId = auth.cognitoUserPoolId ?? "";
  const clientId = auth.cognitoClientId ?? "";
  const username = auth.cognitoUsername ?? "";
  const password = auth.cognitoPassword ?? "";
  const region = deriveRegion(userPoolId) || (auth.cognitoRegion ?? "");

  // Load stored token on mount and periodically refresh status
  useEffect(() => {
    if (!userPoolId || !clientId) {
      setTokenStatus("not_authenticated");
      return;
    }
    checkStoredToken();
    const interval = setInterval(checkStoredToken, 30_000);
    return () => clearInterval(interval);
  }, [userPoolId, clientId]);

  const checkStoredToken = async () => {
    if (!userPoolId || !clientId) return;
    try {
      const stored = (await invoke("cognito_get_stored_token", {
        userPoolId,
        clientId,
      })) as StoredToken | null;

      if (!stored) {
        setTokenStatus("not_authenticated");
        setMinutesRemaining(null);
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = stored.expires_at - nowSec;
      if (remaining > 0) {
        setTokenStatus("valid");
        setMinutesRemaining(Math.floor(remaining / 60));
      } else {
        setTokenStatus("expired");
        setMinutesRemaining(null);
      }
    } catch {
      setTokenStatus("not_authenticated");
      setMinutesRemaining(null);
    }
  };

  const handleAuthenticate = async () => {
    if (!userPoolId || !clientId || !username || !password) return;
    setAuthenticating(true);
    setError(null);
    try {
      const effectiveRegion = region || deriveRegion(userPoolId);
      const result = (await invoke("cognito_authenticate", {
        userPoolId,
        clientId,
        username,
        password,
        region: effectiveRegion,
      })) as CognitoToken;

      setTokenStatus("valid");
      setMinutesRemaining(Math.floor(result.expires_in / 60));
    } catch (e) {
      setError(String(e));
      setTokenStatus("not_authenticated");
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">
          User Pool ID
        </span>
        <Input
          placeholder="{{COGNITO_POOL_ID}}"
          value={userPoolId}
          onChange={(e) => {
            const val = e.target.value;
            const derivedRegion = deriveRegion(val);
            onChange({
              ...auth,
              cognitoUserPoolId: val,
              cognitoRegion: derivedRegion || auth.cognitoRegion,
            });
          }}
          className="font-mono text-xs h-8 flex-1"
        />
      </div>

      {region && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-20 shrink-0">
            Region
          </span>
          <span className="font-mono text-xs text-muted-foreground">{region}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">
          Client ID
        </span>
        <Input
          placeholder="{{COGNITO_CLIENT_ID}}"
          value={clientId}
          onChange={(e) => onChange({ ...auth, cognitoClientId: e.target.value })}
          className="font-mono text-xs h-8 flex-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">
          Username
        </span>
        <Input
          placeholder="{{COGNITO_USERNAME}}"
          value={username}
          onChange={(e) => onChange({ ...auth, cognitoUsername: e.target.value })}
          className="text-xs h-8 flex-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">
          Password
        </span>
        <Input
          type="password"
          placeholder="{{COGNITO_PASSWORD}}"
          value={password}
          onChange={(e) => onChange({ ...auth, cognitoPassword: e.target.value })}
          className="text-xs h-8 flex-1"
        />
      </div>

      <div className="flex items-center gap-2 mt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={handleAuthenticate}
          disabled={
            authenticating ||
            !userPoolId ||
            !clientId ||
            !username ||
            !password
          }
        >
          {authenticating ? (
            <>
              <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Authenticating...
            </>
          ) : (
            <>
              <KeyRoundIcon className="size-3" />
              Authenticate
            </>
          )}
        </Button>

        <TokenStatusBadge
          status={tokenStatus}
          minutesRemaining={minutesRemaining}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded break-all">
          {error}
        </p>
      )}
    </div>
  );
}

function TokenStatusBadge({
  status,
  minutesRemaining,
}: {
  status: TokenStatus;
  minutesRemaining: number | null;
}) {
  if (status === "valid") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-500">
        <CheckCircleIcon className="size-3" />
        Valid
        {minutesRemaining !== null && ` (${minutesRemaining}m remaining)`}
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-500">
        <XCircleIcon className="size-3" />
        Expired
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">Not authenticated</span>
  );
}
