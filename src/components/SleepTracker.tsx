import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { addDays, eachDayOfInterval, format, isSameDay, startOfWeek, subDays } from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, MoreVertical, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

export type SleepLog = {
  id: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  durationMinutes: number; // total minutes slept
  userId: string;
  createdAt: string;
};

type SleepTrackerProps = {
  userId: string;
  targetSleepHours?: number; // default 8h
};

export function SleepTracker({ userId, targetSleepHours = 8 }: SleepTrackerProps) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const weekStart = useMemo(() => startOfWeek(addDays(today, weekOffset * 7), { weekStartsOn: 1 }), [today, weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    if (userId) void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchLogs = async () => {
    const { data, error } = await (supabase as any)
      .from("sleep_logs")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (error) {
      toast({ title: "Failed to load sleep logs", description: error.message, variant: "destructive" });
      return;
    }

    const mapped: SleepLog[] = (data || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      startTime: row.start_time ?? undefined,
      endTime: row.end_time ?? undefined,
      durationMinutes: row.duration_minutes ?? 0,
      userId: row.user_id,
      createdAt: row.created_at,
    }));

    setLogs(mapped);
  };

  const parseTimeToMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const computeDurationMinutes = (start: string, end: string) => {
    if (!start || !end) return 0;
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    // handle crossing midnight
    const diff = endMin >= startMin ? endMin - startMin : 24 * 60 - startMin + endMin;
    return diff;
  };

  const addLog = async () => {
    if (!date || !startTime || !endTime) return;
    const durationMinutes = computeDurationMinutes(startTime, endTime);

    const { data, error } = await (supabase as any)
      .from("sleep_logs")
      .insert([
        {
          user_id: userId,
          date,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: durationMinutes,
        },
      ])
      .select()
      .single();

    if (error) {
      toast({ title: "Failed to add sleep log", description: error.message, variant: "destructive" });
      return;
    }

    const newLog: SleepLog = {
      id: data.id,
      date: data.date,
      startTime: data.start_time ?? undefined,
      endTime: data.end_time ?? undefined,
      durationMinutes: data.duration_minutes ?? 0,
      userId: data.user_id,
      createdAt: data.created_at,
    };

    setLogs((prev) => [newLog, ...prev]);
    setDate("");
    setStartTime("");
    setEndTime("");
    setIsDialogOpen(false);
    toast({ title: "Sleep log added", description: "Your sleep has been recorded." });
  };

  const deleteLog = async (id: string) => {
    const { error } = await (supabase as any).from("sleep_logs").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete log", description: error.message, variant: "destructive" });
      return;
    }
    setLogs((prev) => prev.filter((l) => l.id !== id));
    toast({ title: "Log deleted", description: "Sleep entry removed." });
  };

  const minutesToHours = (m: number) => +(m / 60).toFixed(2);

  // Build a map of date -> hours for quick lookup
  const last14Days = useMemo(() => eachDayOfInterval({ start: subDays(today, 13), end: today }), [today]);
  const last30Days = useMemo(() => eachDayOfInterval({ start: subDays(today, 29), end: today }), [today]);

  const hoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) {
      map.set(l.date, (map.get(l.date) || 0) + minutesToHours(l.durationMinutes));
    }
    return map;
  }, [logs]);

  const target = targetSleepHours;

  const chart14Data = last14Days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return {
      date: format(d, "MMM d"),
      value: +(hoursByDate.get(key) || 0).toFixed(2),
      target,
    };
  });

  const weekData = weekDays.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return {
      day: format(d, "EEE"),
      value: +(hoursByDate.get(key) || 0).toFixed(2),
      target,
    };
  });

  const thisWeekDebt = useMemo(() => {
    return weekDays.reduce((acc, d) => {
      // Only count days strictly before today (ignore today and future)
      if (isSameDay(d, today) || d > today) return acc;
      const key = format(d, "yyyy-MM-dd");
      const slept = hoursByDate.get(key) || 0;
      const debt = Math.max(0, target - slept);
      return acc + debt;
    }, 0);
  }, [weekDays, hoursByDate, target, today]);

  const lastNight = useMemo(() => {
    const key = format(subDays(today, 1), "yyyy-MM-dd");
    return +(hoursByDate.get(key) || 0).toFixed(2);
  }, [today, hoursByDate]);

  return (
    <div className="space-y-4">
      {/* Header and Add */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Sleep Tracker</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setWeekOffset((v) => v - 1)} aria-label="Previous week">
              <ChevronLeft size={16} />
            </Button>
            <div className="text-xs text-muted-foreground min-w-[160px] text-center">
              {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
            </div>
            <Button variant="secondary" onClick={() => setWeekOffset((v) => v + 1)} aria-label="Next week">
              <ChevronRight size={16} />
            </Button>
            <div className="w-px h-6 bg-border" />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default" className="gap-2">
                  <CalendarPlus size={18} /> Add Sleep
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Sleep Entry</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium">Date</label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">Start Time</label>
                      <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium">End Time</label>
                      <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                  </div>
                  <Button onClick={addLog} className="w-full">
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-muted-foreground">Last Night</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lastNight}h</div>
            <div className="text-xs text-muted-foreground">vs target {target}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-muted-foreground">This Week Avg (up to yesterday)</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const daysSoFar = weekDays.filter((d) => !isSameDay(d, today) && d < today);
              const total = daysSoFar.reduce((sum, d) => {
                const key = format(d, "yyyy-MM-dd");
                return sum + (hoursByDate.get(key) || 0);
              }, 0);
              const avg = daysSoFar.length > 0 ? +(total / daysSoFar.length).toFixed(2) : 0;
              return <div className="text-2xl font-bold">{avg}h</div>;
            })()}
            <div className="text-xs text-muted-foreground">Target {target}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-muted-foreground">Sleep Debt (This Week, up to yesterday)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{thisWeekDebt.toFixed(1)}h</div>
              <Badge variant={thisWeekDebt > 0 ? "destructive" : "secondary"}>{thisWeekDebt > 0 ? "Owed" : "On Track"}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">Sum of (target - actual, floor at 0)</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Last 14 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                value: { label: "Hours Slept", color: "hsl(var(--primary))" },
                target: { label: "Target", color: "hsl(var(--muted-foreground))" },
              }}
              className="h-64"
            >
              <AreaChart data={chart14Data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis width={28} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ReferenceLine y={target} stroke="var(--color-target)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                value: { label: "Hours", color: "hsl(var(--primary))" },
                target: { label: "Target", color: "hsl(var(--muted-foreground))" },
              }}
              className="h-64"
            >
              <BarChart data={weekData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis width={28} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ReferenceLine y={target} stroke="var(--color-target)" strokeDasharray="4 4" />
                <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Weekly view & logs list */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        {weekDays.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const isToday = isSameDay(day, today);
          const dayLogs = logs.filter((l) => l.date === dayKey);
          const totalHours = dayLogs.reduce((a, l) => a + minutesToHours(l.durationMinutes), 0);

          return (
            <Card key={day.toISOString()} className={`min-h-[300px] ${isToday ? "ring-2 ring-primary shadow-lg" : ""}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-center">
                  <div className="flex flex-col items-center space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{format(day, "EEE")}</span>
                    <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <div className="text-center text-sm">
                  <span className="font-semibold">{totalHours.toFixed(2)}h</span> slept
                </div>

                {dayLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl border bg-card text-card-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs">
                        {log.startTime && log.endTime ? (
                          <span>
                            {log.startTime} → {log.endTime}
                          </span>
                        ) : (
                          <span>{minutesToHours(log.durationMinutes)}h</span>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-accent">
                            <MoreVertical size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem className="text-xs text-destructive" onClick={() => deleteLog(log.id)}>
                            <Trash2 className="mr-2 h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}

                {dayLogs.length === 0 && (
                  <div className="p-4 border-2 border-dashed border-muted-foreground/30 rounded-xl text-center text-xs text-muted-foreground">
                    No entries
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default SleepTracker;
