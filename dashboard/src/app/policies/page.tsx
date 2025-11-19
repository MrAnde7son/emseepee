"use client";

import { useState } from "react";
import { usePolicies } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PoliciesPage() {
  const { data, isLoading, refetch } = usePolicies();
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this policy?")) return;
    setDeletingPolicy(id);
    try {
      await Api.deletePolicy(id);
      await refetch();
    } catch (error) {
      console.error("Failed to delete policy:", error);
      alert(`Failed to delete policy: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDeletingPolicy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Policies</h1>
          <p className="text-xs text-muted-foreground">
            View and manage policies that control which agents can call which tools.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreateDialog(true)}
        >
          New policy
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading policies...</div>}

      {data && (
        <div className="border border-border rounded-xl divide-y divide-border text-xs">
          {data.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1.5fr,1fr,1fr,auto,auto,auto] gap-2 px-3 py-2 items-center bg-card/50"
            >
              <div>
                <div className="text-foreground text-sm">{p.name}</div>
                {p.description && (
                  <div className="text-[11px] text-muted-foreground line-clamp-1">
                    {p.description}
                  </div>
                )}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">{p.scope}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{p.effect}</div>
              <div className="text-[11px] text-foreground">{p.priority}</div>
              <div>
                <Badge
                  variant={p.enabled ? "default" : "outline"}
                >
                  {p.enabled ? "enabled" : "disabled"}
                </Badge>
              </div>
              <div className="flex gap-1 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => setEditingPolicy(p.id)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 text-red-400 hover:text-red-300"
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingPolicy === p.id}
                >
                  {deletingPolicy === p.id ? "..." : "Delete"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Policy</DialogTitle>
            <DialogDescription>
              Create a new policy rule. Note: Full policy editing requires direct config.json editing.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground py-4">
            Policy creation via UI is coming soon. For now, please edit config.json directly.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {editingPolicy && (
        <Dialog open={!!editingPolicy} onOpenChange={(open) => !open && setEditingPolicy(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Policy</DialogTitle>
              <DialogDescription>
                Edit policy rule. Note: Full policy editing requires direct config.json editing.
              </DialogDescription>
            </DialogHeader>
            <div className="text-sm text-muted-foreground py-4">
              Policy editing via UI is coming soon. For now, please edit config.json directly.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPolicy(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

