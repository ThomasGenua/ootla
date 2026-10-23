/** Public contact details must be supplied by the project owner. Never guess an address. */
export function publicContact(): { href: string; label: string } | null {
  return { href: 'mailto:hello@ootla.ai', label: 'Contact us' };
}