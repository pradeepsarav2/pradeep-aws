import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Default to habits */}
          <Route path="/" element={<Navigate to="/habits" replace />} />

          {/* Section routes render the same Index page, which syncs tabs with the path */}
          <Route path="/habits" element={<Index />} />
          <Route path="/tasks" element={<Index />} />
          <Route path="/weight" element={<Index />} />
          {/* <Route path="/sleep" element={<Index />} /> */}
          {/* <Route path="/workout" element={<Index />} /> */}
          {/* <Route path="/journal" element={<Index />} /> */}

          <Route path="/auth" element={<Auth />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
