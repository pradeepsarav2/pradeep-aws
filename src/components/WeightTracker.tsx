import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Target, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

type WeightEntry = {
  id: string;
  weight: number;
  date: string;
  notes?: string;
};

type Profile = {
  goal_weight?: number;
};

export function WeightTracker({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [profile, setProfile] = useState<Profile>({});
  const [open, setOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEntries();
    fetchProfile();
  }, [userId]);

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error) {
      toast({ title: "Error", description: "Failed to fetch weight entries", variant: "destructive" });
    } else {
      setEntries(data || []);
    }
  };

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('goal_weight')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      toast({ title: "Error", description: "Failed to fetch profile", variant: "destructive" });
    } else if (data) {
      setProfile(data);
      setGoalWeight(data.goal_weight?.toString() || "");
    }
  };

  const addEntry = async () => {
    if (!weight.trim()) return;

    setLoading(true);
    const weightNum = parseFloat(weight);
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase
      .from('weight_entries')
      .upsert({
        user_id: userId,
        weight: weightNum,
        date: today,
        notes: notes.trim() || null
      }, {
        onConflict: 'user_id,date'
      });

    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Weight entry added" });
      setWeight("");
      setNotes("");
      setOpen(false);
      fetchEntries();
    }
  };

  const updateGoal = async () => {
    if (!goalWeight.trim()) return;

    setLoading(true);
    const goalNum = parseFloat(goalWeight);

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        goal_weight: goalNum
      }, {
        onConflict: 'id'
      });

    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Goal weight updated" });
      setGoalOpen(false);
      fetchProfile();
    }
  };

  const currentWeight = entries.length > 0 ? entries[entries.length - 1].weight : null;
  const previousWeight = entries.length > 1 ? entries[entries.length - 2].weight : null;
  const weightChange = currentWeight && previousWeight ? currentWeight - previousWeight : null;

  // Prepare chart data
  const chartData = {
    datasets: [
      {
        label: 'Weight',
        data: entries.map(entry => ({
          x: entry.date,
          y: entry.weight
        })),
        borderColor: 'hsl(var(--primary))',
        backgroundColor: 'hsla(var(--primary), 0.1)',
        borderWidth: 2,
        pointBackgroundColor: 'hsl(var(--primary))',
        pointBorderColor: 'hsl(var(--background))',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.1,
      },
      ...(profile.goal_weight ? [{
        label: 'Goal Weight',
        data: entries.length > 0 ? [
          { x: entries[0].date, y: profile.goal_weight },
          { x: entries[entries.length - 1].date, y: profile.goal_weight }
        ] : [],
        borderColor: 'hsl(var(--muted-foreground))',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
      }] : [])
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          color: 'hsl(var(--foreground))',
          font: {
            size: 12,
          }
        }
      },
      tooltip: {
        backgroundColor: 'hsl(var(--popover))',
        titleColor: 'hsl(var(--popover-foreground))',
        bodyColor: 'hsl(var(--popover-foreground))',
        borderColor: 'hsl(var(--border))',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: function(context: any) {
            return format(parseISO(context[0].parsed.x), 'PPP');
          },
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y} kg`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'day' as const,
          displayFormats: {
            day: 'MMM dd'
          }
        },
        grid: {
          color: 'hsla(var(--border), 0.5)',
          drawBorder: false,
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            size: 11,
          }
        }
      },
      y: {
        beginAtZero: false,
        grid: {
          color: 'hsla(var(--border), 0.5)',
          drawBorder: false,
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            size: 11,
          },
          callback: function(value: any) {
            return value + ' kg';
          }
        }
      }
    },
    elements: {
      point: {
        hoverBorderWidth: 3,
      }
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">Weight Tracker</CardTitle>
        <div className="flex gap-2">
          <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Target className="h-4 w-4 mr-2" />
                Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Goal Weight</DialogTitle>
                <DialogDescription>Set your target weight goal.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="goal-weight">Goal Weight (kg)</Label>
                  <Input 
                    id="goal-weight" 
                    type="number" 
                    step="0.1"
                    value={goalWeight} 
                    onChange={(e) => setGoalWeight(e.target.value)} 
                    placeholder="70.0"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={updateGoal} disabled={loading}>
                  Save Goal
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Weight Entry</DialogTitle>
                <DialogDescription>Record your current weight for today.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input 
                    id="weight" 
                    type="number" 
                    step="0.1"
                    value={weight} 
                    onChange={(e) => setWeight(e.target.value)} 
                    placeholder="70.0"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input 
                    id="notes" 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)} 
                    placeholder="Feeling good, had a good workout..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={addEntry} disabled={loading}>
                  Add Entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
              <div className="text-2xl font-bold text-primary">{currentWeight ? `${currentWeight} kg` : '--'}</div>
              <div className="text-sm text-muted-foreground">Current Weight</div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-br from-muted/50 to-muted/80 rounded-lg border">
              <div className="text-2xl font-bold">{profile.goal_weight ? `${profile.goal_weight} kg` : '--'}</div>
              <div className="text-sm text-muted-foreground">Goal Weight</div>
            </div>
            
            <div className="text-center p-4 bg-gradient-to-br from-secondary/50 to-secondary/80 rounded-lg border">
              <div className="flex items-center justify-center gap-2">
                {weightChange !== null && (
                  <>
                    {weightChange > 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : weightChange < 0 ? (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    ) : null}
                    <span className={`text-2xl font-bold ${
                      weightChange > 0 ? 'text-red-500' : 
                      weightChange < 0 ? 'text-green-500' : 
                      'text-muted-foreground'
                    }`}>
                      {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} kg
                    </span>
                  </>
                )}
                {weightChange === null && <span className="text-2xl font-bold text-muted-foreground">--</span>}
              </div>
              <div className="text-sm text-muted-foreground">Change</div>
            </div>
          </div>

          {/* Chart */}
          {entries.length > 0 ? (
            <div className="h-80 w-full bg-gradient-to-br from-background to-muted/20 rounded-lg border p-4">
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground bg-gradient-to-br from-muted/20 to-muted/40 rounded-lg border">
              <div className="space-y-2">
                <div className="text-lg font-medium">No weight entries yet</div>
                <div className="text-sm">Add your first entry to see your progress chart</div>
              </div>
            </div>
          )}

          {/* Recent entries */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Recent Entries</h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {entries.slice(-5).reverse().map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-md text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{entry.weight} kg</span>
                      <span className="text-muted-foreground">{format(parseISO(entry.date), 'MMM dd, yyyy')}</span>
                    </div>
                    {entry.notes && (
                      <span className="text-xs text-muted-foreground italic max-w-32 truncate">
                        {entry.notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}