"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminNav } from "@/components/admin/AdminNav"
import { Save, Plus, Trash2, Eye, EyeOff, RefreshCw } from "lucide-react"

interface CustomField {
  id: string
  label: string
  type: "text" | "email" | "tel" | "textarea" | "date"
  required: boolean
  placeholder?: string
  enabled: boolean
}

interface Settings {
  adminPassword: string
  businessEmail: string
  ccEmails: string
  orderEmailSubject: string
  taxRate: number
  taxEnabled: boolean
  draftOrdersEnabled: boolean
  repeatOrdersEnabled: boolean
  customFields: CustomField[]
}

const DEFAULT_SETTINGS: Settings = {
  adminPassword: "",
  businessEmail: "GraftonTowboatServices@gmail.com",
  ccEmails: "",
  orderEmailSubject: "New Order from {vessel_name} — #{order_number}",
  taxRate: 0,
  taxEnabled: false,
  draftOrdersEnabled: false,
  repeatOrdersEnabled: true,
  customFields: [
    { id: "vessel_name", label: "Company / Vessel Name", type: "text", required: true, placeholder: "M/V River Hawk", enabled: true },
    { id: "contact_name", label: "Contact Person Name", type: "text", required: true, placeholder: "Captain Smith", enabled: true },
    { id: "phone", label: "Phone Number", type: "tel", required: true, placeholder: "(618) 555-0000", enabled: true },
    { id: "po_number", label: "PO Number", type: "text", required: false, placeholder: "Optional", enabled: true },
    { id: "vessel_eta", label: "Vessel ETA", type: "date", required: false, enabled: true },
    { id: "notes", label: "Special Instructions / Notes", type: "textarea", required: false, placeholder: "Delivery notes, allergies, substitutions...", enabled: true },
  ],
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [activeTab, setActiveTab] = useState<"general" | "email" | "fields" | "features">("general")

  useEffect(() => {
    const token = sessionStorage.getItem("admin_token")
    if (!token) { router.push("/admin"); return }

    // Load saved settings from localStorage (in production, load from Supabase)
    const saved = localStorage.getItem("grafton_admin_settings")
    if (saved) {
      try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) }) } catch {}
    }
  }, [router])

  const handleSave = async () => {
    setSaving(true)
    // In production: POST to /api/admin/settings
    localStorage.setItem("grafton_admin_settings", JSON.stringify(settings))
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const addCustomField = () => {
    const newField: CustomField = {
      id: `field_${Date.now()}`,
      label: "New Field",
      type: "text",
      required: false,
      placeholder: "",
      enabled: true,
    }
    setSettings(s => ({ ...s, customFields: [...s.customFields, newField] }))
  }

  const updateField = (id: string, updates: Partial<CustomField>) => {
    setSettings(s => ({
      ...s,
      customFields: s.customFields.map(f => f.id === id ? { ...f, ...updates } : f)
    }))
  }

  const removeField = (id: string) => {
    const coreIds = ["vessel_name", "contact_name", "phone"]
    if (coreIds.includes(id)) return
    setSettings(s => ({ ...s, customFields: s.customFields.filter(f => f.id !== id) }))
  }

  const tabs = [
    { key: "general", label: "General" },
    { key: "email", label: "Email" },
    { key: "fields", label: "Order Fields" },
    { key: "features", label: "Features" },
  ] as const

  return (
    <div className="min-h-screen bg-cream">
      <AdminNav />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-navy font-playfair">Settings</h1>
            <p className="text-steel/70 text-sm mt-1">Configure your ordering system</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 mb-6 shadow-sm border border-sand">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-navy text-white"
                  : "text-steel hover:bg-sand"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* General Tab */}
        {activeTab === "general" && (
          <div className="card-base space-y-5">
            <h2 className="font-semibold text-navy">Admin Access</h2>
            <div>
              <label className="block text-sm font-medium text-steel mb-1">
                New Admin Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password to change..."
                  className="input-base pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-steel/50"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-steel/60 mt-1">
                Leave blank to keep current password. Changes require re-deploy with updated ADMIN_PASSWORD env var.
              </p>
            </div>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === "email" && (
          <div className="card-base space-y-5">
            <h2 className="font-semibold text-navy">Email Notifications</h2>
            <div>
              <label className="block text-sm font-medium text-steel mb-1">Business Email</label>
              <input
                type="email"
                value={settings.businessEmail}
                onChange={e => setSettings(s => ({ ...s, businessEmail: e.target.value }))}
                className="input-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-steel mb-1">CC Emails</label>
              <input
                type="text"
                value={settings.ccEmails}
                onChange={e => setSettings(s => ({ ...s, ccEmails: e.target.value }))}
                placeholder="email1@example.com, email2@example.com"
                className="input-base"
              />
              <p className="text-xs text-steel/60 mt-1">Comma-separated list of additional recipients</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-steel mb-1">Email Subject Template</label>
              <input
                type="text"
                value={settings.orderEmailSubject}
                onChange={e => setSettings(s => ({ ...s, orderEmailSubject: e.target.value }))}
                className="input-base"
              />
              <p className="text-xs text-steel/60 mt-1">
                Variables: <code className="bg-sand px-1 rounded">{"{vessel_name}"}</code>{" "}
                <code className="bg-sand px-1 rounded">{"{order_number}"}</code>{" "}
                <code className="bg-sand px-1 rounded">{"{date}"}</code>
              </p>
            </div>
          </div>
        )}

        {/* Order Fields Tab */}
        {activeTab === "fields" && (
          <div className="space-y-4">
            <div className="card-base">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-navy">Customer Order Fields</h2>
                <button onClick={addCustomField} className="btn-outline text-sm flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Add Field
                </button>
              </div>
              <p className="text-sm text-steel/70 mb-4">
                Configure which fields customers fill out when submitting an order. Core fields (Vessel Name, Contact, Phone) cannot be removed.
              </p>
              <div className="space-y-3">
                {settings.customFields.map((field) => {
                  const isCore = ["vessel_name", "contact_name", "phone"].includes(field.id)
                  return (
                    <div key={field.id} className="border border-sand rounded-xl p-4 bg-cream/50">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-steel/70 mb-1 block">Label</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => updateField(field.id, { label: e.target.value })}
                              className="input-base text-sm py-1.5"
                              disabled={isCore}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-steel/70 mb-1 block">Type</label>
                            <select
                              value={field.type}
                              onChange={e => updateField(field.id, { type: e.target.value as CustomField["type"] })}
                              className="input-base text-sm py-1.5"
                              disabled={isCore}
                            >
                              <option value="text">Text</option>
                              <option value="email">Email</option>
                              <option value="tel">Phone</option>
                              <option value="textarea">Textarea</option>
                              <option value="date">Date</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-steel/70 mb-1 block">Placeholder</label>
                            <input
                              type="text"
                              value={field.placeholder || ""}
                              onChange={e => updateField(field.id, { placeholder: e.target.value })}
                              className="input-base text-sm py-1.5"
                            />
                          </div>
                          <div className="flex items-center gap-4 pt-5">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={e => updateField(field.id, { required: e.target.checked })}
                                className="rounded"
                                disabled={isCore}
                              />
                              Required
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.enabled}
                                onChange={e => updateField(field.id, { enabled: e.target.checked })}
                                className="rounded"
                                disabled={isCore}
                              />
                              Visible
                            </label>
                          </div>
                        </div>
                        {!isCore && (
                          <button
                            onClick={() => removeField(field.id)}
                            className="text-red-400 hover:text-red-600 p-1 mt-5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {isCore && (
                        <p className="text-xs text-gold mt-2">Core field — cannot be removed</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Features Tab */}
        {activeTab === "features" && (
          <div className="card-base space-y-5">
            <h2 className="font-semibold text-navy">Feature Toggles</h2>

            <div className="space-y-4">
              {[
                {
                  key: "draftOrdersEnabled" as const,
                  label: "Draft Orders",
                  description: "Allow customers to save and resume orders later using localStorage",
                },
                {
                  key: "repeatOrdersEnabled" as const,
                  label: "Repeat Last Order",
                  description: "Show a 'Reorder' option to quickly re-add items from a previous order",
                },
                {
                  key: "taxEnabled" as const,
                  label: "Enable Tax Calculation",
                  description: "Apply tax rate to order totals",
                },
              ].map(({ key, label, description }) => (
                <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-sand last:border-0">
                  <div>
                    <p className="font-medium text-navy text-sm">{label}</p>
                    <p className="text-xs text-steel/60 mt-0.5">{description}</p>
                  </div>
                  <button
                    onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings[key] ? "bg-river" : "bg-sand border-steel/20"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                        settings[key] ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}

              {settings.taxEnabled && (
                <div>
                  <label className="block text-sm font-medium text-steel mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={settings.taxRate}
                    onChange={e => setSettings(s => ({ ...s, taxRate: parseFloat(e.target.value) || 0 }))}
                    className="input-base w-32"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save button bottom */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
