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
}

type TokenStatus = "not_authenticated" | "valid" | "expired";

interface Props {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
  collectionId?: string | null;
}

export function CognitoAuthForm({ auth, onChange, collectionId }: Props) {
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("not_authenticated");
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);

  const clientId = auth.cognitoClientId ?? "";
  const username = auth.cognitoUsername ?? "";
  const password = auth.cognitoPassword ?? "";
  const region = auth.cognitoRegion ?? "";

  // Load stored token status
  useEffect(() => {
    if (!collectionId) return;
    checkStoredToken();
    const interval = setInterval(checkStoredToken, 30_000);
    return () => clearInterval(interval);
  }, [collectionId]);

  const checkStoredToken = async () => {
    if (!collectionId) return;
    try {
      const stored = (await invoke("cognito_get_stored_token", {
        collectionId,
      })) as { expires_in: number } | null;

      if (!stored) {
        setTokenStatus("not_authenticated");
        setMinutesRemaining(null);
        return;
      }

      if (stored.expires_in > 0) {
        setTokenStatus("valid");
        setMinutesRemaining(Math.floor(stored.expires_in / 60));
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
    if (!clientId || !username || !password || !region) return;
    setAuthenticating(true);
    setError(null);
    try {
      const result = (await invoke("cognito_authenticate", {
        collectionId: collectionId ?? null,
        clientId,
        username,
        password,
        region,
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
        <span className="text-xs text-muted-foreground w-20 shrink-0">Region</span>
        <Input
          placeholder="ap-northeast-1"
          value={region}
          onChange={(e) => onChange({ ...auth, cognitoRegion: e.target.value })}
          className="font-mono text-xs h-8 flex-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">Client ID</span>
        <Input
          placeholder="{{COGNITO_CLIENT_ID}}"
          value={clientId}
          onChange={(e) => onChange({ ...auth, cognitoClientId: e.target.value })}
          className="font-mono text-xs h-8 flex-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">Username</span>
        <Input
          placeholder="{{COGNITO_USERNAME}}"
          value={username}
          onChange={(e) => onChange({ ...auth, cognitoUsername: e.target.value })}
          className="text-xs h-8 flex-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-20 shrink-0">Password</span>
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
          disabled={authenticating || !clientId || !username || !password || !region}
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

        <TokenStatusBadge status={tokenStatus} minutesRemaining={minutesRemaining} />
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
        Valid {minutesRemaining !== null && `(${minutesRemaining}m)`}
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
  return <span className="text-xs text-muted-foreground">Not authenticated</span>;
}
