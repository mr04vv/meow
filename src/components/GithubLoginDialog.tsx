import { GithubIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGithubStore } from "@/store/githubStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GithubLoginDialog({ open, onClose }: Props) {
  const { login, loading, error } = useGithubStore();

  const handleLogin = async () => {
    await login();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GithubIcon className="size-5" />
            Sign in with GitHub
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            GitHub アカウントでサインインして、リポジトリ内の API 定義を検出します。
          </p>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">
              {error}
            </p>
          )}

          <Button
            onClick={handleLogin}
            disabled={loading}
            className="w-full gap-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ブラウザで認証中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <GithubIcon className="size-4" />
                Sign in with GitHub
              </span>
            )}
          </Button>

          <p className="text-[10px] text-muted-foreground/60 text-center">
            ブラウザが開きます。GitHub で認証を許可してください。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
