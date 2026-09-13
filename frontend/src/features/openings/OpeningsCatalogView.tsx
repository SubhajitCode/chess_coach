import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchOpeningsCatalog, fetchOpeningsList, fetchProgress } from '../../api/openings'
import type { OpeningCategory, OpeningProgress, OpeningEntry } from '../../types/openings'
import CategorySection from './components/CategorySection'
import OpeningRow from './components/OpeningRow'

type ViewMode = 'list' | 'categories'

const POPULAR_SEARCH_TAGS = [
  'Sicilian',
  'Italian',
  'Ruy Lopez',
  "Queen's Gambit",
  'French',
  'Caro-Kann',
  "King's Indian",
  'London',
]

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'kings_pawn', label: "King's Pawn: Open Games (1.e4 e5)" },
  { value: 'sicilian', label: 'Sicilian Defense (1.e4 c5)' },
  { value: 'semi_open', label: 'Semi-Open (French, Caro-Kann, Pirc)' },
  { value: 'queens_pawn', label: "Queen's Pawn (1.d4 d5)" },
  { value: 'indian', label: 'Indian Defenses (1.d4 Nf6)' },
  { value: 'flank', label: 'Flank Openings (English, Reti, Bird)' },
]

const SORT_OPTIONS = [
  { value: 'relevance:asc', label: 'Relevance / Popularity' },
  { value: 'name:asc', label: 'Name (A → Z)' },
  { value: 'name:desc', label: 'Name (Z → A)' },
  { value: 'eco:asc', label: 'ECO Code (A → Z)' },
  { value: 'move_count:asc', label: 'Move Count (Shortest first)' },
  { value: 'move_count:desc', label: 'Move Count (Longest first)' },
]

