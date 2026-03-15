"use client";

import { useEffect, useRef, useState, type ChangeEventHandler } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppData } from "@/components/app-shell";
import { toast } from "react-toastify";
import {
  AppSettings,
  checkSettingsImpact,
  getSettings,
  getSetupPackage,
  IntegrityReport,
  importSetupPackage,
  resetAll,
  resetData,
  SetupPackage,
  updateSettings,
} from "@/lib/api";
import { downloadBlob, exportToExcel } from "@/lib/export";
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconLock,
  IconPlus,
  IconTrash,
  IconRefresh,
  IconUpload,
  IconUsers,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { cn } from "@/lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export default function SettingsPage() {
  return <SettingsContent />;
}

function SettingsContent() {
  const { auth, refreshPersonnel } = useAppData();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingSetup, setExportingSetup] = useState(false);
  const [resetting, setResetting] = useState<false | "data" | "all">(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetDataConfirm, setShowResetDataConfirm] = useState(false);
  const [impactDetails, setImpactDetails] = useState<string[]>([]);
  const [showImpactConfirm, setShowImpactConfirm] = useState(false);
  const pendingImpactRef = useRef<{ personnel: Record<string, unknown>[]; rooms: Record<string, unknown>[] } | null>(null);
  const settingsImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (auth.role !== "admin") return;
    getSettings()
      .then((nextSettings) =>
        setSettings(alignDepartmentPasswords(nextSettings)),
      )
      .catch((e: Error) => setError(e.message));
  }, [auth.role]);

  function updateLocalSettings(next: AppSettings) {
    setSaved(false);
    setError(null);
    setSettings(alignDepartmentPasswords(next));
  }

  if (auth.role !== "admin") {
    return (
      <motion.div {...fadeUp} transition={{ duration: 0.18 }}>
        <Card className="page-hero overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-12 text-center">
          <p className="text-base font-semibold text-foreground">
            הגישה מוגבלת למנהלים בלבד
          </p>
        </Card>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div {...fadeUp} transition={{ duration: 0.18 }}>
        <Card className="page-hero overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-12 text-center">
          <p className="text-base font-semibold text-destructive">{error}</p>
        </Card>
      </motion.div>
    );
  }

  if (!settings) {
    return (
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-8">
        <div className="skeleton mb-4 h-8 w-40 rounded-lg" />
        <div className="skeleton h-40 w-full rounded-lg" />
      </Card>
    );
  }

  const currentSettings = settings;

  async function handleSave() {
    const normalized = normalizeLocalSettings(currentSettings);
    updateLocalSettings(normalized);
    setSaving(true);

    try {
      const impact = await checkSettingsImpact(normalized);
      if (impact.has_impact) {
        setImpactDetails(impact.details);
        pendingImpactRef.current = {
          personnel: impact.affected_personnel,
          rooms: impact.affected_rooms,
        };
        setShowImpactConfirm(true);
        setSaving(false);
        return;
      }
      pendingImpactRef.current = null;
      await doSave(normalized);
    } catch (e) {
      const message = e instanceof Error ? e.message : "שגיאה בשמירת הגדרות";
      setError(message);
      toast.error("שגיאה בשמירת הגדרות");
      setSaving(false);
    }
  }

  async function doSave(normalized: AppSettings) {
    setSaving(true);
    const impact = pendingImpactRef.current;
    pendingImpactRef.current = null;
    try {
      const updated = await updateSettings(normalized);
      updateLocalSettings(updated);
      await refreshPersonnel(true);
      showIntegrityReport(updated.integrity_report);
      setSaved(true);
      toast.success("ההגדרות נשמרו");
      window.setTimeout(() => setSaved(false), 2000);
      if (impact) downloadImpactExcel(impact);
    } catch (e) {
      const message = e instanceof Error ? e.message : "שגיאה בשמירת הגדרות";
      setError(message);
      toast.error("שגיאה בשמירת הגדרות");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setSaved(false);
    setError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      if (isSetupPackage(parsed)) {
        const result = await importSetupPackage(parsed);
        updateLocalSettings(result.settings);
        await refreshPersonnel(true);
        showIntegrityReport(result.integrity_report);
        toast.success("ההגדרות יובאו בהצלחה");
      } else {
        const updated = await updateSettings(parsed as Partial<AppSettings>);
        updateLocalSettings(updated);
        await refreshPersonnel(true);
        showIntegrityReport(updated.integrity_report);
        toast.success("הגדרות יובאו בהצלחה");
      }

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "שגיאה בייבוא";
      setError(message);
      toast.error("הייבוא נכשל");
    } finally {
      setImporting(false);
    }
  }

  async function handleExportSetup() {
    setExportingSetup(true);
    try {
      const setupPackage = await getSetupPackage();
      const blob = new Blob([JSON.stringify(setupPackage, null, 2)], {
        type: "application/json",
      });
      downloadBlob(blob, "triplez_הגדרות.json");
    } catch (e) {
      const message = e instanceof Error ? e.message : "שגיאה בייצוא הגדרות";
      setError(message);
      toast.error("שגיאה בייצוא הגדרות");
    } finally {
      setExportingSetup(false);
    }
  }

  async function handleReset(type: "data" | "all") {
    setResetting(type);
    if (type === "data") setShowResetDataConfirm(false);
    else setShowResetConfirm(false);
    try {
      if (type === "data") await resetData();
      else await resetAll();
      await refreshPersonnel(true);
      toast.success(type === "data" ? "חדרים וכוח אדם אופסו. ההגדרות נשמרו." : "כל הנתונים אופסו בהצלחה");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה באיפוס");
    } finally {
      setResetting(false);
    }
  }

  return (
    <motion.div
      variants={stagger}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      <motion.div variants={fadeUp} transition={{ duration: 0.18 }}>
        <Card className="page-hero overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
          <CardContent className="pt-6">
            <div
              className="flex items-center justify-between"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-foreground">
                הגדרות מערכת
              </h2>

              <div
                className="flex items-center gap-2"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={importing}
                  onClick={() => settingsImportRef.current?.click()}
                >
                  <IconUpload size={14} />
                  {importing ? "מייבא..." : "ייבוא"}
                </Button>
                <input
                  ref={settingsImportRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file);
                    e.target.value = "";
                  }}
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportSetup}
                  disabled={exportingSetup}
                >
                  <IconDownload size={14} />
                  {exportingSetup ? "מייצא..." : "ייצוא"}
                </Button>

                <Button
                  onClick={handleSave}
                  disabled={saving || importing}
                  size="sm"
                >
                  {saving ? (
                    <motion.div
                      className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 0.7,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  ) : (
                    <IconCheck size={14} />
                  )}
                  {saving ? "שומר..." : saved ? "נשמר!" : "שמירה"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp} transition={{ duration: 0.18 }}>
          <Tabs
            defaultValue="personnel"
            className="space-y-5"
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
          <TabsList
            className="grid w-full grid-cols-3 h-12 rounded-2xl"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              height: "3rem",
              width: "100%",
            }}
          >
            <TabsTrigger
              value="personnel"
              className="gap-2 text-[13px] data-[state=active]:font-bold"
            >
              <IconUpload size={15} />
              אינטגרציה
            </TabsTrigger>
            <TabsTrigger
              value="lists"
              className="gap-2 text-[13px] data-[state=active]:font-bold"
            >
              <IconUsers size={15} />
              רשימות מערכת
            </TabsTrigger>
            <TabsTrigger
              value="passwords"
              className="gap-2 text-[13px] data-[state=active]:font-bold"
            >
              <IconLock size={15} />
              סיסמאות
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personnel" className="space-y-6">
            <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
              <CardContent className="space-y-4 pt-6">
                <h3 className="text-[15px] font-semibold text-foreground">מפתח API</h3>

                <PasswordField
                  value={settings.api_key}
                  onChange={(e) =>
                    updateLocalSettings({
                      ...currentSettings,
                      api_key: e.target.value,
                    })
                  }
                  dir="ltr"
                />

                <ApiUsageGuide />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
              <CardContent className="space-y-4 pt-6">
                <h3 className="text-[15px] font-semibold text-foreground">שמירת מיטות</h3>
                <p className="text-xs text-muted-foreground">
                  כאשר אדם מוסר משיבוץ בעקבות עדכון כוח אדם, המיטה שלו נשמרת. כשהוא חוזר בעדכון הבא, הוא מוחזר אוטומטית למיטה המקורית.
                </p>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">מדיניות שמירה</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateLocalSettings({ ...currentSettings, bed_reservation_policy: "reserve" })}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer",
                          settings.bed_reservation_policy === "reserve"
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border/60 bg-background/50 text-muted-foreground hover:bg-accent/50",
                        )}
                      >
                        <span className="block font-medium">שמירה</span>
                        <span className="block mt-0.5 text-[10px] opacity-70">המיטה חסומה לאחרים</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateLocalSettings({ ...currentSettings, bed_reservation_policy: "best_effort" })}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer",
                          settings.bed_reservation_policy === "best_effort"
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border/60 bg-background/50 text-muted-foreground hover:bg-accent/50",
                        )}
                      >
                        <span className="block font-medium">לא שמורה</span>
                        <span className="block mt-0.5 text-[10px] opacity-70">המיטה פנויה, חזרה רק אם יש מקום</span>
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-amber-500/30 bg-gradient-to-br from-card via-card to-background/80">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-amber-600 flex items-center gap-2">
                      <IconRefresh size={16} />
                      איפוס חדרים וכוח אדם
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      מחיקת כל החדרים וכוח האדם. ההגדרות, סיסמאות ומפתח API נשמרים.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResetDataConfirm(true)}
                    disabled={!!resetting}
                    className="border-amber-500/40 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  >
                    <IconRefresh size={14} />
                    {resetting === "data" ? "מאפס..." : "איפוס נתונים"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-destructive/30 bg-gradient-to-br from-card via-card to-background/80">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-destructive flex items-center gap-2">
                      <IconAlertCircle size={16} />
                      איפוס מלא
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      מחיקת הכל כולל יומן פעולות. פעולה זו אינה הפיכה.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowResetConfirm(true)}
                    disabled={!!resetting}
                  >
                    <IconTrash size={14} />
                    {resetting === "all" ? "מאפס..." : "איפוס הכל"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lists" className="space-y-3">
            <CollapsibleListEditor
              title="דרגות"
              items={settings.ranks_high_to_low}
              onChange={(items) =>
                updateLocalSettings({
                  ...currentSettings,
                  ranks_high_to_low: items,
                })
              }
            />
            <CollapsibleListEditor
              title="זירות"
              items={settings.departments}
              onChange={(items) =>
                updateLocalSettings({ ...currentSettings, departments: items })
              }
            />
            <CollapsibleListEditor
              title="מבנים"
              items={settings.buildings}
              onChange={(items) =>
                updateLocalSettings({ ...currentSettings, buildings: items })
              }
            />
          </TabsContent>

          <TabsContent value="passwords" className="space-y-3">
            <CollapsiblePassword title="סיסמת מנהל">
              <PasswordField
                value={settings.admin_password}
                onChange={(e) =>
                  updateLocalSettings({
                    ...currentSettings,
                    admin_password: e.target.value,
                  })
                }
                dir="ltr"
              />
            </CollapsiblePassword>
            {settings.departments.map((dept) => (
              <CollapsiblePassword key={dept} title={dept}>
                <PasswordField
                  value={settings.dept_passwords[dept] || ""}
                  onChange={(e) =>
                    updateLocalSettings({
                      ...currentSettings,
                      dept_passwords: {
                        ...currentSettings.dept_passwords,
                        [dept]: e.target.value,
                      },
                    })
                  }
                  dir="ltr"
                  hint={`ברירת מחדל: ${defaultDepartmentPassword(dept)}`}
                />
              </CollapsiblePassword>
            ))}
          </TabsContent>

        </Tabs>
      </motion.div>

      <ConfirmationDialog
        open={showResetDataConfirm}
        onOpenChange={setShowResetDataConfirm}
        title="איפוס חדרים וכוח אדם"
        description={[
          "פעולה זו תמחק:",
          "",
          "• כל החדרים והמיטות",
          "• כל כוח האדם",
          "• כל השיבוצים והשמירות",
          "",
          "הגדרות, סיסמאות, מפתח API ויומן פעולות יישמרו.",
        ].join("\n")}
        confirmLabel="אפס נתונים"
        confirmIcon={<IconRefresh size={14} />}
        onConfirm={() => handleReset("data")}
      />

      <ConfirmationDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="איפוס מלא"
        description={[
          "פעולה זו תמחק לצמיתות את כל הנתונים הבאים:",
          "",
          "• כל החדרים והמיטות",
          "• כל כוח האדם",
          "• כל השיבוצים והשמירות",
          "• יומן הביקורת (לוגים)",
          "",
          "ההגדרות (סיסמאות, רשימות, מפתח API) לא יימחקו.",
          "לא ניתן לבטל פעולה זו.",
        ].join("\n")}
        confirmLabel="אפס הכל"
        confirmIcon={<IconTrash size={14} />}
        onConfirm={() => handleReset("all")}
      />

      <ConfirmationDialog
        open={showImpactConfirm}
        onOpenChange={setShowImpactConfirm}
        title="שינוי הגדרות עם השפעה על נתונים"
        description={impactDetails.join("\n")}
        confirmLabel="אני מבין, המשך"
        confirmIcon={<IconAlertCircle size={14} />}
        onConfirm={() => {
          setShowImpactConfirm(false);
          void doSave(normalizeLocalSettings(currentSettings));
        }}
      />
    </motion.div>
  );
}

