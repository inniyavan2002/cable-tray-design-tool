import { Catalogues, Download, Method, Questions } from './Content';
import { Contact } from './Contact';
import { Features } from './Features';
import { Footer } from './Footer';
import { Header } from './Header';
import { Hero } from './Hero';
import { useStill } from './loop';
import { Metrics } from './Metrics';
import { Screens } from './Screens';
import { PageSheet } from './sheet/PageSheet';
import { Showcase } from './Showcase';
import { Workflow } from './Workflow';

export function Site() {
  // Switching motion draws the hero afresh: it plays its build-up, or is complete and still at once.
  // So do the sections that reveal themselves on scroll, as each sets its reveal up when it is drawn:
  // switched later, they would stay covered or hidden. They hold no state of the reader's to lose.
  const still = useStill();
  const drawn = still ? 'still' : 'moving';
  return (
    <>
      <a href="#main" className="absolute -top-16 left-4 z-50 rounded-lg bg-accent-strong px-3.5 py-2 font-semibold text-white focus:top-3">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="relative isolate focus:outline-none">
        <Hero key={`hero-${drawn}`} />
        {/* Below the hero, the page sits on one drawing sheet. The sections stay the main's own children: the header follows them there. */}
        <PageSheet />
        <Metrics />
        <Features key={`features-${drawn}`} />
        <Showcase />
        <Workflow />
        <Screens />
        <Method key={`method-${drawn}`} />
        <Catalogues key={`catalogues-${drawn}`} />
        <Download />
        <Contact />
        <Questions />
      </main>
      <Footer />
    </>
  );
}
