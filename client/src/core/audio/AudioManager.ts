import { AudioBus } from './AudioBus.ts';
import type { AssetManager } from '../assets/AssetManager.ts';

export interface SoundOptions {
  bus?: 'sfx' | 'music' | 'ui';
  volume?: number;
  loop?: boolean;
  /** Playback rate (1 = normal, 0.5 = half speed) */
  rate?: number;
  /** World-space position for spatial audio */
  worldX?: number;
  worldY?: number;
}

interface ActiveSound {
  id:      number;
  source:  AudioBufferSourceNode;
  gain:    GainNode;
  panner?: PannerNode;
  loop:    boolean;
  key:     string;
}

let nextSoundId = 1;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: AudioBus;
  private sfxBus!: AudioBus;
  private musicBus!: AudioBus;
  private uiBus!: AudioBus;

  private decoded  = new Map<string, AudioBuffer>();
  private active   = new Map<number, ActiveSound>();
  private assets: AssetManager;

  private listenerX = 0;
  private listenerY = 0;
  private listenerScale = 1 / 800; // world units → Web Audio distance

  private _suspended = true;
  private pendingResume: Array<() => void> = [];

  constructor(assets: AssetManager) {
    this.assets = assets;
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────────

  /**
   * Must be called inside a user gesture (click/keydown).
   * Web Audio context cannot be created or resumed otherwise.
   */
  async resume(): Promise<void> {
    if (!this.ctx) this.buildContext();

    if (this.ctx!.state === 'suspended') {
      await this.ctx!.resume();
    }
    this._suspended = false;

    for (const fn of this.pendingResume) fn();
    this.pendingResume = [];
  }

  private buildContext(): void {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });

    this.master   = new AudioBus(this.ctx, 'master', this.ctx.destination);
    this.sfxBus   = new AudioBus(this.ctx, 'sfx',   this.master.gain);
    this.musicBus = new AudioBus(this.ctx, 'music', this.master.gain);
    this.uiBus    = new AudioBus(this.ctx, 'ui',    this.master.gain);
  }

  // ── Playback ────────────────────────────────────────────────────────────────

  play(key: string, opts: SoundOptions = {}): number {
    const id = nextSoundId++;
    if (!this.ctx || this._suspended) {
      this.pendingResume.push(() => this.playNow(key, id, opts));
      return id;
    }
    this.playNow(key, id, opts);
    return id;
  }

  private async playNow(key: string, id: number, opts: SoundOptions): Promise<void> {
    const ctx = this.ctx!;
    const buf = await this.getDecoded(key);
    if (!buf) return;

    const gain   = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;

    let destination: AudioNode = gain;

    if (opts.worldX !== undefined && opts.worldY !== undefined) {
      const panner = ctx.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance   = 1;
      panner.maxDistance   = 10000;
      panner.rolloffFactor = 1;
      this.applyPannerPosition(panner, opts.worldX, opts.worldY);
      panner.connect(gain);
      destination = panner;

      const source = ctx.createBufferSource();
      source.buffer      = buf;
      source.loop        = opts.loop ?? false;
      source.playbackRate.value = opts.rate ?? 1;
      source.connect(destination);
      gain.connect(this.getBus(opts.bus ?? 'sfx').gain);
      source.start();

      const sound: ActiveSound = { id, source, gain, panner, loop: source.loop, key };
      this.active.set(id, sound);
      source.onended = () => this.active.delete(id);
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer      = buf;
    source.loop        = opts.loop ?? false;
    source.playbackRate.value = opts.rate ?? 1;
    source.connect(destination);
    gain.connect(this.getBus(opts.bus ?? 'sfx').gain);
    source.start();

    const sound: ActiveSound = { id, source, gain, loop: source.loop, key };
    this.active.set(id, sound);
    source.onended = () => this.active.delete(id);
  }

  stop(id: number, fadeOut = 0): void {
    const sound = this.active.get(id);
    if (!sound) return;

    if (fadeOut > 0 && this.ctx) {
      sound.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeOut);
      setTimeout(() => { try { sound.source.stop(); } catch { /**/ } }, fadeOut * 1000 + 50);
    } else {
      try { sound.source.stop(); } catch { /**/ }
    }
    this.active.delete(id);
  }

  stopAll(fadeOut = 0): void {
    for (const id of this.active.keys()) this.stop(id, fadeOut);
  }

  // ── Spatial listener ────────────────────────────────────────────────────────

  setListenerPosition(worldX: number, worldY: number): void {
    this.listenerX = worldX;
    this.listenerY = worldY;

    if (!this.ctx) return;
    const L = this.ctx.listener;
    const x = worldX * this.listenerScale;
    const y = worldY * this.listenerScale;
    if (L.positionX) {
      L.positionX.value = x;
      L.positionY.value = 0;
      L.positionZ.value = y;
    }

    for (const sound of this.active.values()) {
      if (sound.panner) {
        const asset = this.active.get(sound.id);
        if (asset?.panner) this.applyPannerPosition(asset.panner, this.listenerX, this.listenerY);
      }
    }
  }

  private applyPannerPosition(panner: PannerNode, wx: number, wy: number): void {
    if (panner.positionX) {
      panner.positionX.value = wx * this.listenerScale;
      panner.positionY.value = 0;
      panner.positionZ.value = wy * this.listenerScale;
    }
  }

  // ── Volume & buses ──────────────────────────────────────────────────────────

  setMasterVolume(v: number, ramp = 0): void {
    this.master.setVolume(v, ramp, this.ctx ?? undefined);
  }
  setSFXVolume(v: number, ramp = 0):   void { this.sfxBus.setVolume(v, ramp, this.ctx ?? undefined); }
  setMusicVolume(v: number, ramp = 0): void { this.musicBus.setVolume(v, ramp, this.ctx ?? undefined); }
  setUIVolume(v: number, ramp = 0):    void { this.uiBus.setVolume(v, ramp, this.ctx ?? undefined); }

  muteAll():   void { this.master.mute(); }
  unmuteAll(): void { this.master.unmute(); }

  crossfadeMusic(fromId: number | null, toKey: string, duration = 1.5): number {
    if (fromId !== null) this.stop(fromId, duration);
    const newId = this.play(toKey, { bus: 'music', loop: true, volume: 0 });
    const sound = this.active.get(newId);
    if (sound && this.ctx) {
      sound.gain.gain.linearRampToValueAtTime(
        this.musicBus.volume,
        this.ctx.currentTime + duration,
      );
    }
    return newId;
  }

  // ── Decode cache ────────────────────────────────────────────────────────────

  private async getDecoded(key: string): Promise<AudioBuffer | null> {
    if (this.decoded.has(key)) return this.decoded.get(key)!;

    let raw: ArrayBuffer;
    try {
      raw = this.assets.getAudioBuffer(key);
    } catch {
      console.warn(`[Audio] Asset "${key}" not loaded`);
      return null;
    }

    const buf = await this.ctx!.decodeAudioData(raw.slice(0));
    this.decoded.set(key, buf);
    return buf;
  }

  private getBus(name: string): AudioBus {
    switch (name) {
      case 'music': return this.musicBus;
      case 'ui':    return this.uiBus;
      default:      return this.sfxBus;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  get isSuspended(): boolean { return this._suspended; }

  async destroy(): Promise<void> {
    this.stopAll();
    await this.ctx?.close();
    this.ctx = null;
    this.decoded.clear();
    this.active.clear();
  }
}
