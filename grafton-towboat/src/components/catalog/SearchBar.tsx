'use client';
// src/components/catalog/SearchBar.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchBarProps {
  initialSearch: string;
}

export function SearchBar({ initialSearch }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialSearch);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setValue(initialSearch); }, [initialSearch]);

  const doSearch = useCallback((term: string) => {
    setIsSearching(true);
    const params = new URLSearchParams(searchParams.toString());
    if (term) { params.set('search', term); } else { params.delete('search'); }
    params.delete('page');
    router.push(`/catalog?${params.toString()}`);
    setTimeout(() => setIsSearching(false), 500);
  }, [router, searchParams]);

  function handleChange(v: string) {
    setValue(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (v !== initialSearch) doSearch(v);
    }, 350);
  }

  function handleClear() {
    setValue('');
    clearTimeout(debounceRef.current);
    doSearch('');
  }

  return (
    <div className="relative max-w-2xl">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        {isSearching
          ? <Loader2 className="w-4 h-4 text-brand-river animate-spin" />
          : <Search className="w-4 h-4 text-gray-400" />
        }
      </div>
      <input
        type="search"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { clearTimeout(debounceRef.current); doSearch(value); } }}
        placeholder="Search groceries & supplies (beef, coffee, paper towels…)"
        className="input-base pl-11 pr-10 py-3.5 text-sm rounded-xl shadow-sm border-gray-200 focus:shadow-md transition-shadow"
        autoComplete="off"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
