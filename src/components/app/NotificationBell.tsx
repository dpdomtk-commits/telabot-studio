import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

const dot: Record<string, string> = {
  success: "bg-primary",
  error: "bg-destructive",
  warning: "bg-amber-500",
  info: "bg-muted-foreground",
};

export function NotificationBell() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const unread = (data ?? []).filter((n) => !n.read_at).length;

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" aria-hidden />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">
            Notificações {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
          </p>
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={unread === 0}>
            <CheckCheck /> Marcar lidas
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(data ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p>
          ) : (
            (data ?? []).map((n) => (
              <div key={n.id} className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[n.type] ?? dot["info"]}`} />
                <div className="min-w-0">
                  <p className={`text-sm ${n.read_at ? "text-muted-foreground" : "font-medium"}`}>{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{formatDate(n.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
