"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Save, Loader2, Upload, Image as ImageIcon, Building, Cloud, CloudOff, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { settingsApi, type AppSettings } from "@/services/settings";
import { syncApi } from "@/services/sync-api";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";

const settingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  website: z.string().optional(),
  taxId: z.string().optional(),
  allowSignup: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const { canView, canEdit } = usePermissions();

  if (!canView('settings')) return null;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const [isLocalDb, setIsLocalDb] = useState(true);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSync, setLastSync] = useState<{
    finishedAt: string;
    totalSynced: number;
    totalSkipped: number;
    totalErrors: number;
    success: boolean;
    error?: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      companyName: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      taxId: "",
      allowSignup: false,
    },
  });

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await settingsApi.get();
      if (!res.success) {
        toast.error(res.error ?? "Failed to load settings");
        return;
      }
      if (res.data) {
        form.reset({
          companyName: res.data.companyName,
          address: res.data.address ?? "",
          phone: res.data.phone ?? "",
          email: res.data.email ?? "",
          website: res.data.website ?? "",
          taxId: res.data.taxId ?? "",
          allowSignup: res.data.allowSignup ?? false,
        });
        setLogoPath(res.data.companyLogo ?? null);
      }
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, [form]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await syncApi.getStatus();
      if (res.data) {
        setIsLocalDb(res.data.isLocalDb);
        setSyncInProgress(res.data.syncInProgress);
        if (res.data.lastSync) {
          setLastSync(res.data.lastSync);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchSyncStatus();
  }, [fetchSettings, fetchSyncStatus]);

  const onSubmit = async (values: SettingsFormValues) => {
    setIsSaving(true);
    try {
      const res = await settingsApi.update(values);
      if (res.success) {
        toast.success(res.message ?? "Settings saved");
        fetchSettings();
      } else {
        toast.error(res.error ?? "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const currentName = form.getValues("companyName");
      if (!currentName) {
        toast.error("Please save a company name before uploading a logo");
        return;
      }

      const res = await settingsApi.uploadLogo(file);
      if (res.success && res.data) {
        setLogoPath(res.data.path);
        await settingsApi.update({
          companyName: currentName,
          companyLogo: res.data.path,
        });
        toast.success("Logo uploaded");
      } else {
        toast.error(res.error ?? "Failed to upload logo");
      }
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncProgress("Starting sync...");
    try {
      const res = await syncApi.triggerSync();
      if (res.success && res.data) {
        const d = res.data;
        if ((d as any).skipped) {
          toast.info("Already using NeonDB — no sync needed");
          setSyncProgress(null);
        } else {
          setLastSync(d);
          setSyncProgress(null);
          const parts = [`${d.totalSynced} synced`, `${d.totalSkipped} skipped`];
          if (d.totalErrors > 0) parts.push(`${d.totalErrors} errors`);
          toast.success(`Sync complete: ${parts.join(", ")}`);
        }
      } else {
        toast.error(res.error ?? "Sync failed");
        setSyncProgress(null);
      }
    } catch {
      toast.error("Failed to sync data");
      setSyncProgress(null);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" text="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your company and application settings
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Company Logo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="size-5 text-emerald-600" />
                Company Logo
              </CardTitle>
              <CardDescription>
                Upload your company logo for reports and branding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex size-28 items-center justify-center rounded-lg border-2 border-dashed bg-muted/30">
                  {logoPath ? (
                    <img
                      src={logoPath}
                      alt="Company logo"
                      className="size-24 object-contain"
                    />
                  ) : (
                    <Building className="size-10 text-muted-foreground/40" />
                  )}
                </div>
                <div className="space-y-2">
                  {canEdit('settings') && (
                    <>
                      <label htmlFor="logo-upload">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isUploading}
                          className="relative cursor-pointer"
                          asChild
                        >
                          <span>
                            {isUploading ? (
                              <Loader2 className="size-4 animate-spin mr-1.5" />
                            ) : (
                              <Upload className="size-4 mr-1.5" />
                            )}
                            {isUploading ? "Uploading..." : "Upload Logo"}
                          </span>
                        </Button>
                      </label>
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, GIF, WebP or SVG. Max 5MB.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="size-5 text-emerald-600" />
                Company Details
              </CardTitle>
              <CardDescription>
                This information appears on PDF reports and invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Your company name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Company address"
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+93 700 000 000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="info@company.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="taxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax ID / Registration No.</FormLabel>
                      <FormControl>
                        <Input placeholder="Tax registration number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="allowSignup" className="flex items-center gap-2 text-base">
                    <UserPlus className="size-4 text-emerald-600" />
                    Allow New Registrations
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When disabled, new users cannot create accounts
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="allowSignup"
                  render={({ field }) => (
                    <Switch
                      id="allowSignup"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!canEdit('settings')}
                    />
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Sync */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isLocalDb ? (
                  <CloudOff className="size-5 text-amber-600" />
                ) : (
                  <Cloud className="size-5 text-emerald-600" />
                )}
                Data Sync
              </CardTitle>
              <CardDescription>
                {isLocalDb
                  ? "Running on SQLite locally. Sync your data to NeonDB cloud backup."
                  : "Running on NeonDB directly. No sync needed."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={cn(
                    "px-2 py-0.5 text-xs",
                    isLocalDb
                      ? "border-amber-300 text-amber-700 bg-amber-50"
                      : "border-emerald-300 text-emerald-700 bg-emerald-50"
                  )}>
                    {isLocalDb ? "Local SQLite" : "Cloud NeonDB"}
                  </Badge>
                  {lastSync && (
                    <span className="text-xs text-muted-foreground">
                      Last sync: {format(new Date(lastSync.finishedAt), "MMM d, yyyy HH:mm")}
                      {lastSync.success
                        ? ` — ${lastSync.totalSynced} synced, ${lastSync.totalSkipped} skipped${lastSync.totalErrors > 0 ? `, ${lastSync.totalErrors} errors` : ""}`
                        : " — Failed"}
                    </span>
                  )}
                  {syncInProgress && (
                    <span className="text-xs text-amber-600 font-medium">Sync in progress...</span>
                  )}
                </div>

                {syncProgress && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {syncProgress}
                  </div>
                )}

                {isLocalDb && (
                  <Button
                    onClick={handleSync}
                    disabled={isSyncing || syncInProgress}
                    variant="outline"
                    size="sm"
                    className="self-start"
                  >
                    {isSyncing ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="size-3.5 mr-1.5" />
                    )}
                    {isSyncing ? "Syncing..." : "Sync to Cloud"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          {canEdit('settings') && (
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Save className="size-4 mr-1.5" />
                )}
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
