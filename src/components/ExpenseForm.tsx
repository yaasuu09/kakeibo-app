"use client";

import { useState, useEffect, useRef } from "react";
import {
  getTodayJST,
  formatPayload,
  ExpenseFormData,
  sendExpenseWithRetry,
  DRAFT_STORAGE_KEY,
} from "@/lib/logic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoreCombobox } from "@/components/StoreCombobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ExpenseForm() {
  const [formData, setFormData] = useState<ExpenseFormData>({
    date: getTodayJST(),
    payer: "泰孝",
    amount: 0,
    category: "",
    store: "",
    memo: "",
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  
  const [categories, setCategories] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isInitialized = useRef(false);

  // GAS Web App URL provided by the user
  const endpointURL = "https://script.google.com/macros/s/AKfycbyqMMwjGFmRqwEN8AT_NJnIGPWCDOddlfSrCfFdxBy0dX5k2XI9hCIlXhNqxTHv4Qu3/exec";

  // 1. Initial Mount: Restore draft if available, otherwise restore last selected payer
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed && typeof parsed === "object") {
            setFormData((prev) => ({
              ...prev,
              ...parsed,
              date: parsed.date || getTodayJST(),
            }));
            if (parsed.amount > 0 || parsed.category || parsed.store || parsed.memo) {
              setIsDraftRestored(true);
            }
          }
        } else {
          const savedPayer = localStorage.getItem("lastSelectedPayer");
          if (savedPayer === "泰孝" || savedPayer === "沙紀") {
            setFormData((prev) => ({ ...prev, payer: savedPayer }));
          }
        }
      } catch (e) {
        console.warn("Failed to load draft from localStorage", e);
      } finally {
        isInitialized.current = true;
      }
    }
  }, []);

  // 2. Real-time Draft Auto-Save: Persist to localStorage whenever formData changes
  useEffect(() => {
    if (!isInitialized.current || typeof window === "undefined") return;

    try {
      const hasContent = formData.amount > 0 || formData.category || formData.store || formData.memo;
      if (hasContent) {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch (e) {
      console.warn("Failed to save draft to localStorage", e);
    }
  }, [formData]);

  // 3. Fetch categories and stores from GAS Master
  useEffect(() => {
    async function fetchData() {
      try {
        const fetchUrl = `${endpointURL}?t=${Date.now()}`;
        const res = await fetch(fetchUrl, {
          redirect: "follow",
        });
        
        if (!res.ok) throw new Error("Failed to fetch options");
        
        const data = await res.json();
        if (data.categories) setCategories(data.categories);
        if (data.stores) setStores(data.stores);
      } catch (err) {
        console.warn("Options fetch failed smoothly, falling back to manual input:", err);
        setCategories([]);
        setStores([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [endpointURL]);

  // Clear draft and reset form
  const handleClearDraft = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    setIsDraftRestored(false);
    setErrorMessage(null);
    setFormData((prev) => ({
      date: getTodayJST(),
      payer: prev.payer,
      amount: 0,
      category: "",
      store: "",
      memo: "",
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.amount || !formData.category) return;

    setIsSubmitting(true);
    setRetryStatus(null);
    setErrorMessage(null);
    setSuccess(false);

    try {
      const payload = formatPayload(formData);
      console.log("Sending payload:", payload);
      
      // Resilient exponential backoff retry
      await sendExpenseWithRetry(
        endpointURL,
        payload,
        3,
        (attempt) => {
          setRetryStatus(`通信が不安定なため自動再試行中 (${attempt}/3)...`);
        }
      );
      
      // Successfully submitted! Clear draft & reset form
      setSuccess(true);
      setIsDraftRestored(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        (window as any).lastPayload = payload;
      }

      setFormData((prev) => ({
        date: getTodayJST(),
        payer: prev.payer, // persist current payer
        amount: 0,
        category: "",
        store: "",
        memo: "",
      }));
      
      setTimeout(() => setSuccess(false), 3500);
    } catch (error: any) {
      console.error("Submission failed:", error);
      // Keep all form data intact in state and localStorage
      setErrorMessage(
        error.message || "送信に失敗しました。入力内容は保持されていますので、電波の良い場所で再度お試しください。"
      );
    } finally {
      setIsSubmitting(false);
      setRetryStatus(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto p-4 animate-in fade-in duration-500">
      
      {/* Draft Restored Notification Banner */}
      {isDraftRestored && (
        <div className="flex items-center justify-between p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-900 dark:text-amber-200 text-sm shadow-sm animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <span>📝</span>
            <span>前回の未送信内容を復元しました</span>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="text-xs font-bold underline hover:opacity-75 ml-2 cursor-pointer text-amber-800 dark:text-amber-300"
          >
            クリア
          </button>
        </div>
      )}

      {/* Error Message & Inline Retry Card */}
      {errorMessage && (
        <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-2xl space-y-3 text-destructive shadow-sm animate-in fade-in">
          <div className="flex items-start gap-2">
            <span className="text-xl">⚠️</span>
            <div className="text-sm flex-1 font-medium leading-relaxed">
              {errorMessage}
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="w-full font-bold h-11 rounded-xl shadow transition-transform active:scale-[0.98]"
          >
            {isSubmitting ? (retryStatus || "再送信中...") : "🔄 もう一度送信する"}
          </Button>
        </div>
      )}

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="date">日付</Label>
        <Input
          id="date"
          type="date"
          value={formData.date}
          required
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          className="text-lg py-6"
        />
      </div>

      {/* Payer Toggle */}
      <div className="space-y-2">
        <Label>立替者</Label>
        <div className="grid grid-cols-2 gap-4">
          <Button
            type="button"
            variant={formData.payer === "泰孝" ? "default" : "outline"}
            className="h-16 text-xl font-bold rounded-2xl transition-all"
            onClick={() => {
              setFormData({ ...formData, payer: "泰孝" });
              if (typeof window !== "undefined") {
                localStorage.setItem("lastSelectedPayer", "泰孝");
              }
            }}
          >
            泰孝
          </Button>
          <Button
            type="button"
            variant={formData.payer === "沙紀" ? "default" : "outline"}
            className="h-16 text-xl font-bold rounded-2xl transition-all"
            onClick={() => {
              setFormData({ ...formData, payer: "沙紀" });
              if (typeof window !== "undefined") {
                localStorage.setItem("lastSelectedPayer", "沙紀");
              }
            }}
          >
            沙紀
          </Button>
        </div>
      </div>

      {/* Amount Keypad Style Input */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="amount">金額 (¥)</Label>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            下書き自動保存
          </span>
        </div>
        <Input
          id="amount"
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={formData.amount === 0 ? "" : formData.amount}
          required
          onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
          className="text-4xl text-right font-bold h-20 placeholder:text-muted-foreground/50 rounded-2xl shadow-inner"
        />
      </div>

      {/* Category Dropdown */}
      <div className="space-y-2">
        <Label htmlFor="category">カテゴリ</Label>
        <Select
          required
          value={formData.category}
          onValueChange={(val: string | null) => setFormData({ ...formData, category: val || "" })}
          disabled={isLoading}
        >
          <SelectTrigger className="h-14 text-lg">
            <SelectValue placeholder={isLoading ? "読み込み中..." : "カテゴリを選択"} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-lg py-3">
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Store */}
      <div className="space-y-2">
        <Label htmlFor="store">購入先 / 店名</Label>
        <StoreCombobox
          options={stores}
          value={formData.store || ""}
          onChange={(val) => setFormData({ ...formData, store: val })}
          isLoading={isLoading}
        />
      </div>

      {/* Memo */}
      <div className="space-y-2">
        <Label htmlFor="memo">備考 (任意)</Label>
        <Input
          id="memo"
          type="text"
          placeholder="補足情報など"
          value={formData.memo || ""}
          onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
          className="text-lg h-14"
        />
      </div>

      {/* Retry Progress Indicator (when retrying) */}
      {retryStatus && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-primary text-sm font-medium text-center animate-pulse">
          {retryStatus}
        </div>
      )}

      {/* Submit Button */}
      <Button 
        type="submit" 
        disabled={isSubmitting || !formData.amount || !formData.category}
        className={`w-full h-16 text-xl font-bold rounded-2xl mt-8 transition-all shadow-md ${
          success ? "bg-green-600 hover:bg-green-700 text-white" : ""
        }`}
      >
        {isSubmitting
          ? (retryStatus ? "再試行中..." : "記録中...")
          : success
          ? "記録完了！🎉"
          : "支出を記録する"}
      </Button>

      {/* Clear/Reset Draft Link */}
      {(formData.amount > 0 || formData.category || formData.store || formData.memo) && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={handleClearDraft}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            入力内容をリセット
          </button>
        </div>
      )}

      {/* Debug Payload for Testing */}
      {success && (
        <pre id="debug-payload" className="text-xs mt-4 p-4 bg-muted rounded overflow-auto">
          {JSON.stringify((typeof window !== 'undefined' ? (window as any).lastPayload : []), null, 2)}
        </pre>
      )}
    </form>
  );
}
