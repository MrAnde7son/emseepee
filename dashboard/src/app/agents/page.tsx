"use client";

import { Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AgentsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-xs text-muted-foreground">
          Manage and configure agents.
        </p>
      </div>
      <div className="border border-border rounded-xl p-12 bg-card flex flex-col items-center justify-center text-center space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-full blur-2xl opacity-50" />
          <div className="relative bg-muted/50 rounded-full p-6 border border-amber-500/20">
            <Users className="h-12 w-12 text-amber-500/60" />
          </div>
        </div>
        <div className="space-y-2">
          <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/10">
            <Clock className="h-3 w-3 mr-1" />
            Coming soon
          </Badge>
          <h2 className="text-lg font-semibold">Agents Inventory</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            The agents management interface is currently under development. 
            You&apos;ll be able to view, configure, and manage all your connected agents here soon.
          </p>
        </div>
      </div>
    </div>
  );
}

