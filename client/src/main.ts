import './app.css'
import { mount, unmount } from 'svelte'
import App from './App.svelte'
import Elsewhere from './views/Elsewhere.svelte'
import { shutdown } from './lib/api.ts'

const target = document.getElementById('app')!
const channel = new BroadcastChannel('pip-tabs')
let view: Record<string, unknown> | null = null
let release: (() => void) | null = null

const show = (next: () => Record<string, unknown>) => {
  if (view) void unmount(view)
  target.replaceChildren()
  view = next()
}

const run = () => {
  show(() => mount(App, { target }))
  return new Promise<void>(resolve => (release = resolve))
}

const claim = () => {
  channel.postMessage('take')
  void navigator.locks.request('pip', run)
}

const wait = (moved: boolean) => show(() => mount(Elsewhere, { target, props: { moved, onclaim: claim } }))

channel.onmessage = e => {
  if (e.data !== 'take' || !release) return
  shutdown()
  wait(true)
  release()
  release = null
}

if (navigator.locks) void navigator.locks.request('pip', { ifAvailable: true }, lock => (lock ? run() : wait(false)))
else show(() => mount(App, { target }))
