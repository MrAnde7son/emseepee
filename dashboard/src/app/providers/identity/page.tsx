"use client";

import { useState } from "react";
import { useIdpConnections } from "@/hooks/useGatewayData";
import { Api } from "@/lib/api";
import { type IdpType } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { RefreshCcw, Clock, Trash2 } from "lucide-react";

export default function IdentityProvidersPage() {
  const {
    data: idpData,
    isLoading: isLoadingIdps,
    refetch: refetchIdps,
  } = useIdpConnections();
  const [idpIssuer, setIdpIssuer] = useState("");
  const [idpClientId, setIdpClientId] = useState("");
  const [idpClientSecret, setIdpClientSecret] = useState("");
  const [savingIdp, setSavingIdp] = useState(false);
  const [showIdpConfigDialog, setShowIdpConfigDialog] = useState(false);
  const [selectedIdpType, setSelectedIdpType] = useState<IdpType | null>(null);

  const connections = idpData?.connections || [];

  // Define available IdP providers
  const idpProviders: Array<{
    id: IdpType;
    name: string;
    icon: string;
    comingSoon: boolean;
  }> = [
    { id: "okta", name: "Okta", icon: "🔐", comingSoon: false },
    { id: "entra", name: "Microsoft Entra", icon: "🔷", comingSoon: true },
  ];

  const handleIdpInstallClick = (type: IdpType) => {
    setSelectedIdpType(type);
    const existingConnection = connections.find((conn) => conn.type === type);
    if (existingConnection) {
      setIdpIssuer(existingConnection.issuer);
      setIdpClientId(existingConnection.clientId);
      setIdpClientSecret(""); // Don't show existing secret
    } else {
      setIdpIssuer("");
      setIdpClientId("");
      setIdpClientSecret("");
    }
    setShowIdpConfigDialog(true);
  };

  const handleSaveIdpConnection = async () => {
    if (!selectedIdpType) return;
    setSavingIdp(true);
    try {
      await Api.createOrUpdateIdpConnection({
        type: selectedIdpType,
        issuer: idpIssuer,
        clientId: idpClientId,
        clientSecret: idpClientSecret,
      });
      await refetchIdps();
      setShowIdpConfigDialog(false);
      setSelectedIdpType(null);
      setIdpIssuer("");
      setIdpClientId("");
      setIdpClientSecret("");
    } catch (error) {
      alert(`Failed to save IdP connection: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSavingIdp(false);
    }
  };

  const handleDeleteIdp = async (id: number) => {
    try {
      await Api.deleteIdpConnection(id);
      await refetchIdps();
    } catch (error) {
      alert(`Failed to delete IdP connection: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Identity</h1>
          <p className="text-xs text-muted-foreground">Configure IdP connections for your tenant.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchIdps()}>
          <RefreshCcw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {isLoadingIdps && <div className="text-sm text-muted-foreground">Loading providers...</div>}

      {!isLoadingIdps && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {idpProviders.map((idp) => {
            const connection = connections.find((conn) => conn.type === idp.id);
            const isConnected = !!connection;
            const isComingSoon = idp.comingSoon;

            return (
              <div
                key={idp.id}
                className={`border border-border rounded-xl p-4 bg-card flex flex-col gap-2 ${isComingSoon ? "opacity-75" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" role="img" aria-label={`${idp.name} icon`}>
                      {idp.icon}
                    </span>
                    <div className="font-semibold text-sm">{idp.name}</div>
                  </div>
                  {isComingSoon ? (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-500 bg-amber-500/10">
                      <Clock className="h-3 w-3 mr-1" />
                      Coming soon
                    </Badge>
                  ) : (
                    <Badge variant={isConnected ? "default" : "outline"}>
                      {isConnected ? "connected" : "pending"}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Type: <span className="font-mono">{idp.id}</span>
                </div>
                {isComingSoon ? (
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-dashed border-border flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      This provider integration is coming soon. Stay tuned for updates!
                    </p>
                  </div>
                ) : (
                  <>
                    {connection && (
                      <div className="text-[11px] text-muted-foreground space-y-1">
                        <div className="break-all">Issuer: {connection.issuer}</div>
                        <div>Client ID: {connection.clientId}</div>
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="text-xs"
                        onClick={() => handleIdpInstallClick(idp.id)}
                        disabled={savingIdp}
                      >
                        {isConnected ? "Configure" : "Install"}
                      </Button>
                      {isConnected && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDeleteIdp(connection.id)}
                          disabled={savingIdp}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* IdP Configuration Dialog */}
      <Dialog open={showIdpConfigDialog} onOpenChange={setShowIdpConfigDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedIdpType ? `Configure ${idpProviders.find((p) => p.id === selectedIdpType)?.name || selectedIdpType}` : "Configure Identity Provider"}
            </DialogTitle>
            <DialogDescription>
              Enter your IdP connection details to enable authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label htmlFor="idp-issuer" className="text-sm font-medium">
                Issuer <span className="text-destructive">*</span>
              </label>
              <Input
                id="idp-issuer"
                placeholder="https://your-org.okta.com"
                value={idpIssuer}
                onChange={(e) => setIdpIssuer(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The issuer URL for your IdP (e.g., https://your-org.okta.com)
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="idp-client-id" className="text-sm font-medium">
                Client ID <span className="text-destructive">*</span>
              </label>
              <Input
                id="idp-client-id"
                value={idpClientId}
                onChange={(e) => setIdpClientId(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The OAuth client ID from your IdP
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="idp-client-secret" className="text-sm font-medium">
                Client Secret <span className="text-destructive">*</span>
              </label>
              <Input
                id="idp-client-secret"
                type="password"
                value={idpClientSecret}
                onChange={(e) => setIdpClientSecret(e.target.value)}
                placeholder={connections.find((c) => c.type === selectedIdpType) ? "Enter new secret to update" : ""}
                required
              />
              <p className="text-xs text-muted-foreground">
                The OAuth client secret from your IdP
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowIdpConfigDialog(false);
                  setSelectedIdpType(null);
                  setIdpIssuer("");
                  setIdpClientId("");
                  setIdpClientSecret("");
                }}
                disabled={savingIdp}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveIdpConnection}
                disabled={savingIdp || !idpIssuer || !idpClientId || !idpClientSecret}
              >
                {savingIdp ? "Saving..." : "Save Connection"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

