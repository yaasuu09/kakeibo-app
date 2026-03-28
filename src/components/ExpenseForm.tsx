"use client";

import { useState, useEffect } from "react";
import { getTodayJST, formatPayload, ExpenseFormData } from "@/lib/logic";
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
  const [success, setSuccess] = useState(false);
  
  const [categories, setCategories] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // GAS Web App URL provided by the user
  const endpointURL = "https://script.google.com/macros/s/AKfycbyqMMwjGFmRqwEN8AT_NJnIGPWCDOddlfSrCfFdxBy0dX5k2XI9hCIlXhNqxTHv4Qu3/exec";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPayer = localStorage.getItem("lastSelectedPayer");
      if (savedPayer === "泰孝" || savedPayer === "沙紀") {
        setFormData((prev) => ({ ...prev, payer: savedPayer }));
      }
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        // Append cache-buster to bypass aggressive mobile caching
        const fetchUrl = `${endpointURL}?t=${Date.now()}`;
        
        const res = await fetch(fetchUrl, {
          redirect: "follow", // Handle potential GAS 302 redirects
        });
        
        if (!res.ok) throw new Error("Failed to fetch options");
        
        const data = await res.json();
        if (data.categories) setCategories(data.categories);
        if (data.stores) setStores(data.stores);
      } catch (err) {
        // Silent FAIL SOFT: Do not alert the user. Assume manual input mode.
        console.warn("Options fetch failed smoothly, falling back to manual input:", err);
        setCategories([]);
        setStores([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [endpointURL]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.category) return;

    setIsSubmitting(true);
    setSuccess(false);

      try {
      const payload = formatPayload(formData);
      console.log("Ready to send payload:", payload);
      
      // Send the POST request to GAS
      const response = await fetch(endpointURL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "text/plain;charset=utf-8", // GAS requires text/plain for raw POST body
        },
      });

      if (!response.ok) {
        throw new Error("ネットワークエラーが発生しました");
      }
      
      // Reset form after successful submission
      setSuccess(true);
      
      // Store payload in a generic object for DOM inspection by browser agent
      if (typeof window !== "undefined") {
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
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      alert("エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto p-4 animate-in fade-in duration-500">
      
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
              localStorage.setItem("lastSelectedPayer", "泰孝");
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
              localStorage.setItem("lastSelectedPayer", "沙紀");
            }}
          >
            沙紀
          </Button>
        </div>
      </div>

      {/* Amount Keypad Style Input */}
      <div className="space-y-2">
        <Label htmlFor="amount">金額 (¥)</Label>
        <Input
          id="amount"
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={formData.amount === 0 ? "" : formData.amount}
          required
          onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
          className="text-4xl text-right font-bold h-20 placeholder:text-muted-foreground/50 rounded-2xl"
        />
      </div>

      {/* Category Dropdown */}
      <div className="space-y-2">
        <Label htmlFor="category">カテゴリ</Label>
        <Select required value={formData.category} onValueChange={(val: string | null) => setFormData({ ...formData, category: val || "" })} disabled={isLoading}>
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

      {/* Submit Button */}
      <Button 
        type="submit" 
        disabled={isSubmitting || !formData.amount || !formData.category}
        className={`w-full h-16 text-xl font-bold rounded-2xl mt-8 transition-all ${
          success ? "bg-green-600 hover:bg-green-700 text-white" : ""
        }`}
      >
        {isSubmitting ? "記録中..." : success ? "記録完了！" : "支出を記録する"}
      </Button>
      {/* Debug Payload for Testing */}
      {success && (
        <pre id="debug-payload" className="text-xs mt-4 p-4 bg-muted rounded overflow-auto">
          {JSON.stringify((typeof window !== 'undefined' ? (window as any).lastPayload : []), null, 2)}
        </pre>
      )}
    </form>
  );
}
