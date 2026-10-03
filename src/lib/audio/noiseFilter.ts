import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

export interface NoiseFilterPipeline {
  audioContext: AudioContext;
  outputStream: MediaStream;
  outputTrack: MediaStreamTrack;
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  destroy: () => void;
}

// Cache the wasm binary in memory so it's loaded only once across channel switches and mic tests
let cachedWasmBinary: ArrayBuffer | null = null;
let wasmLoadingPromise: Promise<ArrayBuffer> | null = null;

export async function getRnnoiseWasmBinary(): Promise<ArrayBuffer> {
  if (cachedWasmBinary) return cachedWasmBinary;
  if (wasmLoadingPromise) return wasmLoadingPromise;

  wasmLoadingPromise = (async () => {
    try {
      const binary = await loadRnnoise({
        url: rnnoiseWasmUrl,
        simdUrl: rnnoiseSimdWasmUrl,
      });
      cachedWasmBinary = binary;
      return binary;
    } catch (err) {
      console.error('[RNNoise] Failed to load WASM binary:', err);
      wasmLoadingPromise = null;
      throw err;
    }
  })();

  return wasmLoadingPromise;
}

export function isNoiseFilterSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.AudioContext !== 'undefined' &&
    typeof window.AudioWorkletNode !== 'undefined'
  );
}

/**
 * Creates a 48kHz audio pipeline with RNNoise noise suppression.
 * Uses smooth gain crossfading to switch between dry (unprocessed) and wet (RNNoise filtered) audio
 * without any clicks, pops, or stream renegotiation.
 */
export async function createNoiseFilterPipeline(
  inputStream: MediaStream,
  initiallyEnabled: boolean = true
): Promise<NoiseFilterPipeline> {
  if (!isNoiseFilterSupported()) {
    console.warn('[RNNoise] AudioWorklet / Web Audio not supported, falling back to raw stream');
    return createPassthroughPipeline(inputStream);
  }

  try {
    const wasmBinary = await getRnnoiseWasmBinary();

    // 48000 Hz is required by RNNoise (10ms / 480-sample frames)
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => {});
    }

    // Load the worklet processor into the AudioContext
    await audioContext.audioWorklet.addModule(rnnoiseWorkletUrl);

    // Audio graph:
    // inputStream -> sourceNode
    //    ├──> rnnoiseNode -> wetGainNode ──┐
    //    └──> dryGainNode ─────────────────┴──> destinationNode -> outputStream
    const sourceNode = audioContext.createMediaStreamSource(inputStream);
    const rnnoiseNode = new RnnoiseWorkletNode(audioContext, {
      maxChannels: 1,
      wasmBinary,
    });

    const wetGainNode = audioContext.createGain();
    wetGainNode.channelCount = 1;
    wetGainNode.channelCountMode = 'explicit';

    const dryGainNode = audioContext.createGain();
    dryGainNode.channelCount = 1;
    dryGainNode.channelCountMode = 'explicit';

    const destinationNode = audioContext.createMediaStreamDestination();
    destinationNode.channelCount = 1;
    destinationNode.channelCountMode = 'explicit';

    // Setup initial gains
    let isEnabled = initiallyEnabled;
    wetGainNode.gain.value = isEnabled ? 1.0 : 0.0;
    dryGainNode.gain.value = isEnabled ? 0.0 : 1.0;

    // Connect graph
    sourceNode.connect(rnnoiseNode);
    rnnoiseNode.connect(wetGainNode);
    wetGainNode.connect(destinationNode);

    sourceNode.connect(dryGainNode);
    dryGainNode.connect(destinationNode);

    const outputStream = destinationNode.stream;
    const outputTrack = outputStream.getAudioTracks()[0];

    const setEnabled = (enabled: boolean) => {
      if (isEnabled === enabled) return;
      isEnabled = enabled;

      const now = audioContext.currentTime;
      const fadeTime = 0.02; // 20ms smooth crossfade

      if (enabled) {
        dryGainNode.gain.cancelScheduledValues(now);
        wetGainNode.gain.cancelScheduledValues(now);
        dryGainNode.gain.setValueAtTime(dryGainNode.gain.value, now);
        wetGainNode.gain.setValueAtTime(wetGainNode.gain.value, now);
        dryGainNode.gain.linearRampToValueAtTime(0.0, now + fadeTime);
        wetGainNode.gain.linearRampToValueAtTime(1.0, now + fadeTime);
        console.log('[RNNoise] 🟢 Suppression du bruit IA activée (48kHz)');
      } else {
        dryGainNode.gain.cancelScheduledValues(now);
        wetGainNode.gain.cancelScheduledValues(now);
        dryGainNode.gain.setValueAtTime(dryGainNode.gain.value, now);
        wetGainNode.gain.setValueAtTime(wetGainNode.gain.value, now);
        dryGainNode.gain.linearRampToValueAtTime(1.0, now + fadeTime);
        wetGainNode.gain.linearRampToValueAtTime(0.0, now + fadeTime);
        console.log('[RNNoise] ⚪ Suppression du bruit IA désactivée (Direct/Bypass)');
      }
    };

    const destroy = () => {
      try {
        sourceNode.disconnect();
        if (typeof (rnnoiseNode as any).destroy === 'function') {
          rnnoiseNode.destroy();
        }
        rnnoiseNode.disconnect();
        wetGainNode.disconnect();
        dryGainNode.disconnect();
        destinationNode.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close().catch(() => {});
        }
      } catch (e) {
        console.warn('[RNNoise] Error destroying pipeline:', e);
      }
    };

    return {
      audioContext,
      outputStream,
      outputTrack,
      setEnabled,
      isEnabled: () => isEnabled,
      destroy,
    };
  } catch (err) {
    console.error('[RNNoise] Error creating noise filter pipeline, falling back to passthrough:', err);
    return createPassthroughPipeline(inputStream);
  }
}

function createPassthroughPipeline(inputStream: MediaStream): NoiseFilterPipeline {
  let isEnabled = false;
  const dummyCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return {
    audioContext: dummyCtx,
    outputStream: inputStream,
    outputTrack: inputStream.getAudioTracks()[0],
    setEnabled: (enabled: boolean) => {
      isEnabled = enabled;
    },
    isEnabled: () => isEnabled,
    destroy: () => {
      if (dummyCtx.state !== 'closed') {
        dummyCtx.close().catch(() => {});
      }
    },
  };
}