function ApiUsageGuide() {
  const [open, setOpen] = useState(false);
  const codeSnippet = `curl -X POST http://localhost:8000/api/admin/load_personnel \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <your-api-key>" \\
  -d '{
  "personnel": [
    {
      "person_id": "123",
      "name": "ישראל ישראלי",
      "department": "תפעול",
      "gender": "בנים",
      "rank": "זוטר"
    }
  ]
}'`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer transition-colors hover:text-foreground"
      >
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <IconChevronDown size={14} />
        </motion.div>
        מידע לחיבור מערכת חיצונית
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">
                מערכת חיצונית יכולה לשלוח רשימת כוח אדם עדכנית באמצעות בקשת POST עם הכותרת <code className="rounded bg-muted px-1 font-mono text-[11px]">X-API-Key</code>.
                כל שליחה מחליפה את רשימת כוח האדם הקיימת.
              </p>
              <CodeBlock code={codeSnippet} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative rounded-lg border border-border/50 bg-zinc-950 dark:bg-zinc-900">
      <div
        className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5"
      >
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 cursor-pointer"
        >
          {copied ? (
            <>
              <IconCheck size={12} />
              <span>הועתק</span>
            </>
          ) : (
            <>
              <IconCopy size={12} />
              <span>העתק</span>
            </>
          )}
        </button>
        <span className="text-[10px] font-mono text-zinc-500">bash</span>
      </div>
      <pre
        className="overflow-x-auto p-3 text-[11px] leading-relaxed font-mono text-zinc-300"
        dir="ltr"
      >
        {code}
      </pre>
    </div>
  );
}

