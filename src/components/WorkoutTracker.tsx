import React, { useState, useEffect } from "react";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { Plus, ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Workout {
  id: string;
  user_id: string;
  title: string;
  exercise_type: string;
  sets?: number;
  reps?: number;
  weight?: number;
  duration_minutes?: number;
  notes?: string;
  date: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

const EXERCISE_TYPES = [
  "Strength Training",
  "Cardio",
  "Yoga",
  "Pilates",
  "Running",
  "Cycling",
  "Swimming",
  "Walking",
  "Stretching",
  "Other"
];

export default function WorkoutTracker() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    exercise_type: "",
    sets: "",
    reps: "",
    weight: "",
    duration_minutes: "",
    notes: "",
  });

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimer(timer => timer + 1);
      }, 1000);
    } else if (!isTimerRunning && timer !== 0) {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timer]);

  // Generate week days
  useEffect(() => {
    const startDate = startOfWeek(currentWeek);
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
    setWeekDays(days);
  }, [currentWeek]);

  // Fetch workouts
  const fetchWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from("workouts" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any;

      if (error) {
        console.error("Error fetching workouts:", error);
        return;
      }

      setWorkouts((data as Workout[]) || []);
    } catch (error) {
      console.error("Error fetching workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, []);

  const handleAddWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.exercise_type) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const workoutData = {
        title: formData.title.trim(),
        exercise_type: formData.exercise_type,
        date: selectedDate,
        sets: formData.sets ? parseInt(formData.sets) : null,
        reps: formData.reps ? parseInt(formData.reps) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes) : null,
        notes: formData.notes.trim() || null,
        completed: false,
      };

      const { error } = await supabase
        .from("workouts" as any)
        .insert([workoutData]);

      if (error) {
        console.error("Error adding workout:", error);
        toast({
          title: "Error",
          description: "Failed to add workout",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Workout added successfully",
      });

      // Reset form
      setFormData({
        title: "",
        exercise_type: "",
        sets: "",
        reps: "",
        weight: "",
        duration_minutes: "",
        notes: "",
      });
      
      setIsDialogOpen(false);
      fetchWorkouts();
    } catch (error) {
      console.error("Error adding workout:", error);
      toast({
        title: "Error",
        description: "Failed to add workout",
        variant: "destructive",
      });
    }
  };

  const toggleWorkoutComplete = async (workoutId: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from("workouts" as any)
        .update({ completed: !completed })
        .eq("id", workoutId);

      if (error) {
        console.error("Error updating workout:", error);
        return;
      }

      fetchWorkouts();
    } catch (error) {
      console.error("Error updating workout:", error);
    }
  };

  const startTimer = (workoutId: string) => {
    setActiveWorkoutId(workoutId);
    setIsTimerRunning(true);
  };

  const pauseTimer = () => {
    setIsTimerRunning(false);
  };

  const resetTimer = () => {
    setTimer(0);
    setIsTimerRunning(false);
    setActiveWorkoutId(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const moveWorkout = async (workoutId: string, newDate: string) => {
    try {
      const { error } = await supabase
        .from("workouts" as any)
        .update({ date: newDate })
        .eq("id", workoutId);

      if (error) {
        console.error("Error moving workout:", error);
        return;
      }

      fetchWorkouts();
    } catch (error) {
      console.error("Error moving workout:", error);
    }
  };

  const getWorkoutsForDay = (day: Date) => {
    const dayString = format(day, "yyyy-MM-dd");
    return workouts.filter(workout => workout.date === dayString);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeek(prev => addDays(prev, direction === 'prev' ? -7 : 7));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg text-muted-foreground">Loading workouts...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Dumbbell className="h-6 w-6 text-primary" />
            Workout Tracker
          </h2>
          
          {/* Timer */}
          {activeWorkoutId && (
            <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-lg">
              <span className="text-lg font-mono">{formatTime(timer)}</span>
              <Button size="sm" variant="outline" onClick={isTimerRunning ? pauseTimer : () => setIsTimerRunning(true)}>
                {isTimerRunning ? <Pause size={14} /> : <Play size={14} />}
              </Button>
              <Button size="sm" variant="outline" onClick={resetTimer}>
                <RotateCcw size={14} />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium min-w-[200px] text-center">
            Week of {format(weekDays[0] || new Date(), "MMM d")} - {format(weekDays[6] || new Date(), "MMM d, yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
            <ChevronRight size={16} />
          </Button>
          <div className="w-px h-6 bg-border" />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="default"
                className="gap-2"
                onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
              >
                <Plus size={18} /> Add Workout
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Workout</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddWorkout} className="space-y-4">
                <div>
                  <Label htmlFor="title">Exercise Name *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Push-ups, Running, Yoga"
                  />
                </div>

                <div>
                  <Label htmlFor="exercise_type">Exercise Type *</Label>
                  <Select value={formData.exercise_type} onValueChange={(value) => setFormData(prev => ({ ...prev, exercise_type: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select exercise type" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXERCISE_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="sets">Sets</Label>
                    <Input
                      id="sets"
                      type="number"
                      min="1"
                      value={formData.sets}
                      onChange={(e) => setFormData(prev => ({ ...prev, sets: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reps">Reps</Label>
                    <Input
                      id="reps"
                      type="number"
                      min="1"
                      value={formData.reps}
                      onChange={(e) => setFormData(prev => ({ ...prev, reps: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="weight">Weight (lbs)</Label>
                    <Input
                      id="weight"
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.weight}
                      onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: e.target.value }))}
                    placeholder="0"
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional notes..."
                    rows={3}
                  />
                </div>

                <Button type="submit" className="w-full">
                  Add Workout
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Weekly Calendar */}
      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((day, index) => {
          const dayWorkouts = getWorkoutsForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <Card
              key={index}
              className={`min-h-[300px] ${isToday ? 'ring-2 ring-primary' : ''}`}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span className={isToday ? 'text-primary' : ''}>
                    {format(day, "EEE")}
                  </span>
                  <span className={`text-sm ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {format(day, "d")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dayWorkouts.map((workout) => (
                  <div
                    key={workout.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                      workout.completed 
                        ? 'bg-green-50 border-green-200 text-green-800' 
                        : 'bg-card hover:bg-accent'
                    }`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", workout.id);
                    }}
                    onClick={() => toggleWorkoutComplete(workout.id, workout.completed)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-sm leading-tight">{workout.title}</h4>
                      {!workout.completed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-primary hover:text-primary-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            startTimer(workout.id);
                          }}
                        >
                          <Play size={12} />
                        </Button>
                      )}
                    </div>
                    
                    <Badge variant="secondary" className="text-xs mb-2">
                      {workout.exercise_type}
                    </Badge>
                    
                    <div className="text-xs space-y-1">
                      {workout.sets && workout.reps && (
                        <div>{workout.sets} sets × {workout.reps} reps</div>
                      )}
                      {workout.weight && (
                        <div>{workout.weight} lbs</div>
                      )}
                      {workout.duration_minutes && (
                        <div>{workout.duration_minutes} minutes</div>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Add button for each day */}
                <div
                  className="p-4 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-muted-foreground/50 transition-colors cursor-pointer"
                  onDrop={(e) => {
                    e.preventDefault();
                    const workoutId = e.dataTransfer.getData("text/plain");
                    if (workoutId) {
                      moveWorkout(workoutId, format(day, "yyyy-MM-dd"));
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedDate(format(day, "yyyy-MM-dd"));
                    setIsDialogOpen(true);
                  }}
                >
                  <Plus size={16} className="mx-auto mb-1 opacity-50" />
                  <p className="text-xs text-center text-muted-foreground">Add Workout</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}