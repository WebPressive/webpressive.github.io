/**
 * Speech-to-text worker for the live transcript. Runs the Moonshine tiny model (English) on this
 * computer with ONNX Runtime (WebAssembly); no audio leaves the machine. The model is downloaded from
 * Hugging Face on first use and kept in the browser's cache; the runtime ships with the app.
 *
 * In:  { type: 'load' } | { type: 'transcribe', id, audio }   (audio: 16 kHz mono Float32Array)
 * Out: { type: 'progress', progress } | { type: 'ready' } | { type: 'result', id, text } | { type: 'error', message, id? }
 */
import { env, pipeline } from '@huggingface/transformers';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

const MODEL_ID = 'onnx-community/moonshine-tiny-ONNX';
const SAMPLE_RATE = 16000;
const TOKENS_PER_SECOND = 6.5; // Moonshine's own cap on output length: stops runaway repetition

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;

const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { wasm: new URL(ortWasmUrl, self.location.href).href, mjs: new URL(ortMjsUrl, self.location.href).href };
  onnx.wasm.numThreads = 1; // More threads measured no faster for this model (and need cross-origin isolation)
}
env.allowLocalModels = false;

let loading: Promise<Transcriber> | null = null;

function load(): Promise<Transcriber> {
  if (!loading) {
    // Download progress over all model files, by bytes
    const files = new Map<string, { loaded: number; total: number }>();
    loading = (
      pipeline('automatic-speech-recognition', MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (info.status !== 'progress' || !info.file || !info.total) return;
          files.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
          let loaded = 0;
          let total = 0;
          files.forEach((f: { loaded: number; total: number }) => {
            loaded += f.loaded;
            total += f.total;
          });
          self.postMessage({ type: 'progress', progress: total ? loaded / total : 0 });
        },
      }) as unknown as Promise<Transcriber>
    ).catch((error: unknown) => {
      loading = null; // A later 'load' tries again (e.g. after a network error)
      throw error;
    });
  }
  return loading;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

self.onmessage = async (event: MessageEvent) => {
  const data = event.data as { type: 'load' } | { type: 'transcribe'; id: number; audio: Float32Array };
  if (data.type === 'load') {
    try {
      await load();
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: message(error) });
    }
    return;
  }
  if (data.type === 'transcribe') {
    try {
      const transcribe = await load();
      const seconds = data.audio.length / SAMPLE_RATE;
      const out = await transcribe(data.audio, { max_new_tokens: Math.max(8, Math.ceil(seconds * TOKENS_PER_SECOND)) });
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
      self.postMessage({ type: 'result', id: data.id, text });
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: message(error) });
    }
  }
};
