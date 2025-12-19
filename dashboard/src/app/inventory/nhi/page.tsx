export default function NhiPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">NHI</h1>
        <p className="text-sm text-muted-foreground">
          Review and manage NHI records from the unified inventory.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        <p>
          This section will surface NHI resources alongside agents and users. Use the navigation to
          explore inventory items.
        </p>
      </div>
    </div>
  );
}
