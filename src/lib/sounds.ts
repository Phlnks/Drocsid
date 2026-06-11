let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(console.error);
  }
  return audioCtx;
};

const playTone = (freq: number, type: OscillatorType, duration: number, vol: number = 0.15, startTimeOffset: number = 0) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);
    
    // Normal envelope: rapid attack, exponential decay
    gain.gain.setValueAtTime(0, ctx.currentTime + startTimeOffset);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startTimeOffset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTimeOffset + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime + startTimeOffset);
    osc.stop(ctx.currentTime + startTimeOffset + duration);
  } catch (e) {
    console.error("Audio play error", e);
  }
};

const playReverseTone = (freq: number, type: OscillatorType, duration: number, vol: number = 0.15, startTimeOffset: number = 0) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);
    
    // Reversed envelope: slow linear attack, instant cutoff (reverse of decay)
    gain.gain.setValueAtTime(0, ctx.currentTime + startTimeOffset);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startTimeOffset + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startTimeOffset + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime + startTimeOffset);
    osc.stop(ctx.currentTime + startTimeOffset + duration);
  } catch (e) {
    console.error("Audio play error", e);
  }
};

export const playConnectSound = () => {
  playTone(440, 'sine', 0.15, 0.15, 0);
  playTone(554, 'sine', 0.15, 0.15, 0.1);
  playTone(659, 'sine', 0.3, 0.15, 0.2);
};

export const playDisconnectSound = () => {
  playTone(659, 'sine', 0.15, 0.15, 0);
  playTone(554, 'sine', 0.15, 0.15, 0.1);
  playTone(440, 'sine', 0.3, 0.15, 0.2);
};

export const playMuteSound = () => {
  playTone(300, 'sine', 0.2, 0.15, 0);
};

export const playUnmuteSound = () => {
  playTone(500, 'sine', 0.2, 0.15, 0);
};

export const playDeafenSound = () => {
  playTone(250, 'sine', 0.15, 0.15, 0);
  playTone(200, 'sine', 0.2, 0.15, 0.15);
};

export const playUndeafenSound = () => {
  playTone(400, 'sine', 0.15, 0.15, 0);
  playTone(500, 'sine', 0.2, 0.15, 0.15);
};

export const playMessageSound = () => {
  playTone(784, 'sine', 0.1, 0.15, 0); // G5
  playTone(1046, 'sine', 0.2, 0.15, 0.1); // C6
};

export const playScreenShareStartSound = () => {
  playTone(523.25, 'sine', 0.1, 0.15, 0); // C5
  playTone(659.25, 'sine', 0.1, 0.15, 0.1); // E5
  playTone(783.99, 'sine', 0.2, 0.15, 0.2); // G5
};

export const playScreenShareStopSound = () => {
  playTone(783.99, 'sine', 0.1, 0.15, 0); // G5
  playTone(659.25, 'sine', 0.1, 0.15, 0.1); // E5
  playTone(523.25, 'sine', 0.2, 0.15, 0.2); // C5
};

export const playScreenShareJoinSound = () => {
  playTone(440, 'triangle', 0.1, 0.15, 0);
  playTone(880, 'triangle', 0.2, 0.15, 0.1);
};

export const playScreenShareLeaveSound = () => {
  playTone(880, 'triangle', 0.1, 0.15, 0);
  playTone(440, 'triangle', 0.2, 0.15, 0.1);
};

export const playMoveSound = () => {
  playTone(600, 'sine', 0.1, 0.15, 0);
  playTone(800, 'sine', 0.1, 0.15, 0.05);
};

export const playPTTActivateSound = () => {
  playTone(400, 'sine', 0.05, 0.1, 0);
  playTone(600, 'sine', 0.05, 0.1, 0.03);
};

export const playPTTDeactivateSound = () => {
  playTone(600, 'sine', 0.05, 0.1, 0);
  playTone(400, 'sine', 0.05, 0.1, 0.03);
};
