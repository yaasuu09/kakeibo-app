"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const endpointURL = "https://script.google.com/macros/s/AKfycbyqMMwjGFmRqwEN8AT_NJnIGPWCDOddlfSrCfFdxBy0dX5k2XI9hCIlXhNqxTHv4Qu3/exec";

export default function AnalysisPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");
  const [modelName, setModelName] = useState("gemma"); // Or gemma:4b / gemma2
  const [prompt, setPrompt] = useState("今月の無駄遣いはありませんか？来月に向けた節約のアドバイスをお願いします。");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function fetchExpenses() {
      setIsLoading(true);
      try {
        const res = await fetch(`${endpointURL}?action=getExpenses&t=${Date.now()}`, {
          redirect: "follow"
        });
        if (!res.ok) throw new Error("Failed to fetch expenses");
        const data = await res.json();
        if (data.expenses) {
          setExpenses(data.expenses);
        }
      } catch (err) {
        console.error("Fetch expenses error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchExpenses();
  }, []);

  const handleAnalyze = async () => {
    if (expenses.length === 0) {
      setErrorMsg("データがありません。");
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisResult("");
    setErrorMsg("");

    // Prepare context data (only last 100 to avoid context limits)
    const recentExpenses = expenses.slice(-100).map(e => `${e['日付']} - ${e['カテゴリ']} - ${e['店舗']} - ¥${e['金額']} (${e['立替者']})`).join("\n");
    
    const fullPrompt = `
あなたは優秀な家計簿アシスタントです。以下の最近の支出データをもとに、ユーザーの質問に答えてください。
回答は簡潔かつ具体的にお願いします。

【最近の支出データ】
${recentExpenses}

【質問】
${prompt}
`;

    try {
      const res = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          prompt: fullPrompt,
          stream: false,
        })
      });

      if (!res.ok) {
        throw new Error("Ollama APIとの通信に失敗しました。ローカルでOllamaが起動しているか確認してください。");
      }

      const data = await res.json();
      setAnalysisResult(data.response);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "エラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen pb-24">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">AI分析</h1>
        <p className="text-muted-foreground text-sm">ローカルGemmaを使った家計簿分析</p>
      </header>

      <div className="max-w-md mx-auto space-y-6 animate-in fade-in duration-500">
        
        <div className="bg-muted/50 p-4 rounded-2xl space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">取得済みデータ</span>
            <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded-full">
              {isLoading ? "読み込み中..." : `${expenses.length} 件`}
            </span>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="model">Ollama モデル名</Label>
            <Input 
              id="model" 
              value={modelName} 
              onChange={(e) => setModelName(e.target.value)}
              placeholder="gemma:4b" 
            />
            <p className="text-xs text-muted-foreground">※インストールされているGemmaモデル名を入力してください</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt">AIへの質問・指示</Label>
          <textarea
            id="prompt"
            className="flex min-h-[80px] w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={isAnalyzing || isLoading || expenses.length === 0}
          className="w-full h-14 text-lg font-bold rounded-2xl"
        >
          {isAnalyzing ? "AIが分析中..." : "データから分析する"}
        </Button>

        {errorMsg && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-2xl text-sm">
            {errorMsg}
          </div>
        )}

        {analysisResult && (
          <div className="p-5 bg-card border rounded-2xl shadow-sm space-y-3 mt-8">
            <h3 className="font-bold border-b pb-2">AIからの回答</h3>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {analysisResult}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
