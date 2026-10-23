/** Enhance only the illustrative homepage workflow. All story text remains readable without JS. */
export function initializePublicWorkflow(signal: AbortSignal): void {
  const root = document.querySelector<HTMLElement>('#workflow.home-workflow');
  if (!root || signal.aborted) return;

  const controls = [...root.querySelectorAll<HTMLButtonElement>('[data-workflow-select]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-workflow-panel]')];
  const storySteps = [...root.querySelectorAll<HTMLElement>('[data-workflow-step]')];
  const announcement = root.querySelector<HTMLElement>('[data-workflow-announcement]');
  const motionNote = root.querySelector<HTMLElement>('[data-workflow-motion-note]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0;
  let observer: IntersectionObserver | undefined;

  function select(index: number, explicit = false): void {
    if (index < 0 || index >= controls.length || signal.aborted) return;
    active = index;
    root!.dataset.workflowActive = String(index);
    controls.forEach((control, item) => control.setAttribute('aria-pressed', String(item === index)));
    panels.forEach((panel, item) => { panel.hidden = item !== index; });
    storySteps.forEach((step, item) => step.classList.toggle('is-current', item === index));
    if (explicit && announcement) {
      announcement.textContent = `Step ${index + 1} of ${controls.length}: ${controls[index]!.querySelector('span:last-child')?.textContent ?? ''}. Example only.`;
    }
  }

  controls.forEach((control, index) => {
    control.addEventListener('click', () => select(index, true), { signal });
    control.addEventListener('keydown', (event) => {
      let next: number;
      if (event.key === 'ArrowRight') next = (index + 1) % controls.length;
      else if (event.key === 'ArrowLeft') next = (index + controls.length - 1) % controls.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = controls.length - 1;
      else return;
      event.preventDefault();
      select(next, true);
      controls[next]!.focus({ preventScroll: true });
    }, { signal });
  });

  function configureMotion(): void {
    observer?.disconnect();
    observer = undefined;
    const useScroll = !reducedMotion.matches && typeof IntersectionObserver !== 'undefined';
    root!.dataset.workflowMotion = useScroll ? 'scroll' : 'manual';
    if (motionNote) motionNote.textContent = useScroll
      ? 'Scroll to follow the example, or choose a step.'
      : 'Choose a step to explore the example. Automatic motion is off.';
    if (!useScroll || signal.aborted) return;

    const visible = new Map<Element, number>();
    observer = new IntersectionObserver((entries) => {
      if (signal.aborted || reducedMotion.matches) return;
      entries.forEach((entry) => visible.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
      let candidate = active;
      let greatestVisibility = 0;
      storySteps.forEach((step, index) => {
        const ratio = visible.get(step) ?? 0;
        if (ratio > greatestVisibility) {
          candidate = index;
          greatestVisibility = ratio;
        }
      });
      if (greatestVisibility > 0 && candidate !== active) select(candidate);
    }, { rootMargin: '-18% 0px -32% 0px', threshold: [0, 0.15, 0.35, 0.6, 1] });
    storySteps.forEach((step) => observer!.observe(step));
  }

  reducedMotion.addEventListener('change', configureMotion, { signal });
  signal.addEventListener('abort', () => { observer?.disconnect(); observer = undefined; }, { once: true });
  select(0);
  configureMotion();
}
