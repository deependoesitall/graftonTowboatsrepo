"use client"

import * as React from "react"

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 4000

type ToastVariant = "default" | "destructive" | "success"

export type Toast = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

type ToastAction =
  | { type: "ADD_TOAST"; toast: Toast }
  | { type: "REMOVE_TOAST"; toastId: string }
  | { type: "DISMISS_TOAST"; toastId: string }

interface ToastState {
  toasts: Toast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case "DISMISS_TOAST": {
      const { toastId } = action
      if (!toastTimeouts.has(toastId)) {
        const timeout = setTimeout(() => {
          toastTimeouts.delete(toastId)
          dispatch({ type: "REMOVE_TOAST", toastId })
        }, TOAST_REMOVE_DELAY)
        toastTimeouts.set(toastId, timeout)
      }
      return state
    }
    case "REMOVE_TOAST":
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type Listeners = Array<(state: ToastState) => void>
let memoryState: ToastState = { toasts: [] }
const listeners: Listeners = []

function dispatch(action: ToastAction) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(memoryState))
}

function toast(props: Omit<Toast, "id">) {
  const id = genId()
  const duration = props.duration ?? TOAST_REMOVE_DELAY

  dispatch({ type: "ADD_TOAST", toast: { ...props, id } })

  setTimeout(() => {
    dispatch({ type: "DISMISS_TOAST", toastId: id })
  }, duration)

  return id
}

function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return {
    toasts: state.toasts,
    toast,
    dismiss: (toastId: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
