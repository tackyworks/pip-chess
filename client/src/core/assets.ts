import { ENGINE, enginePart } from '../../../shared/engine.ts'

const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/'

export const ASSETS = {
  engine: `/engine/${ENGINE.name}.js`,
  engineParts: Array.from({ length: ENGINE.parts }, (_, i) => enginePart(i)),
  maia: import.meta.env.VITE_MAIA_MODEL ?? 'https://huggingface.co/bqrio/maia3-onnx/resolve/main/maia3-23m.fp16.onnx',
  maiaMoves: '/data/maia3-moves.json',
  openings: '/data/openings.json',
  puzzles: (theme: string, bucket: number) => `/puzzles/${theme}/${bucket}.json`,
  ort: ORT,
  ortRuntime: `${ORT}ort.webgpu.min.mjs`,
  ortWasm: `${ORT}ort-wasm-simd-threaded.asyncify.wasm`,
}

export const HEAVY = [ASSETS.engine, ...ASSETS.engineParts, ASSETS.maia, ASSETS.ortWasm]
