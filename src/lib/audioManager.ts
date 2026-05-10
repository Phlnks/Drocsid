// src/lib/audioManager.ts
// Gère les GainNodes par peer pour le volume individuel

interface PeerAudioChain {
  audioContext: AudioContext;
  gainNode: GainNode;
  sourceNode: MediaStreamAudioSourceNode;
  outputStream: MediaStream;
}

const peerChains = new Map<string, PeerAudioChain>();
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

export function createPeerAudioChain(peerId: string, inputStream: MediaStream, volume: number): MediaStream {
  // Nettoie une chaîne existante si elle existe
  destroyPeerAudioChain(peerId);

  const audioContext = getAudioContext();

  const sourceNode = audioContext.createMediaStreamSource(inputStream);
  const gainNode = audioContext.createGain();
  gainNode.gain.value = Math.max(0, Math.min(2.0, volume)); // clamp 0-200%

  const destinationNode = audioContext.createMediaStreamDestination();

  sourceNode.connect(gainNode);
  gainNode.connect(destinationNode);

  peerChains.set(peerId, {
    audioContext,
    gainNode,
    sourceNode,
    outputStream: destinationNode.stream,
  });

  return destinationNode.stream; // ← ce stream va dans l'élément <audio>
}

export function setPeerGain(peerId: string, volume: number) {
  const chain = peerChains.get(peerId);
  if (!chain) return;
  chain.gainNode.gain.value = Math.max(0, Math.min(2.0, volume));
}

export function destroyPeerAudioChain(peerId: string) {
  const chain = peerChains.get(peerId);
  if (!chain) return;
  try {
    chain.sourceNode.disconnect();
    chain.gainNode.disconnect();
  } catch (_) {}
  peerChains.delete(peerId);
}

export function destroyAllPeerAudioChains() {
  peerChains.forEach((_, peerId) => destroyPeerAudioChain(peerId));
}