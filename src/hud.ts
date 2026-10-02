import starIcon from './assets/hud/star.svg';
import type { HiScoreEntry } from './hiscore';
import { formatScore, levelTitle } from './utils';

// Static markup only; all runtime values are written with textContent.
const MARKUP = `
<header class="hud hud--top">
  <div class="hud__cluster hud__left">
    <div class="hud__lives" data-lives></div>
    <div class="hud__letters" data-letters aria-label="letters collected"><span>1</span><span>U</span><span>P</span></div>
  </div>
  <span class="hud__score" data-score>0 PTS</span>
  <div class="hud__cluster hud__right">
    <img class="hud__star" src="${starIcon}" alt="" />
    <span class="hud__bonus" data-bonus>5000</span>
  </div>
</header>
<footer class="hud hud--bottom">
  <span class="hud__level-name" data-level-name></span>
</footer>
<div class="popups" data-popups></div>
<div class="banner" data-banner>
  <div class="banner__text" data-banner-text></div>
  <div class="banner__sub" data-banner-sub></div>
</div>
<div class="overlay" data-overlay>
  <div class="overlay__panel">
    <h1 class="title" data-title aria-label="Popscotch"></h1>
    <p class="overlay__teaser" data-hint>How high can you climb?</p>
    <h2 class="overlay__heading" data-heading></h2>
    <p class="overlay__sub" data-sub></p>
    <ul class="controls" data-controls>
      <li class="only-keys"><kbd>&larr;</kbd><kbd>&rarr;</kbd> Run</li>
      <li class="only-keys"><kbd>&uarr;</kbd><kbd>&darr;</kbd> Climb ladders</li>
      <li class="only-keys"><kbd>space</kbd> Jump</li>
      <li class="only-keys"><kbd>p</kbd> Pause &middot; <kbd>m</kbd> Mute</li>
      <li class="only-touch">Left pad: run and climb</li>
      <li class="only-touch">Right button: jump</li>
      <li class="only-pad"><kbd>d-pad</kbd> or stick: run and climb</li>
      <li class="only-pad"><kbd>A</kbd> Jump &middot; <kbd>start</kbd> Pause &middot; <kbd>back</kbd> Mute</li>
    </ul>
    <div class="board-wrap" data-board-wrap hidden>
      <p class="board__label">Hi-score</p>
      <ol class="board" data-board></ol>
    </div>
    <div class="initials" data-initials hidden>
      <div class="initials__slots" data-slots></div>
      <p class="overlay__hint" data-initials-hint></p>
    </div>
  </div>
</div>`;

const TITLE = 'POPSCOTCH';
const TITLE_COLORS = ['c-orange', 'c-green', 'c-teal', 'c-yellow', 'c-pink'];

/** One variant per input mode; CSS shows the one matching body[data-input]. */
export function byInput(keys: string, touch: string, pad: string): DocumentFragment {
  const out = document.createDocumentFragment();
  for (const [mode, text] of [
    ['keys', keys],
    ['touch', touch],
    ['pad', pad],
  ]) {
    const span = document.createElement('span');
    span.className = `only-${mode}`;
    span.textContent = text;
    out.appendChild(span);
  }
  return out;
}

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`HUD element missing: ${selector}`);
  return el;
}

