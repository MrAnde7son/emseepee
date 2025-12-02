"use client";

import { useMemo, useState } from "react";
import { Mail, RefreshCcw, Search, Shield, Users } from "lucide-react";

import { useUsers } from "@/hooks/useGatewayData";
import { HumanUser } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function getUserDisplayName(user: HumanUser): string {
  if (user.name && user.name.trim().length > 0) {
    return user.name;
  }
  if (user.email && user.email.trim().length > 0) {
    return user.email;
  }
  return String(user.id);
}

export default function UsersPage() {
  const { data: users = [], isLoading, refetch } = useUsers();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter((user) => {
      const role = user.role || "member";
      const email = user.email || "";
      return (
        email.toLowerCase().includes(query) ||
        (user.name?.toLowerCase().includes(query) ?? false) ||
        role.toLowerCase().includes(query) ||
        (user.tenantId?.toLowerCase().includes(query) ?? false) ||
        (user.source?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [users, searchQuery]);

  const humanUserCount = users.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-xs text-muted-foreground">
            All human users with access to AI services across providers, agents, and tools.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Users</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{humanUserCount}</div>
              <p className="text-xs text-muted-foreground">Active human accounts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Roles</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{new Set(users.map((user) => user.role)).size}</div>
              <p className="text-xs text-muted-foreground">Distinct access roles</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tenants</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{new Set(users.map((user) => user.tenantId || "default")).size}</div>
              <p className="text-xs text-muted-foreground">Tenant scopes represented</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name, email, role, or tenant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No users match your search" : "No users found."}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{getUserDisplayName(user)}</span>
                      {user.name && (
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs sm:text-sm">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.tenantId ? (
                      <Badge variant="outline">{user.tenantId}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Default</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {user.source ? user.source.replace("-", " ") : "local"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.active === false ? (
                      <Badge variant="destructive" className="uppercase">Disabled</Badge>
                    ) : (
                      <Badge variant="secondary" className="uppercase">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(user.updatedAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
