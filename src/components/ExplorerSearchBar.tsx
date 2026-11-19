import type { FormEvent } from 'react';
import { Search, X } from 'lucide-react';

interface ExplorerSearchBarProps {
  query: string;
  onQueryChange: (nextValue: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}

export function ExplorerSearchBar({
  query,
  onQueryChange,
  onSubmit,
  onClear,
}: ExplorerSearchBarProps) {
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      role="search"
      aria-label="Search Problem Explorer directory"
      className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
    >
      <div className="relative flex flex-1 items-center">
        <Search
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 text-[#705848] sm:left-4"
        />
        <input
          id="explorer-search-input"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search problems, categories or challenges..."
          aria-label="Search problems, categories or challenges"
          className="font-dm-sans h-12 w-full rounded-full border border-[#402818]/15 bg-[#FFF9F3] pr-8 pl-9 text-[0.78125rem] text-[#402818] placeholder:text-[#705848]/75 focus:border-[#402818]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C65A1B]/30 sm:pr-10 sm:pl-11 sm:text-[0.9375rem]"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search query"
            className="absolute right-3 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[#705848] transition-colors duration-150 hover:bg-[#402818]/8 hover:text-[#402818] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
          >
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      <button
        type="submit"
        className="font-dm-sans inline-flex h-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#402818] px-7 text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
      >
        Search
      </button>
    </form>
  );
}
