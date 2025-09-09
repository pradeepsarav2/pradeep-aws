import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { Plus, MoreVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export type Task = {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  userId: string;
  createdAt: string;
};

type TaskTrackerProps = {
  userId: string;
};

export function TaskTracker({ userId }: TaskTrackerProps) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<"week" | "workdays" | "adjacent">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("taskTracker:viewMode");
      if (stored === "week" || stored === "workdays" || stored === "adjacent") {
        return stored;
      }
    }
    return "week";
  });
  const [offset, setOffset] = useState(0);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("taskTracker:viewMode", viewMode);
      }
    } catch (_) {
      // ignore storage errors
    }
  }, [viewMode]);

  const today = new Date();
  const referenceDate = useMemo(() => {
    const stepPerOffset = viewMode === "adjacent" ? 1 : 7;
    return addDays(today, offset * stepPerOffset);
  }, [today, offset, viewMode]);

  const weekStart = useMemo(
    () => startOfWeek(referenceDate, { weekStartsOn: 1 }),
    [referenceDate]
  );
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const visibleDays = useMemo(() => {
    if (viewMode === "adjacent") {
      return [addDays(referenceDate, -1), referenceDate, addDays(referenceDate, 1)];
    }
    if (viewMode === "workdays") {
      return weekDays.slice(0, 5);
    }
    return weekDays;
  }, [viewMode, referenceDate, weekDays]);

  const gridColsClass = useMemo(() => {
    switch (visibleDays.length) {
      case 3:
        return "lg:grid-cols-3";
      case 5:
        return "lg:grid-cols-5";
      default:
        return "lg:grid-cols-7";
    }
  }, [visibleDays.length]);

  const viewLabel: Record<typeof viewMode, string> = {
    week: "Full Week",
    workdays: "Workdays (Mon–Fri)",
    adjacent: "Adjacent (Y/T/Tmrw)",
  } as const;

  useEffect(() => {
    if (userId) {
      fetchTasks();
    }
  }, [userId]);

  const fetchTasks = async () => {
    const { data, error } = await (supabase as any)
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Failed to load tasks", description: error.message, variant: "destructive" });
      return;
    }

    const mappedTasks: Task[] = (data || []).map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      date: task.date,
      completed: task.completed,
      userId: task.user_id,
      createdAt: task.created_at,
    }));

    setTasks(mappedTasks);
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !selectedDate) return;

    const { data, error } = await (supabase as any)
      .from("tasks")
      .insert([
        {
          user_id: userId,
          title: newTaskTitle.trim(),
          date: selectedDate,
          completed: false,
        },
      ])
      .select()
      .single();

    if (error) {
      toast({ title: "Failed to add task", description: error.message, variant: "destructive" });
      return;
    }

    const newTask: Task = {
      id: data.id,
      title: data.title,
      description: data.description,
      date: data.date,
      completed: data.completed,
      userId: data.user_id,
      createdAt: data.created_at,
    };

    setTasks((prev) => [newTask, ...prev]);
    setNewTaskTitle("");
    setSelectedDate("");
    setIsDialogOpen(false);
    toast({ title: "Task added", description: "Your task has been created successfully." });
  };

  const toggleTaskCompletion = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const { error } = await (supabase as any)
      .from("tasks")
      .update({ completed: !task.completed })
      .eq("id", taskId);

    if (error) {
      toast({ title: "Failed to update task", description: error.message, variant: "destructive" });
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await (supabase as any)
      .from("tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      toast({ title: "Failed to delete task", description: error.message, variant: "destructive" });
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    toast({ title: "Task deleted", description: "Task has been removed successfully." });
  };

  const moveTask = async (taskId: string, newDate: string) => {
    const { error } = await (supabase as any)
      .from("tasks")
      .update({ date: newDate })
      .eq("id", taskId);

    if (error) {
      toast({ title: "Failed to move task", description: error.message, variant: "destructive" });
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, date: newDate } : t)));
  };

  const getTasksForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return tasks
      .filter((task) => task.date === dateStr)
      .sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: "base" }));
  };

  const displayStart = visibleDays[0];
  const displayEnd = visibleDays[visibleDays.length - 1];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Tasks Calendar</CardTitle>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="gap-2 min-w-[160px]" aria-label="Change view">
                  {viewLabel[viewMode]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setViewMode("week")} className="text-xs">
                  Full Week
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("workdays")} className="text-xs">
                  Workdays (Mon–Fri)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("adjacent")} className="text-xs">
                  Adjacent (Yesterday/Today/Tomorrow)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="secondary" onClick={() => setOffset((v) => v - 1)} aria-label="Previous period">
              <ChevronLeft size={16} />
            </Button>
            <div className="text-xs text-muted-foreground min-w-[200px] text-center">
              {format(displayStart, "MMM d")} – {format(displayEnd, "MMM d, yyyy")}
            </div>
            <Button variant="secondary" onClick={() => setOffset((v) => v + 1)} aria-label="Next period">
              <ChevronRight size={16} />
            </Button>
            <div className="w-px h-6 bg-border" />
            {/* Only control the open state here; don't override selectedDate so other open sources can preset it */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); }}>
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={() => {
                    // When clicking the Add Task button, default to today's date
                    setSelectedDate(format(new Date(), "yyyy-MM-dd"));
                  }}
                >
                  <Plus size={18} /> Add Task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Task</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTask();
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="text-xs font-medium">Task Title</label>
                    <Input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Enter task title..." />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Date</label>
                    <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full">
                    Add Task
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      <div className={`grid grid-cols-1 ${gridColsClass} gap-6`}>
        {visibleDays.map((day) => {
          const dayTasks = getTasksForDate(day);
          const isToday = isSameDay(day, today);
          const totalTasks = dayTasks.length;
          const completedTasks = dayTasks.filter((t) => t.completed).length;

          return (
            <Card key={day.toISOString()} className={`min-h-[500px] ${isToday ? "ring-2 ring-primary shadow-lg" : ""}`}>
              <CardHeader className="pb-4">
                <CardTitle className="text-xs font-semibold text-center">
                  <div className="flex flex-col items-center space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{format(day, "EEE")}</span>
                    <span className={`${isToday ? "text-primary" : "text-foreground"} text-sm font-bold`}>{format(day, "d")}</span>
                    <span className="text-[10px] text-muted-foreground mt-1">
                      {totalTasks} {totalTasks === 1 ? "task" : "tasks"} • {completedTasks} done
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <div
                  className="p-4 border-2 border-dashed border-muted-foreground/30 rounded-xl text-center text-xs text-muted-foreground hover:border-muted-foreground/50 hover:bg-accent/20 transition-all cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData("taskId");
                    if (taskId) {
                      moveTask(taskId, format(day, "yyyy-MM-dd"));
                    }
                  }}
                  onClick={() => {
                    // Open the Add Task modal with this specific day pre-populated
                    setSelectedDate(format(day, "yyyy-MM-dd"));
                    setIsDialogOpen(true);
                  }}
                >
                  <Plus size={16} className="mx-auto mb-1 opacity-50" />
                  Drop tasks here
                </div>
                
                {dayTasks.map((task) => {
                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border bg-card text-card-foreground transition-all hover:shadow-md hover:scale-[1.02] ${
                        task.completed ? "opacity-70 bg-muted/50" : "hover:bg-accent/30"
                      }`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("taskId", task.id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h6 className={`font-semibold text-xs leading-tight ${task.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {task.title}
                          </h6>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={task.completed ? "default" : "secondary"}
                            className={`text-xs font-medium ${
                              task.completed
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            }`}
                          >
                            {task.completed ? "Completed" : "Pending"}
                          </Badge>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-accent">
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => toggleTaskCompletion(task.id)} className="text-xs">
                              {task.completed ? "Mark Incomplete" : "Mark Complete"}
                            </DropdownMenuItem>
                            {visibleDays.map((moveDay) => (
                              <DropdownMenuItem
                                key={moveDay.toISOString()}
                                onClick={() => moveTask(task.id, format(moveDay, "yyyy-MM-dd"))}
                                className="text-xs"
                              >
                                Move to {format(moveDay, "EEE d")}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem onClick={() => deleteTask(task.id)} className="text-destructive text-xs">
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}

                
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}