export class Hud {
  private readonly score: HTMLElement;
  private readonly bonus: HTMLElement;
  private readonly levelName: HTMLElement;
  private readonly lives: HTMLElement;
  private readonly letters: HTMLElement;
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
  private readonly boardWrap: HTMLElement;
  private readonly board: HTMLElement;
  private readonly initialsEl: HTMLElement;
  private readonly slots: HTMLElement;
  private readonly initialsHint: HTMLElement;
  private bannerTimer = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = MARKUP;
    this.score = query(root, '[data-score]');
    this.bonus = query(root, '[data-bonus]');
    this.levelName = query(root, '[data-level-name]');
    this.lives = query(root, '[data-lives]');
    this.letters = query(root, '[data-letters]');
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
    this.boardWrap = query(root, '[data-board-wrap]');
    this.board = query(root, '[data-board]');
    this.initialsEl = query(root, '[data-initials]');
    this.slots = query(root, '[data-slots]');
    this.initialsHint = query(root, '[data-initials-hint]');

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
    this.score.textContent = `${Math.max(0, Math.floor(n))} PTS`;
  }

  /** The best score lives on the title board, not in the live stats. */
  setHi(_n: number): void {}

  setRound(_n: number): void {}

  setLevel(_n: number, name: string): void {
    this.levelName.textContent = levelTitle(name);
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
        badge.textContent = '1-Up';
        return badge;
      }),
    );
  }

  /** Lights up the 1-U-P chips collected so far in this level. */
  setLetters(held: readonly boolean[]): void {
    [...this.letters.children].forEach((chip, i) => chip.classList.toggle('on', !!held[i]));
  }

  showTitle(board: HiScoreEntry[]): void {
    this.title.hidden = false;
    this.heading.hidden = true;
    this.sub.replaceChildren(byInput('Press space to start', 'Tap jump to start', 'Press A to start'));
    this.controlsList.hidden = false;
    this.hint.hidden = false;
    this.initialsEl.hidden = true;
    this.renderBoard(board, null);
    this.overlay.classList.add('overlay--visible', 'overlay--scores');
  }

  /** `returning`: the initials are pre-filled from last time, so space just keeps them. */
  showInitials(letters: readonly string[], cursor: number, score: number, returning = false): void {
    this.title.hidden = true;
    this.heading.hidden = false;
    this.heading.textContent = returning ? 'New personal best!' : 'Enter your initials';
    this.sub.textContent = `${formatScore(score)} pt`;
    this.initialsHint.replaceChildren(
      returning
        ? byInput(
            'Space keeps your initials · Arrows or a letter key change them',
            'Jump keeps your initials · The pad changes them',
            'A keeps your initials · The d-pad changes them',
          )
        : byInput(
            'Arrows or a letter key · Space saves',
            'Up and down pick a letter, left and right move · Jump saves',
            'D-pad picks letters · A saves',
          ),
    );
    this.controlsList.hidden = true;
    this.hint.hidden = true;
    this.boardWrap.hidden = true;
    this.initialsEl.hidden = false;
    this.slots.replaceChildren(
      ...letters.map((letter, i) => {
        const slot = document.createElement('span');
        slot.className = i === cursor ? 'initials__slot initials__slot--on' : 'initials__slot';
        slot.textContent = letter;
        return slot;
      }),
    );
    this.overlay.classList.add('overlay--visible');
    this.overlay.classList.remove('overlay--scores');
  }

  showGameOver(score: number, board: HiScoreEntry[], highlight: number | null): void {
    this.title.hidden = true;
    this.heading.hidden = false;
    this.heading.textContent = 'Game over';
    this.sub.replaceChildren(
      `Score ${formatScore(score)} pt · `,
      byInput('Press space to play again', 'Tap jump to play again', 'Press A to play again'),
    );
    this.controlsList.hidden = true;
    this.hint.hidden = true;
    this.initialsEl.hidden = true;
    this.renderBoard(board, highlight);
    this.overlay.classList.add('overlay--visible', 'overlay--scores');
  }

  showMessage(heading: string, sub: string | DocumentFragment): void {
    this.title.hidden = true;
    this.heading.hidden = false;
    this.heading.textContent = heading;
    this.sub.replaceChildren(sub);
    this.controlsList.hidden = true;
    this.hint.hidden = true;
    this.boardWrap.hidden = true;
    this.initialsEl.hidden = true;
    this.overlay.classList.add('overlay--visible');
    this.overlay.classList.remove('overlay--scores');
  }

  hideOverlay(): void {
    this.overlay.classList.remove('overlay--visible');
  }

  private renderBoard(entries: HiScoreEntry[], highlight: number | null): void {
    this.board.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'board__empty';
      empty.textContent = 'No scores yet';
      this.board.appendChild(empty);
    } else {
      entries.forEach((entry, i) => {
        const row = document.createElement('li');
        row.className = i === highlight ? 'board__row board__row--you' : 'board__row';
        const rank = document.createElement('span');
        rank.className = 'board__rank';
        rank.textContent = String(i + 1);
        const name = document.createElement('span');
        name.className = 'board__name';
        name.textContent = entry.name;
        const score = document.createElement('span');
        score.className = 'board__score';
        score.textContent = formatScore(entry.score);
        row.append(rank, name, score);
        this.board.appendChild(row);
      });
    }
    this.boardWrap.hidden = false;
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
