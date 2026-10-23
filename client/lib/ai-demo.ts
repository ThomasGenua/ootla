import { aiDemoScenarios, renderAiDemoContent } from '../pages/ai-demo';
import type { AiDemoScenarioId } from '../pages/ai-demo';
import { icon } from './ui';

/** Manual-only local scripts. No requests, storage, timers or provider actions. */
export function initializeAiDemonstrations(signal: AbortSignal): void {
  const root = document.querySelector<HTMLElement>('#ai-demonstrations[data-ai-demo]');
  if (!root || signal.aborted) return;
  const content = root.querySelector<HTMLElement>('[data-demo-content]');
  const selectors = [...root.querySelectorAll<HTMLButtonElement>('button[data-demo-scenario]')];
  const next = root.querySelector<HTMLButtonElement>('[data-demo-next]');
  const replay = root.querySelector<HTMLButtonElement>('[data-demo-replay]');
  const description = root.querySelector<HTMLElement>('[data-demo-description]');
  const progress = root.querySelector<HTMLElement>('[data-demo-progress]');
  const announcement = root.querySelector<HTMLElement>('[data-demo-announcement]');
  if (!content || !next || !replay) return;
  let selected: AiDemoScenarioId = 'resident';
  let activeStep = 0;

  function render(announce = true): void {
    if (signal.aborted) return;
    const scenario = aiDemoScenarios[selected];
    root!.dataset.demoScenario = selected;
    root!.dataset.demoStep = String(activeStep);
    root!.dataset.demoTotal = String(scenario.steps.length);
    selectors.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.demoScenario === selected)));
    content!.innerHTML = renderAiDemoContent(selected, activeStep);
    if (description) description.textContent = scenario.description;
    if (progress) progress.textContent = `Step ${activeStep + 1} of ${scenario.steps.length}`;
    next!.disabled = activeStep === scenario.steps.length - 1;
    next!.innerHTML = next!.disabled ? `Scenario complete ${icon('check')}` : `Next step ${icon('arrow')}`;
    if (announce && announcement) announcement.textContent = `${scenario.name}. Step ${activeStep + 1} of ${scenario.steps.length}: ${scenario.steps[activeStep]!.title}. Scripted example only.`;
  }

  function select(id: AiDemoScenarioId): void {
    selected = id;
    activeStep = 0;
    render();
  }

  selectors.forEach(button => {
    button.addEventListener('click', () => select(button.dataset.demoScenario as AiDemoScenarioId), { signal });
    button.addEventListener('keydown', event => {
      const index = selectors.indexOf(button);
      let destination: number | undefined;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') destination = (index + 1) % selectors.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') destination = (index + selectors.length - 1) % selectors.length;
      else if (event.key === 'Home') destination = 0;
      else if (event.key === 'End') destination = selectors.length - 1;
      if (destination === undefined) return;
      event.preventDefault();
      const destinationButton = selectors[destination]!;
      select(destinationButton.dataset.demoScenario as AiDemoScenarioId);
      destinationButton.focus();
    }, { signal });
  });
  next.addEventListener('click', () => {
    if (activeStep >= aiDemoScenarios[selected].steps.length - 1) return;
    const nextHadFocus = document.activeElement === next;
    activeStep += 1;
    render();
    if (nextHadFocus && next.disabled) replay.focus({ preventScroll: true });
  }, { signal });
  replay.addEventListener('click', () => {
    activeStep = 0;
    render();
  }, { signal });
}