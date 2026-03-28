import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search, X } from "lucide-react";

interface StoreComboboxProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  isLoading?: boolean;
}

export function StoreCombobox({ options, value, onChange, isLoading }: StoreComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()));

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch("");
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-14 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-lg shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value || (isLoading ? "読み込み中..." : "店舗を選択・入力")}
        </span>
        <ChevronDown className="h-5 w-5 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 duration-200">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-5 w-5 shrink-0 opacity-50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="店舗名を入力して検索..."
              className="flex h-14 w-full rounded-md bg-transparent py-3 text-lg outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="ml-2 p-1 text-muted-foreground hover:bg-accent rounded-full">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="max-h-[250px] overflow-y-auto p-1">
            {search && !options.includes(search) && (
              <button
                type="button"
                onClick={() => handleSelect(search)}
                className="relative flex w-full cursor-default select-none items-center rounded-sm py-3 px-2 text-lg outline-none hover:bg-accent hover:text-accent-foreground text-blue-600 font-medium"
              >
                「{search}」を新しく追加する
              </button>
            )}
            {filtered.length === 0 && !search && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                過去の店舗履歴がありません
              </div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleSelect(opt)}
                className={`relative flex w-full text-left cursor-default select-none items-center rounded-sm py-3 px-2 text-lg outline-none hover:bg-accent hover:text-accent-foreground ${
                  value === opt ? "bg-accent font-bold" : ""
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
