import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { accentClasses, nodeByType } from "@/lib/flow-nodes";
import { cn } from "@/lib/utils";

export type FlowNodeData = {
  type: string;
  title: string;
  config: Record<string, unknown>;
};

function summarize(type: string, config: Record<string, unknown>): string {
  const value = (key: string) => {
    const v = config[key];
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  };
  switch (type) {
    case "start":
      return value("trigger") || "/start";
    case "pix":
    case "upsell":
    case "downsell":
    case "order_bump":
    case "pack":
      return [value("product_name"), value("amount") && `R$ ${value("amount")}`].filter(Boolean).join(" · ");
    case "subscription":
      return [value("plan_name"), value("amount") && `R$ ${value("amount")}`].filter(Boolean).join(" · ");
    case "delay":
      return value("seconds") ? `${value("seconds")}s` : "";
    case "condition":
      return [value("variable"), value("operator"), value("value")].filter(Boolean).join(" ");
    default:
      return value("text") || value("caption") || value("message") || value("url") || "";
  }
}

export const FlowNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as FlowNodeData;
  const def = nodeByType[nodeData.type];
  const Icon = def?.icon;
  const outputs = def?.outputs ?? ["saída"];
  const summary = summarize(nodeData.type, nodeData.config ?? {});

  return (
    <div
      className={cn(
        "x",
        def ? accentClasses[def.accent] : "border-border",
        selected && "border-primary/60 shadow-[var(--glow-violet-strong)] scale-[1.02]",
      )}
    >
      {nodeData.type !== "start" && (
        <Handle type="target" position={Position.Left} className="!size-2.5 !border-none !bg-primary !shadow-[0_0_10px_2px_color-mix(in_oklab,var(--color-primary-glow)_70%,transparent)]" />
      )}

      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        {Icon ? <Icon className="size-4 shrink-0" /> : null}
        <span className="truncate text-sm font-semibold text-foreground">{nodeData.title}</span>
      </div>

      <div className="px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{def?.label ?? nodeData.type}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{summary || "Sem configuração"}</p>
      </div>

      <div className="flex flex-col items-end gap-3 px-3 pb-3">
        {outputs.map((label, index) => (
          <div key={label} className="relative flex h-3 items-center">
            <span className="pr-3 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
            <Handle
              id={label}
              type="source"
              position={Position.Right}
              style={{ top: "50%", right: -6 }}
              className={cn("!size-2.5 !border-none", index === 0
                ? "!bg-primary !shadow-[0_0_10px_2px_color-mix(in_oklab,var(--color-primary-glow)_70%,transparent)]"
                : "!bg-muted-foreground")}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

FlowNode.displayName = "FlowNode";

export const flowNodeTypes = { flowNode: FlowNode };
