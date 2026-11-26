export interface Toast {
  id: number
  text: string
  tone: 'info' | 'good' | 'bad'
  href?: string
}

export const toasts = $state<Toast[]>([])

let seq = 0

export const toast = (text: string, tone: Toast['tone'] = 'info', href?: string) => {
  const id = ++seq
  toasts.push({ id, text, tone, href })
  if (toasts.length > 3) toasts.shift()
  setTimeout(() => {
    const i = toasts.findIndex(t => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, 4200)
}
