"use client";

import { useEffect, useState } from "react";
import { AppShell, useAppData } from "@/components/app-shell";
import { toast } from "sonner";
import { getSettings, updateSettings, loadPersonnelFromUrl, uploadPersonnelFile, AppSettings } from "@/lib/api";
import { downloadBlob } from "@/lib/export";
import { IconPlus, IconTrash, IconCheck, IconUpload, IconDownload, IconRefresh } from "@/components/icons";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}

function SettingsContent() {
  const { auth } = useAppData();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPersonnel, setLoadingPersonnel] = useState(false);

  useEffect(() => {
    if (auth.role !== "admin") return;
    getSettings().then(setSettings).catch((e) => setError(e.message));
  }, [auth.role]);

  if (auth.role !== "admin") {
    return (
      <div className="surface-card p-12 text-center">
        <p className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>הגישה מוגבלת למנהלים בלבד</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface-card p-12 text-center">
        <p className="text-[16px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="surface-card p-8">
        <div className="skeleton h-8 w-40 rounded-lg mb-4" />
        <div className="skeleton h-40 w-full rounded-lg" />
      </div>
    );
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      toast.success("הגדרות נשמרו");
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
      toast.error("שגיאה בשמירת הגדרות");
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadPersonnel() {
    setLoadingPersonnel(true);
    try {
      const res = await loadPersonnelFromUrl();
      toast.success(`נטענו ${res.count} אנשי כוח אדם`);
    } catch (e: any) {
      toast.error(e.message || "שגיאה בטעינת כוח אדם");
    } finally {
      setLoadingPersonnel(false);
    }
  }

  return (
    <>
      {/* Header with actions */}
      <section className="surface-card p-8 mb-7">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">הגדרות מערכת</h2>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>ניהול הגדרות כלליות, דרגות, מחלקות ומבנים</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="btn-ghost inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
              <IconUpload size={14} />
              ייבוא
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then((text) => {
                    try {
                      const imported = JSON.parse(text);
                      updateSettings(imported)
                        .then((updated) => {
                          setSettings(updated);
                          setSaved(true);
                          toast.success("הגדרות יובאו בהצלחה");
                          setTimeout(() => setSaved(false), 2000);
                        })
                        .catch((err) => {
                          setError(err.message);
                          toast.error("שגיאה בייבוא הגדרות");
                        });
                    } catch {
                      setError("קובץ JSON לא תקין");
                    }
                  });
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
                downloadBlob(blob, "triplez_settings.json");
              }}
              className="btn-ghost inline-flex items-center gap-1.5 text-[12px]"
            >
              <IconDownload size={14} />
              ייצוא
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-2"
            >
              <IconCheck size={14} />
              {saving ? "שומר..." : saved ? "נשמר!" : "שמור שינויים"}
            </button>
          </div>
        </div>
      </section>

      {/* Personnel */}
      <section className="surface-card p-6 mb-7">
        <h3 className="text-[16px] font-bold mb-1" style={{ color: "var(--text-1)" }}>כוח אדם</h3>
        <p className="text-[12px] mb-4" style={{ color: "var(--text-3)" }}>טעינת רשימת כוח אדם מכתובת URL או מקובץ Excel</p>

        <div className="flex items-center gap-3 mb-4">
          <input
            type="url"
            value={settings.personnel_url}
            onChange={(e) => setSettings({ ...settings, personnel_url: e.target.value })}
            placeholder="https://example.com/personnel.xlsx"
            className="flex-1 px-3 py-2 rounded-lg border text-[14px]"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
            dir="ltr"
          />
          <button
            type="button"
            onClick={handleLoadPersonnel}
            disabled={loadingPersonnel || !settings.personnel_url.trim()}
            className="btn-secondary inline-flex items-center gap-2 shrink-0"
            style={{ opacity: loadingPersonnel || !settings.personnel_url.trim() ? 0.5 : 1 }}
          >
            <IconRefresh size={14} />
            {loadingPersonnel ? "טוען..." : "טען מ-URL"}
          </button>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>או העלאה ידנית:</span>
          <label className="btn-ghost inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
            <IconUpload size={14} />
            העלאת קובץ Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                uploadPersonnelFile(file)
                  .then((res) => toast.success(`נטענו ${res.count} אנשי כוח אדם`))
                  .catch((err) => toast.error(err.message || "שגיאה בטעינת כוח אדם"));
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>

      {/* Lists grid */}
      <div className="grid grid-cols-2 gap-6 mb-7">
        <ListEditor
          title="דרגות (מהגבוהה לנמוכה)"
          items={settings.ranks_high_to_low}
          hebrewMap={settings.hebrew.ranks}
          onChange={(items) => setSettings({ ...settings, ranks_high_to_low: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, ranks: map } })}
        />
        <ListEditor
          title="זירות (מחלקות)"
          items={settings.departments}
          hebrewMap={settings.hebrew.departments}
          onChange={(items) => setSettings({ ...settings, departments: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, departments: map } })}
        />
        <ListEditor
          title="מגדרים"
          items={settings.genders}
          hebrewMap={settings.hebrew.genders}
          onChange={(items) => setSettings({ ...settings, genders: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, genders: map } })}
        />
        <ListEditor
          title="מבנים"
          items={settings.buildings}
          hebrewMap={settings.hebrew.buildings}
          onChange={(items) => setSettings({ ...settings, buildings: items })}
          onHebrewChange={(map) => setSettings({ ...settings, hebrew: { ...settings.hebrew, buildings: map } })}
        />
      </div>

      {/* Passwords */}
      <section className="surface-card p-6 mb-7">
        <h3 className="text-[16px] font-bold mb-1" style={{ color: "var(--text-1)" }}>סיסמאות</h3>
        <p className="text-[12px] mb-4" style={{ color: "var(--text-3)" }}>סיסמת כניסה למנהל ולמחלקות</p>

        <div className="mb-5">
          <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>סיסמת מנהל</label>
          <input
            type="text"
            value={settings.admin_password}
            onChange={(e) => setSettings({ ...settings, admin_password: e.target.value })}
            className="w-full max-w-sm px-3 py-2 rounded-lg border text-[14px]"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
            dir="ltr"
          />
        </div>

        <h4 className="text-[14px] font-semibold mb-3" style={{ color: "var(--text-2)" }}>סיסמאות מחלקות</h4>
        <div className="grid grid-cols-2 gap-3">
          {settings.departments.map((dept) => {
            const hebrewLabel = settings.hebrew.departments[dept];
            return (
              <div key={dept} className="flex items-center gap-2">
                <span className="text-[13px] font-medium w-24 shrink-0 text-right" style={{ color: "var(--text-2)" }}>
                  {hebrewLabel || dept}
                </span>
                <input
                  type="text"
                  value={settings.dept_passwords[dept] || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      dept_passwords: { ...settings.dept_passwords, [dept]: e.target.value },
                    })
                  }
                  className="flex-1 px-3 py-1.5 rounded-lg border text-[13px]"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
                  dir="ltr"
                />
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ListEditor({
  title,
  items,
  hebrewMap,
  onChange,
  onHebrewChange,
}: {
  title: string;
  items: string[];
  hebrewMap: Record<string, string>;
  onChange: (items: string[]) => void;
  onHebrewChange: (map: Record<string, string>) => void;
}) {
  const [newItem, setNewItem] = useState("");

  function addItem() {
    const val = newItem.trim();
    if (!val || items.includes(val)) return;
    onChange([...items, val]);
    setNewItem("");
  }

  function removeItem(index: number) {
    const key = items[index];
    const next = items.filter((_, i) => i !== index);
    onChange(next);
    const nextMap = { ...hebrewMap };
    delete nextMap[key];
    onHebrewChange(nextMap);
  }

  function updateHebrew(key: string, value: string) {
    onHebrewChange({ ...hebrewMap, [key]: value });
  }

  return (
    <div className="surface-card p-5">
      <h3 className="text-[15px] font-bold mb-3" style={{ color: "var(--text-1)" }}>{title}</h3>
      <div className="space-y-2 mb-3">
        {items.map((item, i) => (
          <div key={item} className="flex items-center gap-2">
            <span className="text-[13px] font-mono w-24 shrink-0 text-right" style={{ color: "var(--text-2)" }}>{item}</span>
            <input
              type="text"
              value={hebrewMap[item] || ""}
              onChange={(e) => updateHebrew(item, e.target.value)}
              placeholder="תרגום עברי"
              className="flex-1 px-2 py-1 rounded-lg border text-[13px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="p-1 rounded-lg transition-colors"
              style={{ color: "var(--danger)" }}
            >
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="הוסף ערך חדש..."
          className="flex-1 px-2 py-1 rounded-lg border text-[13px]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-1)" }}
          dir="ltr"
        />
        <button
          type="button"
          onClick={addItem}
          className="p-1 rounded-lg transition-colors"
          style={{ color: "var(--accent)" }}
        >
          <IconPlus size={16} />
        </button>
      </div>
    </div>
  );
}
