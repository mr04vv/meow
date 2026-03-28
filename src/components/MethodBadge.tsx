import { cn } from "@/lib/utils";

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-emerald-600 text-white",
  POST: "bg-blue-600 text-white",
  PUT: "bg-orange-600 text-white",
  PATCH: "bg-purple-600 text-white",
  DELETE: "bg-red-600 text-white",
  HEAD: "bg-zinc-600 text-white",
  OPTIONS: "bg-zinc-600 text-white",
};

interface Props {
  method: string;
  size?: "xs" | "sm";
}

export function MethodBadge({ method, size = "sm" }: Props) {
  const style = METHOD_STYLES[method.toUpperCase()] ?? METHOD_STYLES.GET;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-mono font-bold uppercase rounded-sm shrink-0",
        size === "xs"
          ? "text-[9px] px-1 py-0 h-4 min-w-[30px]"
          : "text-[10px] px-1.5 py-0.5 min-w-[44px]",
        style
      )}
    >
      {method.toUpperCase()}
    </span>
  );
}
