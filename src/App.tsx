import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Component, ErrorInfo, ReactNode, useState, useEffect, Suspense, lazy } from "react";
import { supabase, type DbLevel } from "@/lib/supabaseClient";
import Index from "./pages/Index";
import Crm from "./pages/Crm";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const PlayV2 = lazy(() => import("./pages/PlayV2"));
const PlayLegacy = lazy(() => import("./pages/PlayLegacy"));
const AlgorithmsLab = lazy(() => import("./pages/AlgorithmsLab"));

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('🔥 ErrorBoundary caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔥 ErrorBoundary componentDidCatch:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'monospace', color: 'red' }}>
          <h1>🚨 Something went wrong</h1>
          {import.meta.env.DEV ? (
            <>
              <p><strong>Error:</strong> {this.state.error?.message}</p>
              <pre>{this.state.error?.stack}</pre>
            </>
          ) : (
            <p>Please refresh the page. If the problem persists, contact support.</p>
          )}
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

devLog('📦 App.tsx loading...');

const App = () => {
  devLog('⚛️ App component rendering...');

  const [dbLevels, setDbLevels] = useState<DbLevel[]>([]);

  useEffect(() => {
    async function getLevels() {
      if (!supabase) return;
      const { data: levels } = await supabase.from('levels').select();
      if (levels) {
        setDbLevels(levels as DbLevel[]);
        devLog(`[supabase] ${levels.length} levels loaded from DB`);
        if (import.meta.env.DEV) {
          // Expose on window for debug access in the browser console.
          (window as Window & { dbLevels?: DbLevel[] }).dbLevels = levels as DbLevel[];
        }
      }
    }
    getLevels();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route
                path="/play-v2"
                element={
                  <Suspense fallback={<div className="flex h-screen items-center justify-center text-stone-50">Loading V2…</div>}>
                    <PlayV2 />
                  </Suspense>
                }
              />
              <Route
                path="/play-legacy"
                element={
                  <Suspense fallback={<div className="flex h-screen items-center justify-center text-stone-50">Loading Legacy…</div>}>
                    <PlayLegacy />
                  </Suspense>
                }
              />
              <Route path="/mapper" element={<Index />} />
              <Route path="/crm" element={<Crm />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/algorithms"
                element={
                  <Suspense fallback={<div className="flex h-screen items-center justify-center text-stone-50">Loading Algorithms Lab…</div>}>
                    <AlgorithmsLab />
                  </Suspense>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

devLog('✅ App.tsx loaded');

export default App;
