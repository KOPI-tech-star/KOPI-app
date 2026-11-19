import type { QuickExploreCategory } from '../config/opportunityRadar';

export const EXPLORER_CATEGORIES: readonly QuickExploreCategory[] = [
  'All',
  'Daily Life',
  'Education',
  'Health',
  'Sustainability',
  'AI & Tech',
] as const;

interface ExplorerFilterChipsProps {
  activeCategory: QuickExploreCategory;
  onSelectCategory: (category: QuickExploreCategory) => void;
}

export function ExplorerFilterChips({
  activeCategory,
  onSelectCategory,
}: ExplorerFilterChipsProps) {
  return (
    <div
      role="group"
      aria-label="Filter problems by category"
      className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap"
    >
      {EXPLORER_CATEGORIES.map((category) => {
        const isSelected = activeCategory === category;
        return (
          <button
            key={category}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectCategory(category)}
            className={`font-dm-sans shrink-0 cursor-pointer rounded-full border px-4 py-2 text-[0.84375rem] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#402818] ${
              isSelected
                ? 'border-[#402818] bg-[#402818] text-white'
                : 'border-[#402818]/14 bg-[#FAE8D7]/80 text-[#402818] hover:bg-[#F3DFCA]'
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
