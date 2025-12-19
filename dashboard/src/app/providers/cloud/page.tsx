"use client";

import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface CloudProvider {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const cloudProviders: CloudProvider[] = [
  {
    id: "aws",
    name: "Amazon AWS",
    description: "Integrate AWS services and IAM for your agent workloads.",
    icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/amazonaws.svg",
  },
  {
    id: "gcp",
    name: "Google GCP",
    description: "Connect to Google Cloud resources for compute and data access.",
    icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlecloud.svg",
  },
  {
    id: "azure",
    name: "Microsoft Azure",
    description: "Bridge agents to Azure services and enterprise controls.",
    icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/microsoftazure.svg",
  },
  {
    id: "oci",
    name: "Oracle OCI",
    description: "Enable Oracle Cloud Infrastructure workflows for agents.",
    icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/oracle.svg",
  },
];

export default function CloudProvidersPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Cloud</h1>
          <p className="text-xs text-muted-foreground">
            Manage cloud integrations for compute, data, and networking.
          </p>
        </div>
        <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/10">
          <Clock className="h-3 w-3 mr-1" />
          Coming soon
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {cloudProviders.map((provider) => (
          <div
            key={provider.id}
            className="border border-border rounded-xl p-4 bg-card flex flex-col gap-3 opacity-75"
            data-testid={`cloud-provider-${provider.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {provider.icon && (
                  provider.icon.startsWith("http://") || provider.icon.startsWith("https://") ? (
                    <img
                      src={provider.icon}
                      alt={`${provider.name} icon`}
                      className="w-5 h-5"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-lg" role="img" aria-label={`${provider.name} icon`}>
                      {provider.icon}
                    </span>
                  )
                )}
                <div className="font-semibold text-sm">{provider.name}</div>
              </div>
              <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/10">
                <Clock className="h-3 w-3 mr-1" />
                Coming soon
              </Badge>
            </div>

            <div className="text-xs text-muted-foreground">
              Type: <span className="font-mono">{provider.id}</span>
            </div>

            <div className="mt-1 p-3 rounded-lg bg-muted/50 border border-dashed border-border flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">
                  {provider.description}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  This provider integration is coming soon. Stay tuned for updates!
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
