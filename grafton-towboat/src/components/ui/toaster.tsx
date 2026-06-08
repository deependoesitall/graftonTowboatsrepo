"use client"

import { useToast } from "@/hooks/use-toast"
import { X, CheckCircle, AlertCircle, Info } from "lucide-react"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map((toast) => {
        const isDestructive = toast.variant === "destructive"
        const isSuccess = toast.variant === "success"

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2 ${
              isDestructive
                ? "bg-red-600 text-white"
                : isSuccess
                ? "bg-green-700 text-white"
                : "bg-navy text-white"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {isDestructive ? (
                <AlertCircle className="w-4 h-4" />
              ) : isSuccess ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Info className="w-4 h-4" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              {toast.title && <p className="font-semibold">{toast.title}</p>}
              {toast.description && (
                <p className="opacity-90 text-xs mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
