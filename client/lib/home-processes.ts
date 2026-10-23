/** Public synthetic examples only: local selection, no network or persistent state. */
export function initializeHomeProcesses(signal: AbortSignal): void {
  const root = document.querySelector<HTMLElement>('[data-home-processes]');
  if (!root || signal.aborted) return;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-home-process-select]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-home-process-panel]')];

  function select(index: number, focus = false): void {
    if (signal.aborted || index < 0 || index >= tabs.length) return;
    tabs.forEach((tab, item) => {
      tab.setAttribute('aria-selected', String(item === index));
      tab.tabIndex = item === index ? 0 : -1;
    });
    panels.forEach((panel, item) => { panel.hidden = item !== index; });
    if (focus) tabs[index]!.focus({ preventScroll: true });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index), { signal });
    tab.addEventListener('keydown', (event) => {
      let next: number;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(next, true);
    }, { signal });
  });
  select(0);
}
