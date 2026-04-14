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

const playTone = (freq: number, type: OscillatorType, duration: number, vol: number = 0.05, startTimeOffset: number = 0) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);
    
    // Envelope to avoid clicks
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

export const playConnectSound = () => {
  playTone(440, 'sine', 0.15, 0.05, 0);
  playTone(554, 'sine', 0.15, 0.05, 0.1);
  playTone(659, 'sine', 0.3, 0.05, 0.2);
};

export const playDisconnectSound = () => {
  playTone(659, 'sine', 0.15, 0.05, 0);
  playTone(554, 'sine', 0.15, 0.05, 0.1);
  playTone(440, 'sine', 0.3, 0.05, 0.2);
};

export const playMuteSound = () => {
  playTone(300, 'sine', 0.2, 0.05, 0);
};

export const playUnmuteSound = () => {
  playTone(500, 'sine', 0.2, 0.05, 0);
};

export const playDeafenSound = () => {
  playTone(250, 'sine', 0.15, 0.05, 0);
  playTone(200, 'sine', 0.2, 0.05, 0.15);
};

export const playUndeafenSound = () => {
  playTone(400, 'sine', 0.15, 0.05, 0);
  playTone(500, 'sine', 0.2, 0.05, 0.15);
};

export const playMessageSound = () => {
  playTone(784, 'sine', 0.1, 0.03, 0); // G5
  playTone(1046, 'sine', 0.2, 0.03, 0.1); // C6
};

let ringtoneInterval: any = null;

export const playRingtone = () => {
  if (ringtoneInterval) return;
  
  const ring = () => {
    // Modern melodic ringtone
    const now = 0;
    
    // Main melody (marimba-like)
    playTone(523.25, 'sine', 0.15, 0.06, now);      // C5
    playTone(659.25, 'sine', 0.15, 0.06, now + 0.2); // E5
    playTone(783.99, 'sine', 0.15, 0.06, now + 0.4); // G5
    playTone(1046.50, 'sine', 0.3, 0.06, now + 0.6); // C6
    
    playTone(880.00, 'sine', 0.15, 0.06, now + 1.0); // A5
    playTone(698.46, 'sine', 0.15, 0.06, now + 1.2); // F5
    playTone(523.25, 'sine', 0.3, 0.06, now + 1.4);  // C5
    
    // Harmony (soft pad)
    playTone(261.63, 'triangle', 0.8, 0.02, now);     // C4
    playTone(329.63, 'triangle', 0.8, 0.02, now + 0.8); // E4
    
    // Second part
    playTone(587.33, 'sine', 0.15, 0.06, now + 1.8); // D5
    playTone(739.99, 'sine', 0.15, 0.06, now + 2.0); // F#5
    playTone(880.00, 'sine', 0.15, 0.06, now + 2.2); // A5
    playTone(1174.66, 'sine', 0.3, 0.06, now + 2.4); // D6
  };
  
  ring();
  ringtoneInterval = setInterval(ring, 4000);
};

export const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
};

export const playScreenShareStartSound = () => {
  playTone(523.25, 'sine', 0.1, 0.05, 0); // C5
  playTone(659.25, 'sine', 0.1, 0.05, 0.1); // E5
  playTone(783.99, 'sine', 0.2, 0.05, 0.2); // G5
};

export const playScreenShareStopSound = () => {
  playTone(783.99, 'sine', 0.1, 0.05, 0); // G5
  playTone(659.25, 'sine', 0.1, 0.05, 0.1); // E5
  playTone(523.25, 'sine', 0.2, 0.05, 0.2); // C5
};

export const playScreenShareJoinSound = () => {
  playTone(440, 'triangle', 0.1, 0.05, 0);
  playTone(880, 'triangle', 0.2, 0.05, 0.1);
};

export const playScreenShareLeaveSound = () => {
  playTone(880, 'triangle', 0.1, 0.05, 0);
  playTone(440, 'triangle', 0.2, 0.05, 0.1);
};
