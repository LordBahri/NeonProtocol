export class GrainOverlay {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      'z-index:9000',
      'opacity:0.035',
      'mix-blend-mode:screen',
    ].join(';');

    // SVG feTurbulence gives a static film-grain texture that covers the whole screen
    this.el.innerHTML = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <filter id="grain-filter" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-filter)"/>
    </svg>`;

    document.body.appendChild(this.el);
  }

  destroy(): void {
    this.el.remove();
  }
}
