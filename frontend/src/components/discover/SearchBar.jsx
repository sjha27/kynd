import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/*
 * Search is a controlled input with a short debounce so typing does not fire
 * a request per keystroke, but the URL still updates as you type (no submit
 * required). Submitting the form flushes immediately for anyone who presses
 * Enter.
 */
function SearchBar({ value, onChange, placeholder = 'Search opportunities, organizations, causes' }) {
  const [draft, setDraft] = useState(value ?? '');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep in sync when the URL changes from elsewhere (Clear all, back button).
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  useEffect(() => {
    if (draft === (value ?? '')) return undefined;
    const id = setTimeout(() => onChangeRef.current(draft), 250);
    return () => clearTimeout(id);
  }, [draft, value]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onChangeRef.current(draft);
      }}
      className="relative"
    >
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label="Search opportunities"
        className="h-12 w-full rounded-full border border-line bg-surface pl-11 pr-11 text-[15px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand [&::-webkit-search-cancel-button]:appearance-none"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChangeRef.current('');
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}

export default SearchBar;
