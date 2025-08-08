import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { addDays, format, startOfWeek } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

// Types
export type Habit = {
  id: string;
  name: string;
  goalPerWeek?: number;
  createdAt: string;
  active: boolean;
};

export type HabitEntry = {
  habitId: string;
  date: string; // YYYY-MM-DD
  done: boolean;
};

// Local storage helpers
const load = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const save = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// Add Habit Dialog
function AddHabit({ onAdd }: { onAdd: (habit: Habit) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<number | "">("");

  const submit = () => {
    if (!name.trim()) return;
    const habit: Habit = {
      id: crypto.randomUUID(),
      name: name.trim(),
      goalPerWeek: goal === "" ? undefined : Number(goal),
      createdAt: new Date().toISOString(),
      active: true,
    };
    onAdd(habit);
    setName("");
    setGoal("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <Plus size={18} /> Add habit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new habit</DialogTitle>
          <DialogDescription>
            Name your habit and optionally set a weekly goal.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="habit-name">Habit name</Label>
            <Input
              id="habit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Meditate"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="habit-goal">Weekly goal (optional)</Label>
            <Input
              id="habit-goal"
              type="number"
              min={1}
              value={goal}
              onChange={(e) => setGoal(e.currentTarget.value === "" ? "" : Number(e.currentTarget.value))}
              placeholder="e.g., 5"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Habit Table
function HabitTable({
  habits,
  entries,
  weekStart,
  onToggle,
}: {
  habits: Habit[];
  entries: HabitEntry[];
  weekStart: Date;
  onToggle: (habitId: string, dateISO: string) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const isDone = (habitId: string, dateISO: string) =>
    entries.some((e) => e.habitId === habitId && e.date === dateISO && e.done);

  const weekISO = (d: Date) => format(d, "yyyy-MM-dd");

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[320px]">Habit</TableHead>
            {days.map((d) => (
              <TableHead key={d.toISOString()} className="text-center">
                <span className="block text-sm font-medium">{format(d, "EEE")}</span>
                <span className="block text-xs text-muted-foreground">{format(d, "MMM d")}</span>
              </TableHead>
            ))}
            <TableHead className="text-right">Weekly</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {habits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                No habits yet. Add one to get started.
              </TableCell>
            </TableRow>
          ) : (
            habits.map((h) => {
              const count = days.filter((d) => isDone(h.id, weekISO(d))).length;
              const goal = h.goalPerWeek ?? 7;
              return (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  {days.map((d) => {
                    const iso = weekISO(d);
                    const done = isDone(h.id, iso);
                    return (
                      <TableCell key={iso} className="text-center">
                        <button
                          aria-label={`Toggle ${h.name} on ${format(d, "PPP")}`}
                          onClick={() => onToggle(h.id, iso)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            done ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary"
                          }`}
                        >
                          {done ? <CheckCircle2 size={18} /> : <span className="block h-3 w-3 rounded-sm border" />}
                        </button>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border ${count >= goal ? "border-primary text-primary" : "bg-secondary"}`}>
                      {count}/{goal}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Index() {
  const { toast } = useToast();
  const [habits, setHabits] = useState<Habit[]>(() => load<Habit[]>("habits", []));
  const [entries, setEntries] = useState<HabitEntry[]>(() => load<HabitEntry[]>("entries", []));
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => save("habits", habits), [habits]);
  useEffect(() => save("entries", entries), [entries]);

  const today = new Date();
  const weekStart = useMemo(() => startOfWeek(addDays(today, weekOffset * 7), { weekStartsOn: 1 }), [today, weekOffset]);

  const addHabit = (h: Habit) => {
    setHabits((prev) => [h, ...prev]);
    toast({ title: "Habit added", description: `${h.name} created.` });
  };

  const toggleEntry = (habitId: string, dateISO: string) => {
    setEntries((prev) => {
      const match = prev.find((e) => e.habitId === habitId && e.date === dateISO);
      if (!match) return [...prev, { habitId, date: dateISO, done: true }];
      return prev.map((e) => (e === match ? { ...e, done: !e.done } : e));
    });
  };

  const completedThisWeek = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));
    return entries.filter((e) => days.includes(e.date) && e.done).length;
  }, [entries, weekStart]);

  const totalCells = habits.length * 7 || 1;
  const progress = Math.round((completedThisWeek / totalCells) * 100);

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation (AWS-like) */}
      <header className="w-full border-b">
        <div className="bg-nav text-nav-foreground">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="font-semibold">Habit Tracker</div>
            <div className="text-sm text-muted-foreground opacity-80">
              {format(new Date(), "PPPP")}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="sr-only">AWS-Style Habit Tracker</h1>

        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Weekly overview</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setWeekOffset((v) => v - 1)} aria-label="Previous week">
                <ChevronLeft size={16} />
              </Button>
              <div className="text-sm text-muted-foreground min-w-[160px] text-center">
                {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
              </div>
              <Button variant="secondary" onClick={() => setWeekOffset((v) => v + 1)} aria-label="Next week">
                <ChevronRight size={16} />
              </Button>
              <div className="w-px h-6 bg-border" />
              <AddHabit onAdd={addHabit} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="relative h-2 w-full rounded-full bg-muted">
                <div
                  className="absolute left-0 top-0 h-2 rounded-full bg-primary"
                  style={{ width: `${progress}%` }}
                  aria-hidden
                />
              </div>
              <div className="text-sm text-muted-foreground w-24 text-right">{progress}%</div>
            </div>
          </CardContent>
        </Card>

        <HabitTable habits={habits} entries={entries} weekStart={weekStart} onToggle={toggleEntry} />

        {/* Structured data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "AWS-Style Habit Tracker",
              applicationCategory: "Productivity",
              operatingSystem: "Web",
              description: "Track daily habits in a weekly grid with AWS Console light theme design.",
            }),
          }}
        />
      </main>
    </div>
  );
}
