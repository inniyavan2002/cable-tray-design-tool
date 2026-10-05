import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { APP_HREF } from '../data';
import { ARROW, Button, TrayMark, Wrap } from './ui';

export const NAV: ReadonlyArray<[string, string]> = [
  ['#features', 'Features'],
  ['#showcase', 'Showcase'],
  ['#workflow', 'Workflow'],
  ['#method', 'Method'],
  ['#catalogues', 'Catalogues'],
  ['#contact', 'Contact'],
];

/** How far the page scrolls while the header turns from clear to frosted glass. */
const FADE_PX = 90;

/** The section whose area crosses the middle of the screen, from the sections in the page. */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(`#${entry.target.id}`);
      },
      // A thin band just above the middle of the screen: one section crosses it at a time.
      { rootMargin: '-45% 0px -54% 0px' },
    );
    document.querySelectorAll('main > section[id]').forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return active;
}

/**
 * Clear over the hero; frosted glass that thickens smoothly as the page
 * scrolls under it. Its height never changes.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const active = useActiveSection();
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12));
  const backgroundColor = useTransform(scrollY, [0, FADE_PX], ['rgba(8, 17, 32, 0)', 'rgba(8, 17, 32, 0.72)']);
  const backdropFilter = useTransform(scrollY, [0, FADE_PX], ['blur(0px) saturate(100%)', 'blur(18px) saturate(150%)']);
  const borderColor = useTransform(scrollY, [0, FADE_PX], ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.07)']);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // An open menu needs a solid bar behind it, whatever the scroll.
  const glass = open
    ? { backgroundColor: 'rgba(8, 17, 32, 0.92)', backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)', borderColor: 'rgba(255, 255, 255, 0.07)' }
    : { backgroundColor, backdropFilter, WebkitBackdropFilter: backdropFilter, borderColor };
  const link =
    "relative rounded-md px-2.5 py-1.5 text-[14.5px] text-ink-2 no-underline hover:text-ink data-[active]:text-ink data-[active]:[text-shadow:0_0_14px_rgba(124,176,255,0.6)] motion-safe:transition-[color,text-shadow] motion-safe:duration-300 after:absolute after:inset-x-2.5 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-accent-ink after:content-[''] hover:after:scale-x-100 focus-visible:after:scale-x-100 data-[active]:after:scale-x-100 data-[active]:after:bg-energy data-[active]:after:shadow-[0_0_8px_var(--energy)] motion-safe:after:transition-transform motion-safe:after:duration-300";

  return (
    <motion.header
      data-scrolled={scrolled || open || undefined}
      className="site-header fixed inset-x-0 top-0 z-40 border-b pt-[env(safe-area-inset-top,0px)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={glass}
    >
      <Wrap className="flex h-[68px] items-center gap-6">
        <a href="#top" className="inline-flex items-center gap-2.5 font-cond text-lg font-semibold whitespace-nowrap text-ink no-underline">
          <TrayMark />
          Cable Tray Design
        </a>
        <nav aria-label="Sections" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map(([href, text]) => (
              <li key={href}>
                <a href={href} className={link} data-active={active === href || undefined} aria-current={active === href ? 'true' : undefined}>
                  {text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <span className="hidden lg:block">
          <Button primary href={APP_HREF} className="px-4 py-2.5 text-[14.5px]">
            Open the app <ArrowUpRight className={`h-4 w-4 ${ARROW.upRight}`} aria-hidden="true" />
          </Button>
        </span>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line-3/70 bg-white/[0.03] px-3 py-2 font-mono text-[13px] font-semibold text-ink lg:hidden"
        >
          {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          Menu
        </button>
      </Wrap>
      <AnimatePresence initial={false}>
        {open && (
          <motion.nav
            id="site-menu"
            aria-label="Sections"
            className="overflow-hidden border-t border-white/[0.07] lg:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setOpen(false);
            }}
          >
            <Wrap className="grid gap-1 pt-2 pb-5">
              <ul className="grid">
                {NAV.map(([href, text]) => (
                  <li key={href} className="border-b border-white/[0.06]">
                    <a
                      href={href}
                      data-active={active === href || undefined}
                      aria-current={active === href ? 'true' : undefined}
                      className="block py-3 text-[16px] text-ink no-underline data-[active]:text-accent-ink"
                    >
                      {text}
                    </a>
                  </li>
                ))}
              </ul>
              <Button primary href={APP_HREF} className="mt-3">
                Open the app <ArrowUpRight className={`h-4 w-4 ${ARROW.upRight}`} aria-hidden="true" />
              </Button>
            </Wrap>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
