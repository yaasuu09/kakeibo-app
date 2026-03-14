import { ExpenseForm } from "@/components/ExpenseForm";

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8 min-h-screen pb-24">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
          家計簿アプリ
        </h1>
        <p className="text-muted-foreground text-sm">
          泰孝と沙紀の家計簿
        </p>
      </header>
      
      <ExpenseForm />
    </main>
  );
}
