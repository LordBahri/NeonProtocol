/**
 * Global ship lighting state.
 * The "sun" direction slowly drifts to simulate moving through different
 * nebula zones. All ShipMaterialFilter instances read from this each frame.
 */
export const ShipLighting = {
  dir:          new Float32Array([0.45, -0.62, 0.64]),
  color:        new Float32Array([1.0,   0.92,  0.78]),
  ambient:      0.35,
  rimStrength:  0.55,

  _time: 0,

  update(dt: number): void {
    this._time += dt;

    // Full drift cycle every ~250 s — imperceptible per-frame, obvious over a session
    const angle = this._time * 0.025;
    const tilt  = Math.PI * 0.28; // ~50° off vertical
    const sin   = Math.sin(tilt);
    const cos   = Math.cos(tilt);

    // Normalize inline
    const x = Math.cos(angle) * sin;
    const y = Math.sin(angle) * sin;
    const z = cos;
    const len = Math.sqrt(x * x + y * y + z * z);
    this.dir[0] = x / len;
    this.dir[1] = y / len;
    this.dir[2] = z / len;

    // Slowly breathe between warm (star) and cool (nebula) tints
    const warmCool = 0.5 + 0.5 * Math.sin(this._time * 0.008);
    this.color[0] = 0.88 + warmCool * 0.12;  // R: 0.88–1.00
    this.color[1] = 0.88 + warmCool * 0.06;  // G: 0.88–0.94
    this.color[2] = 0.78 + (1.0 - warmCool) * 0.18; // B: 0.78–0.96 (cooler when not warm)
  },
};
