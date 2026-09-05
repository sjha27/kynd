import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Button from '../ui/Button';

/*
 * The deliberate end of the feed. No infinite scroll, no Show more — V1
 * shows a finite set and then hands the visitor back to Discover.
 */
function CaughtUpFooter() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-start py-10">
      <p className="text-[17px] font-bold tracking-[-0.015em] text-ink">
        You&rsquo;re caught up with your community.
      </p>
      <p className="mt-2 text-[15px] text-ink-muted">Ready to get involved?</p>
      <Button className="mt-5" onClick={() => navigate('/discover')}>
        Discover opportunities
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export default CaughtUpFooter;
