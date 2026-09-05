import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';

/*
 * Home has no feed yet, and inventing posts is off the table — so this is a
 * genuine first-run state rather than an explanation of a future feed.
 *
 * One confident surface, product voice, one obvious next action. The
 * previous version described the ranking sources as three cards, which read
 * as a roadmap rendered inside the UI.
 */
function Home() {
  const navigate = useNavigate();

  return (
    <PageContainer width="narrow">
      <h1 className="hidden text-[26px] font-bold tracking-[-0.02em] text-ink lg:block">Home</h1>

      <div className="flex flex-col items-start py-10 lg:py-16">
        <p className="text-[13px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
          Atlanta
        </p>
        <h2 className="mt-3 max-w-[15ch] text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-ink lg:text-[42px]">
          It&rsquo;s quiet here for now.
        </h2>
        <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-ink-muted">
          Follow people and organizations around the city, and this is where you&rsquo;ll see what
          they&rsquo;re part of &mdash; the cleanups, the food drives, the weekends that add up.
        </p>
        <Button className="mt-7" onClick={() => navigate('/discover')}>
          Find something to join
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </PageContainer>
  );
}

export default Home;
