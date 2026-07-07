// src/app/catalog/loading.tsx
// Instant skeleton shown the moment a customer navigates to the catalog,
// while the server renders products. Makes the page feel immediate even
// on slow boat connections.
export default function CatalogLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-5">
        <div className="h-8 bg-gray-200 rounded w-56 mb-2 animate-pulse" />
        <div className="h-4 bg-gray-100 rounded w-72 animate-pulse" />
      </div>
      <div className="h-11 bg-gray-100 rounded-xl w-full sm:w-96 mb-5 animate-pulse" />
      <div className="h-12 bg-brand-navy/10 rounded-xl w-full mb-4 animate-pulse" />
      <div className="h-11 bg-gray-100 rounded-xl w-full mb-5 animate-pulse" />
      <div className="flex flex-col md:flex-row gap-5">
        <aside className="w-full md:w-52 shrink-0 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </aside>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card-base p-3 animate-pulse">
              <div className="h-24 bg-gray-100 rounded mb-2" />
              <div className="h-2.5 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-4/5 mb-1" />
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="flex justify-between items-center">
                <div className="h-5 bg-gray-200 rounded w-14" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
