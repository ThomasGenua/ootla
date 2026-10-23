import { icon } from './ui';

type OnboardingPath = 'yardi' | 'standalone';

export function onboardingContent(path: OnboardingPath): string {
  const yardi = path === 'yardi';
  const steps = yardi
    ? [['Confirm licensed interfaces', 'Confirm licensed interfaces and available fields. The client’s exact interfaces are not yet known.'], ['Agree access and ownership', 'Agree permissions. Yardi owns configured property, lease, resident and accounting records.'], ['Map, review, then activate', 'Keep properties and units separate. Test mappings; staff review before activation.']]
    : [['Review existing history', 'Choose records you are authorized to import. No Yardi required.'], ['Map records and relationships', 'Separate properties and units. Map contacts and history; review duplicates.'], ['Confirm with staff', 'Review gaps, access and ownership before import. Nothing uploads here.']];
  return `<div class="ig-onboarding-copy"><span class="ig-path-kicker">ILLUSTRATIVE ONBOARDING PATH</span><h3>${yardi ? 'Yardi-connected path' : 'Standalone path'}</h3><ol>${steps.map(([title,copy],i)=>`<li><span aria-hidden="true">0${i+1}</span><div><h4>${title}</h4><p>${copy}</p></div></li>`).join('')}</ol></div><aside class="ig-path-summary" aria-label="${yardi ? 'Yardi-connected' : 'Standalone'} example boundaries"><span>${icon(yardi ? 'building' : 'import')}</span><h4>${yardi ? 'Start with the source system.' : 'Start with your existing history.'}</h4><dl><div><dt>${yardi ? 'Source of configured records' : 'Data starting point'}</dt><dd>${yardi ? 'Yardi' : 'Existing customer records'}</dd></div><div><dt>Activation</dt><dd>${yardi ? 'Awaiting interfaces, permissions and configuration' : 'Awaiting mapping and staff import review'}</dd></div><div><dt>Real organization</dt><dd>Unchanged by this selector</dd></div></dl><p>No connection or import runs here.</p></aside>`;
}

export function initializeOnboardingDemo(signal: AbortSignal): void {
  const root = document.querySelector<HTMLElement>('[data-onboarding-demo]');
  const panel = root?.querySelector<HTMLElement>('[data-onboarding-content]');
  const status = root?.querySelector<HTMLElement>('[data-onboarding-status]');
  const buttons = [...root?.querySelectorAll<HTMLButtonElement>('button[data-onboarding-path]') ?? []];
  if (!root || !panel || signal.aborted) return;
  function select(path: OnboardingPath): void {
    if (signal.aborted) return;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.onboardingPath === path)));
    panel!.innerHTML = onboardingContent(path);
    if (status) status.textContent = `${path === 'yardi' ? 'Yardi-connected' : 'Standalone'} onboarding example selected. Your organization is unchanged.`;
  }
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.onboardingPath as OnboardingPath), { signal });
    button.addEventListener('keydown', event => {
      let destination: number;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') destination = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') destination = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') destination = 0;
      else if (event.key === 'End') destination = buttons.length - 1;
      else return;
      event.preventDefault();
      const target = buttons[destination]!;
      select(target.dataset.onboardingPath as OnboardingPath);
      target.focus();
    }, { signal });
  });
}