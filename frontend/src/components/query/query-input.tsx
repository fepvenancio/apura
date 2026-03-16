"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQueryStore } from "@/stores/query-store";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const suggestions = [
  "Vendas este m\u00eas",
  "Top 10 clientes",
  "Stock abaixo do m\u00ednimo",
  "Funcion\u00e1rios por departamento",
];

interface QueryInputProps {
  autoFocus?: boolean;
}

export function QueryInput({ autoFocus = false }: QueryInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentQuery = useQueryStore((s) => s.currentQuery);
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery);
  const executeQuery = useQueryStore((s) => s.executeQuery);
  const isExecuting = useQueryStore((s) => s.isExecuting);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    if (!currentQuery.trim() || isExecuting) return;
    executeQuery(currentQuery.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (text: string) => {
    setCurrentQuery(text);
    executeQuery(text);
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          "relative rounded-lg border bg-card transition-colors",
          isExecuting
            ? "border-primary/50"
            : "border-card-border focus-within:border-primary/70"
        )}
      >
        <textarea
          ref={textareaRef}
          value={currentQuery}
          onChange={(e) => setCurrentQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Fa\u00e7a uma pergunta sobre os seus dados..."
          disabled={isExecuting}
          rows={2}
          className="w-full resize-none rounded-lg bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between border-t border-card-border px-4 py-2.5">
          <span className="text-xs text-muted">
            Ctrl+Enter para enviar
          </span>
          <Button
            onClick={handleSubmit}
            disabled={!currentQuery.trim() || isExecuting}
            isLoading={isExecuting}
            size="sm"
          >
            <Search className="h-4 w-4" />
            Perguntar
          </Button>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => handleSuggestion(s)}
            disabled={isExecuting}
            className="rounded-full border border-card-border bg-card px-3 py-1.5 text-xs text-muted hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
