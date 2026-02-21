
class SoundService {
  private ctx: AudioContext | null = null;

  private getCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playJoin() {
    // Upward chime
    this.playTone(440, 'sine', 0.2, 0.1);
    setTimeout(() => this.playTone(660, 'sine', 0.3, 0.08), 100);
  }

  playLeave() {
    // Downward chime
    this.playTone(660, 'sine', 0.2, 0.1);
    setTimeout(() => this.playTone(440, 'sine', 0.3, 0.08), 100);
  }

  playMessage() {
    // Subtle pop
    this.playTone(880, 'sine', 0.1, 0.05);
  }

  playScreenShare() {
    // Techy blip
    this.playTone(523.25, 'square', 0.1, 0.03);
    setTimeout(() => this.playTone(1046.50, 'sine', 0.2, 0.05), 50);
  }

  playToggle(on: boolean) {
    // High for on, low for off
    if (on) {
      this.playTone(880, 'sine', 0.1, 0.05);
    } else {
      this.playTone(440, 'sine', 0.1, 0.05);
    }
  }
}

export const soundService = new SoundService();
