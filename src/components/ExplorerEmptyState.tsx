interface ExplorerEmptyStateProps {
  onClearFilters: () => void;
}

export function ExplorerEmptyState({ onClearFilters }: ExplorerEmptyStateProps) {
  return (
    <div
      data-testid="explorer-empty-state"
      className="rounded-2xl border border-[#402818]/12 bg-[#FAE8D7]/60 px-6 py-10 text-center"
    >
      <p className="font-newsreader text-[1.25rem] font-semibold text-[#402818]">
        No matching problems found.
      </p>
      <p className="font-dm-sans mx-auto mt-1.5 max-w-md text-[0.875rem] leading-relaxed text-[#705848]">
        Try another search or adjust your filters.
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className="font-dm-sans mt-5 inline-flex cursor-pointer items-center justify-center rounded-full bg-[#402818] px-5 py-2.5 text-[0.84375rem] font-semibold text-white transition-colors duration-150 hover:bg-[#2F1B13] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818]"
      >
        Clear filters
      </button>
    </div>
  );
}
