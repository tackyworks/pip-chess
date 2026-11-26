export const ENGINE = { name: 'stockfish-19-single', parts: 5 } as const

export const enginePart = (i: number) => `/engine/${ENGINE.name}.wasm.${i}`
