import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { addDays, format, startOfWeek } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, CheckCircle2, LogOut, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
// Types used on the client
export type Habit = {
  id: string;
  name: string;
  notifyTime?: string;
  goalPerWeek?: number;
  createdAt: string;
  active: boolean;
};

export type HabitEntry = {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  done: boolean;
};

// Add Habit Dialog
function AddHabit({ onAdd }: { onAdd: (name: string, goal?: number, notifyTime?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<number | "">("");
  const [time, setTime] = useState<string>("");

  const submit = async () => {
    if (!name.trim()) return;
    await onAdd(name.trim(), goal === "" ? undefined : Number(goal), time || undefined);
    setName("");
    setGoal("");
    setTime("");
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
          <div className="grid gap-2">
            <Label htmlFor="habit-time">Reminder time (optional)</Label>
            <Input
              id="habit-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.currentTarget.value)}
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

function EditHabit({ habit, onSave }: { habit: Habit; onSave: (id: string, updates: { name: string; goal?: number; notifyTime?: string; active: boolean; }) => Promise<void>; }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(habit.name);
  const [goal, setGoal] = useState<number | "">(habit.goalPerWeek ?? "");
  const [time, setTime] = useState<string>(habit.notifyTime ?? "");
  const [active, setActive] = useState<boolean>(habit.active);

  const submit = async () => {
    if (!name.trim()) return;
    const updates = { name: name.trim(), goal: goal === "" ? undefined : Number(goal), notifyTime: time || undefined, active };
    await onSave(habit.id, updates);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Edit habit">
          <Pencil size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit habit</DialogTitle>
          <DialogDescription>Update habit details.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor={`edit-name-${habit.id}`}>Habit name</Label>
            <Input id={`edit-name-${habit.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`edit-goal-${habit.id}`}>Weekly goal</Label>
            <Input id={`edit-goal-${habit.id}`} type="number" min={1} value={goal} onChange={(e) => setGoal(e.currentTarget.value === "" ? "" : Number(e.currentTarget.value))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`edit-time-${habit.id}`}>Reminder time</Label>
            <Input id={`edit-time-${habit.id}`} type="time" value={time} onChange={(e) => setTime(e.currentTarget.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`edit-active-${habit.id}`}>Active</Label>
            <Switch id={`edit-active-${habit.id}`} checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>Save changes</Button>
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
  onRemoveEntry,
  onUpdateHabit,
  onDeleteHabit,
}: {
  habits: Habit[];
  entries: HabitEntry[];
  weekStart: Date;
  onToggle: (habitId: string, dateISO: string) => Promise<void>;
  onRemoveEntry: (habitId: string, dateISO: string) => Promise<void>;
  onUpdateHabit: (id: string, updates: { name: string; goal?: number; notifyTime?: string; active: boolean }) => Promise<void>;
  onDeleteHabit: (id: string) => Promise<void>;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const sortedHabits = useMemo(() => {
    const toMinutes = (t?: string) => {
      if (!t) return Number.POSITIVE_INFINITY;
      const [hh, mm] = t.split(":");
      return Number(hh) * 60 + Number(mm);
    };
    return [...habits].sort((a, b) => toMinutes(a.notifyTime) - toMinutes(b.notifyTime));
  }, [habits]);

  const isDone = (habitId: string, dateISO: string) =>
    entries.some((e) => e.habitId === habitId && e.date === dateISO && e.done);

  const weekISO = (d: Date) => format(d, "yyyy-MM-dd");

  const computeStreaks = useMemo(() => {
    const byHabit = new Map<string, Set<string>>();
    entries.filter((e) => e.done).forEach((e) => {
      const set = byHabit.get(e.habitId) ?? new Set<string>();
      set.add(e.date);
      byHabit.set(e.habitId, set);
    });
    return (habitId: string) => {
      const set = byHabit.get(habitId) ?? new Set<string>();
      // Current streak
      let current = 0;
      let d = new Date();
      let ds = weekISO(d);
      while (set.has(ds)) {
        current++;
        d = addDays(d, -1);
        ds = weekISO(d);
      }
      // Longest streak
      let longest = 0;
      set.forEach((dateStr) => {
        const start = new Date(`${dateStr}T00:00:00`);
        const prev = weekISO(addDays(start, -1));
        if (!set.has(prev)) {
          let len = 1;
          let cur = start;
          while (set.has(weekISO(addDays(cur, 1)))) {
            cur = addDays(cur, 1);
            len++;
          }
          if (len > longest) longest = len;
        }
      });
      return { current, longest };
    };
  }, [entries]);

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
            sortedHabits.map((h) => {
              const count = days.filter((d) => isDone(h.id, weekISO(d))).length;
              const goal = h.goalPerWeek ?? 7;
              return (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">
                    {h.name}
                    {h.notifyTime && <span className="ml-2 text-xs text-muted-foreground">{h.notifyTime}</span>}
                  </TableCell>
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const weekStart = useMemo(() => startOfWeek(addDays(today, weekOffset * 7), { weekStartsOn: 1 }), [today, weekOffset]);

  useEffect(() => {
    document.title = "AWS-Style Habit Tracker";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Track daily habits securely with Supabase-authenticated storage.");
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      setLoading(false);
      if (!uid) navigate("/auth", { replace: true });
      if (uid) void upsertProfileEmail(uid, session?.user?.email ?? null);
      if (uid) void refreshData(uid);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      setLoading(false);
      if (!uid) navigate("/auth", { replace: true });
      if (uid) void upsertProfileEmail(uid, session?.user?.email ?? null);
      if (uid) void refreshData(uid);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const refreshData = async (uid: string) => {
    await Promise.all([fetchHabits(uid), fetchEntries(uid)]);
  };

  const upsertProfileEmail = async (uid: string, email?: string | null) => {
    if (!email) return;
    await supabase.from("profiles").upsert([{ id: uid, email }], { onConflict: "id" });
  };

  const fetchHabits = async (uid: string) => {
    const { data, error } = await supabase
      .from("habits")
      .select("id, name, goal_per_week, active, created_at, notify_time")
      .eq("user_id", uid)
      .order("notify_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load habits", description: error.message, variant: "destructive" });
      return;
    }
    const mapped: Habit[] = (data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      goalPerWeek: h.goal_per_week ?? undefined,
      createdAt: h.created_at as string,
      active: h.active as boolean,
      notifyTime: typeof (h as any).notify_time === "string" ? (h as any).notify_time.slice(0, 5) : undefined,
    }));
    setHabits(mapped);
  };

  const fetchEntries = async (uid: string) => {
    const { data, error } = await supabase
      .from("habit_entries")
      .select("id, habit_id, date, done")
      .eq("user_id", uid);
    if (error) {
      toast({ title: "Failed to load entries", description: error.message, variant: "destructive" });
      return;
    }
    const mapped: HabitEntry[] = (data ?? []).map((e) => ({
      id: e.id,
      habitId: e.habit_id as string,
      date: typeof e.date === "string" ? e.date : String(e.date),
      done: e.done as boolean,
    }));
    setEntries(mapped);
  };

  const addHabit = async (name: string, goal?: number, notifyTime?: string) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("habits")
      .insert([{ user_id: userId, name, goal_per_week: goal, active: true, notify_time: notifyTime ?? null }])
      .select()
      .maybeSingle();
    if (error) {
      toast({ title: "Could not add habit", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setHabits((prev) => [
        {
          id: data.id,
          name: data.name,
          goalPerWeek: data.goal_per_week ?? undefined,
          createdAt: data.created_at,
          active: data.active,
          notifyTime: typeof (data as any).notify_time === "string" ? (data as any).notify_time.slice(0, 5) : undefined,
        },
        ...prev,
      ]);
    }
  };

  const toggleEntry = async (habitId: string, dateISO: string) => {
    if (!userId) return;
    const existing = entries.find((e) => e.habitId === habitId && e.date === dateISO);
    if (!existing) {
      const { data, error } = await supabase
        .from("habit_entries")
        .insert([{ user_id: userId, habit_id: habitId, date: dateISO, done: true }])
        .select()
        .maybeSingle();
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
      if (data) {
        setEntries((prev) => [
          { id: data.id, habitId: data.habit_id as string, date: dateISO, done: true },
          ...prev,
        ]);
      }
    } else {
      const { data, error } = await supabase
        .from("habit_entries")
        .update({ done: !existing.done })
        .eq("id", existing.id)
        .select()
        .maybeSingle();
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
      if (data) {
        setEntries((prev) => prev.map((e) => (e.id === existing.id ? { ...e, done: data.done as boolean } : e)));
      }
    }
  };

  const removeEntry = async (habitId: string, dateISO: string) => {
    if (!userId) return;
    const existing = entries.find((e) => e.habitId === habitId && e.date === dateISO);
    if (!existing) return;
    const { error } = await supabase.from("habit_entries").delete().eq("id", existing.id);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== existing.id));
  };

  const updateHabit = async (
    id: string,
    updates: { name: string; goal?: number; notifyTime?: string; active: boolean }
  ) => {
    if (!userId) return;
    const payload: any = {
      name: updates.name,
      goal_per_week: updates.goal ?? null,
      notify_time: updates.notifyTime ?? null,
      active: updates.active,
    };
    const { data, error } = await supabase
      .from("habits")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) {
      toast({ title: "Update habit failed", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setHabits((prev) =>
        prev.map((h) =>
          h.id === id
            ? {
                ...h,
                name: data.name,
                goalPerWeek: data.goal_per_week ?? undefined,
                active: data.active,
                notifyTime:
                  typeof (data as any).notify_time === "string"
                    ? (data as any).notify_time.slice(0, 5)
                    : undefined,
              }
            : h
        )
      );
    }
  };

  const deleteHabit = async (id: string) => {
    if (!userId) return;
    const { error: e1 } = await supabase
      .from("habit_entries")
      .delete()
      .eq("habit_id", id)
      .eq("user_id", userId);
    if (e1) {
      toast({ title: "Delete habit failed", description: e1.message, variant: "destructive" });
      return;
    }
    const { error: e2 } = await supabase.from("habits").delete().eq("id", id);
    if (e2) {
      toast({ title: "Delete habit failed", description: e2.message, variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.filter((e) => e.habitId !== id));
    setHabits((prev) => prev.filter((h) => h.id !== id));
    toast({ title: "Habit deleted", description: "Habit and its entries were removed." });
  };

  const completedThisWeek = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "yyyy-MM-dd"));
    return entries.filter((e) => days.includes(e.date) && e.done).length;
  }, [entries, weekStart]);

  const totalCells = habits.length * 7 || 1;
  const progress = Math.round((completedThisWeek / totalCells) * 100);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="w-full border-b">
        <div className="bg-nav text-nav-foreground">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="font-semibold">Habit Tracker</div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground opacity-80 hidden sm:block">
                {format(new Date(), "PPPP")}
              </div>
              <Button variant="secondary" onClick={signOut} className="gap-2">
                <LogOut size={16} /> Sign out
              </Button>
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

        <HabitTable habits={habits} entries={entries} weekStart={weekStart} onToggle={toggleEntry} onRemoveEntry={removeEntry} onUpdateHabit={updateHabit} onDeleteHabit={deleteHabit} />

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
