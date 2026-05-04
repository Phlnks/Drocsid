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

let ringtoneInterval: any = null;

export const playRingtone = () => {
  if (ringtoneInterval) return;
  
  const ring = () => {
    // Professional melodic ringtone (Skype/Teams style) - Faster and more present version
    const now = 0;
    const speed = 0.65; // Slightly faster
    const vol = 0.25; // Increased volume
    
    // Main melody (triangle wave for more presence than sine)
    // Rising sequence
    playTone(392.00, 'triangle', 0.2 * speed, vol, now);       // G4
    playTone(523.25, 'triangle', 0.2 * speed, vol, now + 0.2 * speed); // C5
    playTone(659.25, 'triangle', 0.2 * speed, vol, now + 0.4 * speed);  // E5
    playTone(783.99, 'triangle', 0.4 * speed, vol, now + 0.6 * speed); // G5
    
    // Response sequence
    playTone(880.00, 'triangle', 0.2 * speed, vol - 0.05, now + 1.1 * speed); // A5
    playTone(783.99, 'triangle', 0.2 * speed, vol - 0.05, now + 1.3 * speed); // G5
    playTone(659.25, 'triangle', 0.2 * speed, vol - 0.05, now + 1.5 * speed);  // E5
    playTone(523.25, 'triangle', 0.4 * speed, vol - 0.05, now + 1.7 * speed);  // C5
    
    // Low harmonic support
    playTone(261.63, 'square', 0.8, 0.05, now + 0.4 * speed);  // C4
    playTone(349.23, 'square', 0.8, 0.05, now + 1.3 * speed); // F4
  };
  
  ring();
  ringtoneInterval = setInterval(ring, 3000); // 3 second professional loop (faster)
};

export const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
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