function CollapsibleListEditor({
  title,
  items,
  onChange,
  defaultOpen = false,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-3 text-right cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
            {items.length}
          </span>
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <IconChevronDown size={16} className="text-muted-foreground" />
          </motion.div>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-border/60 px-6 pb-4 pt-3">
              <ListEditorContent
                items={items}
                title={title}
                onChange={onChange}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function ListEditorContent({
  items,
  title,
  onChange,
}: {
  items: string[];
  title: string;
  onChange: (items: string[]) => void;
}) {
  const [newItem, setNewItem] = useState("");
  const [draftItems, setDraftItems] = useState(items);

  useEffect(() => {
    setDraftItems(items);
  }, [items]);

  function setDraftItem(index: number, value: string) {
    setDraftItems((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  function resetDraftItem(index: number, value = items[index] ?? "") {
    setDraftItems((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  function getCommittedDrafts() {
    return items.map((item, index) => {
      const draftValue = draftItems[index] ?? item;
      const trimmed = draftValue.trim();
      return trimmed || item;
    });
  }

  function addItem() {
    const value = newItem.trim();
    const nextItems = getCommittedDrafts();
    if (!value || nextItems.includes(value)) return;
    onChange([...nextItems, value]);
    setNewItem("");
  }

  function removeItem(index: number) {
    const nextItems = getCommittedDrafts();
    onChange(nextItems.filter((_, i) => i !== index));
  }

  function commitItem(index: number) {
    const currentValue = items[index] ?? "";
    const nextValue = (draftItems[index] ?? currentValue).trim();

    if (
      !nextValue ||
      items.some((item, itemIndex) => itemIndex !== index && item === nextValue)
    ) {
      resetDraftItem(index, currentValue);
      return;
    }

    if (nextValue === currentValue) {
      resetDraftItem(index, currentValue);
      return;
    }

    const next = [...items];
    next[index] = nextValue;
    onChange(next);
  }

  function moveItem(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...getCommittedDrafts()];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={`${title}-${index}`}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, marginBottom: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="flex items-center gap-2 rounded-[20px] border border-border/60 bg-background/[0.65] p-2 shadow-[var(--shadow-inset)]"
          >
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                aria-label={`העבר את ${draftItems[index] ?? item} למעלה`}
              >
                <IconArrowUp size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                aria-label={`העבר את ${draftItems[index] ?? item} למטה`}
              >
                <IconArrowDown size={14} />
              </Button>
            </div>

            <Input
              type="text"
              value={draftItems[index] ?? item}
              onChange={(e) => setDraftItem(index, e.target.value)}
              onBlur={() => commitItem(index)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitItem(index);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  resetDraftItem(index, item);
                }
              }}
              className="flex-1 h-8 text-sm"
            />

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => removeItem(index)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`מחק את ${draftItems[index] ?? item}`}
            >
              <IconTrash size={14} />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="flex items-center gap-2 rounded-[20px] border border-dashed border-border/60 bg-background/[0.45] p-2">
        <Input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="הוסף ערך חדש..."
          className="flex-1 h-8 text-sm"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={addItem}
          className="text-primary hover:text-primary"
        >
          <IconPlus size={16} />
        </Button>
      </div>
    </div>
  );
}

function CollapsiblePassword({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-3 text-right cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <IconChevronDown size={16} className="text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-border/60 px-6 pb-4 pt-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function PasswordField({
  value,
  onChange,
  className,
  dir,
  hint,
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  className?: string;
  dir?: "ltr" | "rtl";
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          className={cn("pr-10 text-sm", className)}
          dir={dir}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "הסתר סיסמה" : "הצג סיסמה"}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground"
        >
          {visible ? <IconEyeOff size={14} /> : <IconEye size={14} />}
        </Button>
      </div>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function uniqueClean(items: string[]) {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function defaultDepartmentPassword(department: string) {
  return `${department.trim()}123`;
}

function alignDepartmentPasswords(settings: AppSettings): AppSettings {
  return {
    ...settings,
    dept_passwords: Object.fromEntries(
      settings.departments.map((department) => [
        department,
        settings.dept_passwords[department]?.trim() || defaultDepartmentPassword(department),
      ]),
    ),
  };
}

function normalizeLocalSettings(settings: AppSettings): AppSettings {
  const { integrity_report: _integrityReport, sync_status: _syncStatus, ...rest } = settings;
  return alignDepartmentPasswords({
    ...rest,
    ranks_high_to_low: uniqueClean(rest.ranks_high_to_low),
    departments: uniqueClean(rest.departments),
    genders: uniqueClean(rest.genders),
    buildings: uniqueClean(rest.buildings),
    personnel_url: rest.personnel_url.trim(),
    admin_password: rest.admin_password.trim(),
  });
}

function isSetupPackage(value: unknown): value is SetupPackage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SetupPackage>;
  return !!candidate.settings && typeof candidate.settings === "object";
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {/* fall through to legacy */}
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function downloadImpactExcel(impact: { personnel: Record<string, unknown>[]; rooms: Record<string, unknown>[] }) {
  const ts = new Date().toISOString().slice(0, 10);
  if (impact.personnel.length > 0) {
    void exportToExcel(
      `כוח_אדם_שנמחק_${ts}`,
      ["מספר אישי", "שם מלא", "זירה", "מגדר", "דרגה"],
      impact.personnel.map((p) => [
        String(p.person_id ?? ""),
        String(p.full_name ?? ""),
        String(p.department ?? ""),
        String(p.gender ?? ""),
        String(p.rank ?? ""),
      ]),
    );
  }
  if (impact.rooms.length > 0) {
    void exportToExcel(
      `חדרים_שנמחקו_${ts}`,
      ["שם מבנה", "מספר חדר", "מספר מיטות", "דרגת חדר", "מגדר", "זירות"],
      impact.rooms.map((r) => [
        String(r.building_name ?? ""),
        String(r.room_number ?? ""),
        String(r.number_of_beds ?? ""),
        String(r.room_rank ?? ""),
        String(r.gender ?? ""),
        String(r.designated_department ?? ""),
      ]),
    );
  }
}

function showIntegrityReport(report?: IntegrityReport) {
  if (!report?.has_changes || report.messages.length === 0) return;
  toast.info(report.messages.join(" "), { autoClose: 9000 });
}