export default function OpeningsCatalogView() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [categories, setCategories] = useState<OpeningCategory[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, OpeningProgress>>({})

  // Search, Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sideFilter, setSideFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'curated'>('all')
  const [sortSetting, setSortSetting] = useState('relevance:asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // List API state
  const [listItems, setListItems] = useState<OpeningEntry[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isListLoading, setIsListLoading] = useState(false)
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Load Categories & Progress initially
  useEffect(() => {
    async function loadCatalog() {
      try {
        setIsCatalogLoading(true)
        const [catalogRes, progressRes] = await Promise.all([
          fetchOpeningsCatalog(),
          fetchProgress().catch(() => ({ progress: [] })),
        ])

        setCategories(catalogRes.categories || [])

        const pMap: Record<string, OpeningProgress> = {}
        if (progressRes.progress) {
          progressRes.progress.forEach((p: OpeningProgress) => {
            pMap[`${p.eco}-${p.opening_name}`] = p
          })
        }
        setProgressMap(pMap)
      } catch (err) {
        console.error('Failed to load initial openings data:', err)
      } finally {
        setIsCatalogLoading(false)
      }
    }

    loadCatalog()
  }, [])

  // Fetch paginated list
  const loadOpeningsList = useCallback(async () => {
    setIsListLoading(true)
    setError(null)
    const [sort_by, sort_order] = sortSetting.split(':')

    try {
      const res = await fetchOpeningsList({
        q: searchQuery,
        category: categoryFilter,
        side: sideFilter,
        scope: scopeFilter,
        sort_by,
        sort_order,
        page: currentPage,
        page_size: pageSize,
      })

      setListItems(res.items || [])
      setTotalItems(res.total || 0)
      setTotalPages(res.total_pages || 1)
    } catch (err) {
      console.error('Failed to fetch paginated openings:', err)
      setError('Could not fetch openings list. Please try again.')
    } finally {
      setIsListLoading(false)
    }
  }, [searchQuery, categoryFilter, sideFilter, scopeFilter, sortSetting, currentPage, pageSize])

  // Trigger search with debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      loadOpeningsList()
    }, 250)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [loadOpeningsList])

  // Reset page to 1 when filters change
  const handleQueryChange = (val: string) => {
    setSearchQuery(val)
    setCurrentPage(1)
  }

  const handleCategoryChange = (val: string) => {
    setCategoryFilter(val)
    setCurrentPage(1)
  }

  const handleSideChange = (val: string) => {
    setSideFilter(val)
    setCurrentPage(1)
  }

  const handleScopeChange = (val: 'all' | 'curated') => {
    setScopeFilter(val)
    setCurrentPage(1)
  }

  const handleSortChange = (val: string) => {
    setSortSetting(val)
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setSearchQuery('')
    setCategoryFilter('')
    setSideFilter('')
    setScopeFilter('all')
    setSortSetting('relevance:asc')
    setCurrentPage(1)
  }

  // Filter categories for Category View
  const filteredCategories = categories.map((cat) => ({
    ...cat,
    openings: cat.openings.filter((op: OpeningEntry) => {
      const q = searchQuery.toLowerCase()
      const matchesSearch = !q || op.name.toLowerCase().includes(q) || op.eco.toLowerCase().includes(q)
      const matchesSide = !sideFilter || op.side === sideFilter
      return matchesSearch && matchesSide
    }),
  })).filter((cat) => cat.openings.length > 0)

  const activeFiltersCount =
    (searchQuery ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (sideFilter ? 1 : 0) +
    (scopeFilter === 'curated' ? 1 : 0)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <header className="bg-gray-900/90 rounded-2xl p-5 sm:p-7 border border-gray-800/80 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">♟</span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Opening Trainer & Explorer
              </h1>
            </div>
            <p className="text-gray-400 text-sm sm:text-base mt-1.5">
              Learn, test, and master chess openings through move-by-move spaced repetition practice
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>←</span> Dashboard
            </Link>
          </div>
        </header>

        {error && (
          <div className="bg-red-950/60 border border-red-800 text-red-200 p-4 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={loadOpeningsList}
              className="text-xs bg-red-800 hover:bg-red-700 px-3 py-1 rounded-lg underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* View Mode & Scope Switcher Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/60 border border-gray-800/80 rounded-xl p-3">
          <div className="flex items-center gap-1.5 bg-gray-950/80 p-1 rounded-lg border border-gray-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>📋</span> Paginated List ({totalItems.toLocaleString()})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('categories')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'categories'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>🗂</span> Curated Categories
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">Scope:</span>
            <div className="flex bg-gray-950/80 p-1 rounded-lg border border-gray-800 text-xs">
              <button
                type="button"
                onClick={() => handleScopeChange('all')}
                className={`px-3 py-1 rounded-md transition-all ${
                  scopeFilter === 'all'
                    ? 'bg-gray-800 text-white font-medium shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                All (3,800+)
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange('curated')}
                className={`px-3 py-1 rounded-md transition-all ${
                  scopeFilter === 'curated'
                    ? 'bg-gray-800 text-white font-medium shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Curated (40+)
              </button>
            </div>
          </div>
        </div>

        {/* Search & Filter Panel */}
        <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
          {/* Main Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by opening name, ECO code, or variation (e.g., 'Sicilian', 'Najdorf', 'B20', 'Italian')..."
              value={searchQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="w-full bg-gray-950/90 border border-gray-700/80 text-gray-100 placeholder-gray-500 rounded-xl py-3 pl-11 pr-10 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
            />
            <span className="absolute left-4 top-3.5 text-gray-400 text-base pointer-events-none">
              🔍
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleQueryChange('')}
                className="absolute right-3.5 top-3 text-gray-400 hover:text-white p-0.5 rounded-full hover:bg-gray-800 transition-colors"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Tags */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-gray-500 flex-shrink-0">Popular:</span>
            {POPULAR_SEARCH_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleQueryChange(tag)}
                className={`px-2.5 py-1 rounded-lg border flex-shrink-0 transition-all ${
                  searchQuery.toLowerCase() === tag.toLowerCase()
                    ? 'bg-blue-900/50 border-blue-500 text-blue-200'
                    : 'bg-gray-800/60 border-gray-700/60 text-gray-300 hover:bg-gray-700/60 hover:text-white'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Filter Bar: Category, Side, Sort, Page Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-gray-800/80">
            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full bg-gray-950/90 border border-gray-700/80 text-gray-200 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-blue-500"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Side */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Train As</label>
              <select
                value={sideFilter}
                onChange={(e) => handleSideChange(e.target.value)}
                className="w-full bg-gray-950/90 border border-gray-700/80 text-gray-200 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Sides</option>
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </div>

            {/* Order / Sort */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Order By</label>
              <select
                value={sortSetting}
                onChange={(e) => handleSortChange(e.target.value)}
                className="w-full bg-gray-950/90 border border-gray-700/80 text-gray-200 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-blue-500"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Items Per Page & Reset */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-400 mb-1">Per Page</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="w-full bg-gray-950/90 border border-gray-700/80 text-gray-200 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-3 py-2 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl transition-colors h-[34px] flex-shrink-0"
                  title="Reset all filters"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Section: List View vs Category View */}
        {viewMode === 'list' ? (
          <div className="space-y-4">
            {/* List Status / Pagination Summary Header */}
            <div className="flex items-center justify-between text-xs text-gray-400 px-1">
              <span>
                Showing {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
                {Math.min(currentPage * pageSize, totalItems)} of {totalItems.toLocaleString()} openings
                {searchQuery ? ` matching "${searchQuery}"` : ''}
              </span>
              {totalPages > 1 && (
                <span>
                  Page {currentPage} of {totalPages}
                </span>
              )}
            </div>

            {/* Loading Indicator */}
            {isListLoading ? (
              <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p>Loading openings...</p>
              </div>
            ) : listItems.length > 0 ? (
              <div className="space-y-2.5">
                {listItems.map((opening) => (
                  <OpeningRow
                    key={`${opening.eco}-${opening.name}-${opening.move_count}`}
                    opening={opening}
                    progress={progressMap[`${opening.eco}-${opening.name}`]}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-12 text-center space-y-3">
                <div className="text-4xl">♟</div>
                <h3 className="text-lg font-semibold text-gray-200">No openings found</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto">
                  No chess openings matched your current filter criteria. Try clearing search keywords or switching category filters.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                  {scopeFilter === 'curated' && (
                    <button
                      type="button"
                      onClick={() => handleScopeChange('all')}
                      className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors inline-block"
                    >
                      Search in All 3,800+ Openings
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-4 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-xl transition-colors inline-block"
                  >
                    Reset All Filters
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Pagination Controls */}
            {totalPages > 1 && !isListLoading && (
              <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-800/80 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    className="px-3 py-1.5 text-xs bg-gray-900 border border-gray-800 text-gray-300 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 text-xs bg-gray-900 border border-gray-800 text-gray-300 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Prev
                  </button>
                </div>

                {/* Page Number Pills */}
                <div className="flex items-center gap-1 overflow-x-auto max-w-md no-scrollbar">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      return (
                        p === 1 ||
                        p === totalPages ||
                        Math.abs(p - currentPage) <= 2
                      )
                    })
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1]
                      const showEllipsis = prev && p - prev > 1
                      return (
                        <div key={p} className="flex items-center">
                          {showEllipsis && (
                            <span className="text-gray-600 px-1 text-xs">...</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p)}
                            className={`w-8 h-8 text-xs font-semibold rounded-lg transition-all ${
                              p === currentPage
                                ? 'bg-blue-600 text-white shadow'
                                : 'bg-gray-900 border border-gray-800 text-gray-300 hover:bg-gray-800'
                            }`}
                          >
                            {p}
                          </button>
                        </div>
                      )
                    })}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 text-xs bg-gray-900 border border-gray-800 text-gray-300 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="px-3 py-1.5 text-xs bg-gray-900 border border-gray-800 text-gray-300 rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Last »
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Category View */
          <div className="space-y-4">
            {isCatalogLoading ? (
              <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-12 text-center text-gray-400">
                Loading categories...
              </div>
            ) : filteredCategories.length > 0 ? (
              filteredCategories.map((category) => (
                <CategorySection
                  key={category.name}
                  category={category}
                  progressMap={progressMap}
                  forceExpanded={Boolean(searchQuery.trim())}
                />
              ))
            ) : (
              <div className="text-center py-12 text-gray-500 bg-gray-900/30 rounded-xl border border-gray-800 space-y-3">
                <p>No openings found matching "{searchQuery}" in curated categories.</p>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-xl"
                >
                  Search in All 3,800+ Openings
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
