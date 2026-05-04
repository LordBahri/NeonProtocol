/**
 * A named signal chain: GainNode → destination.
 * Master bus sits first; all child buses connect through it.
 */
export class AudioBus {
  readonly name: string;
  readonly gain: GainNode;
  private _volume = 1;
  private _muted  = false;
  private _preMuteVolume = 1;

  constructor(ctx: AudioContext, name: string, destination: AudioNode) {
    this.name = name;
    this.gain = ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(destination);
  }

  get volume(): number { return this._volume; }

  setVolume(value: number, rampTime = 0, ctx?: AudioContext): void {
    this._volume = Math.max(0, Math.min(1, value));
    if (!this._muted) {
      if (rampTime > 0 && ctx) {
        this.gain.gain.linearRampToValueAtTime(
          this._volume,
          ctx.currentTime + rampTime,
        );
      } else {
        this.gain.gain.value = this._volume;
      }
    }
  }

  mute(): void {
    if (this._muted) return;
    this._preMuteVolume = this._volume;
    this._muted = true;
    this.gain.gain.value = 0;
  }

  unmute(): void {
    if (!this._muted) return;
    this._muted = false;
    this.gain.gain.value = this._volume;
  }

  get isMuted(): boolean { return this._muted; }
}
