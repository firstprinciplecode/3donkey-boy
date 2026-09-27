import { formatScore } from './utils';

// Static markup only; all runtime values are written with textContent.
const MARKUP = `
<header class="hud">
  <div class="hud__cell hud__left">
    <span class="hud__label">player-1</span>
    <div class="hud__lives" data-lives></div>
  </div>
  <div class="hud__cell hud__center">
    <span class="hud__label">score-</span><span class="hud__value" data-score>000-000</span><span class="hud__label">pt</span>
  </div>
  <div class="hud__cell hud__right">
    <div><span class="hud__label">round-</span><span class="hud__value hud__value--sm" data-round>1</span></div>
    <div><span class="hud__label">bonus </span><span class="hud__bonus" data-bonus>5000</span></div>
    <div><span class="hud__label">hi-</span><span class="hud__value hud__value--sm" data-hi>000-000</span></div>
  </div>
</header>
<div class="popups" data-popups></div>
<div class="banner" data-banner>
  <div class="banner__text" data-banner-text></div>
  <div class="banner__sub" data-banner-sub></div>
</div>
<div class="overlay" data-overlay>
  <div class="overlay__panel">
    <h1 class="title" data-title aria-label="Donkey Boy"></h1>
    <h2 class="overlay__heading" data-heading></h2>
    <p class="overlay__sub" data-sub></p>
    <ul class="controls" data-controls>
      <li><kbd>&larr;</kbd><kbd>&rarr;</kbd> run</li>
      <li><kbd>&uarr;</kbd><kbd>&darr;</kbd> climb ladders</li>
      <li><kbd>space</kbd> jump</li>
      <li><kbd>p</kbd> pause &middot; <kbd>m</kbd> mute</li>
    </ul>
    <p class="overlay__hint" data-hint>dodge the barrels &middot; jump them for points &middot; reach the 1-up at the top</p>
  </div>
</div>`;

const TITLE = 'donkey boy';
const TITLE_COLORS = ['c-orange', 'c-green', 'c-teal', 'c-yellow', 'c-pink'];

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`HUD element missing: ${selector}`);
  return el;
}

export class Hud {
  private readonly score: HTMLElement;
  private readonly hi: HTMLElement;
  private readonly bonus: HTMLElement;
  private readonly round: HTMLElement;
  private readonly lives: HTMLElement;
  private readonly popups: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly bannerText: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly title: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly controlsList: HTMLElement;
  private readonly hint: HTMLElement;
  private bannerTimer = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = MARKUP;
    this.score = query(root, '[data-score]');
    this.hi = query(root, '[data-hi]');
    this.bonus = query(root, '[data-bonus]');
    this.round = query(root, '[data-round]');
    this.lives = query(root, '[data-lives]');
    this.popups = query(root, '[data-popups]');
    this.bannerEl = query(root, '[data-banner]');
    this.bannerText = query(root, '[data-banner-text]');
    this.bannerSub = query(root, '[data-banner-sub]');
    this.overlay = query(root, '[data-overlay]');
    this.title = query(root, '[data-title]');
    this.heading = query(root, '[data-heading]');
    this.sub = query(root, '[data-sub]');
    this.controlsList = query(root, '[data-controls]');
    this.hint = query(root, '[data-hint]');

    [...TITLE].forEach((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      span.setAttribute('aria-hidden', 'true');
      if (ch === ' ') span.className = 'space';
      else span.className = TITLE_COLORS[i % TITLE_COLORS.length];
      span.style.setProperty('--i', String(i));
      this.title.appendChild(span);
    });
  }

  setScore(n: number): void {
    this.score.textContent = formatScore(n);
  }

  setHi(n: number): void {
    this.hi.textContent = formatScore(n);
  }

  setRound(n: number): void {
    this.round.textContent = String(n);
  }

  setBonus(n: number): void {
    this.bonus.textContent = String(n);
    this.bonus.classList.toggle('hud__bonus--low', n <= 1000);
  }

  setLives(n: number): void {
    this.lives.replaceChildren(
      ...Array.from({ length: Math.max(0, n) }, () => {
        const badge = document.createElement('span');
        badge.className = 'life';
        badge.textContent = '1-up';
        return badge;
      }),
    );
  }

  showTitle(): void {
    this.title.hidden = false;
    this.heading.hidden = true;
    this.sub.textContent = 'press space to start';
    this.controlsList.hidden = false;
    this.hint.hidden = false;
    this.overlay.classList.add('overlay--visible');
  }

  showMessage(heading: string, sub: string): void {
    this.title.hidden = true;
    this.heading.hidden = false;
    this.heading.textContent = heading;
    this.sub.textContent = sub;
    this.controlsList.hidden = true;
    this.hint.hidden = true;
    this.overlay.classList.add('overlay--visible');
  }

  hideOverlay(): void {
    this.overlay.classList.remove('overlay--visible');
  }

  banner(text: string, durationMs: number, sub = ''): void {
    this.bannerText.textContent = text;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.add('banner--visible');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.remove('banner--visible'), durationMs);
  }

  setBannerSub(sub: string): void {
    this.bannerSub.textContent = sub;
  }

  popup(text: string, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    this.popups.appendChild(el);
  }
}
