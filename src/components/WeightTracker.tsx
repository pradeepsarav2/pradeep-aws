import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Target, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

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

  const chartData = entries.map(entry => ({
    date: format(parseISO(entry.date), 'MMM dd'),
    weight: entry.weight,
    goal: profile.goal_weight
  }));

  const currentWeight = entries.length > 0 ? entries[entries.length - 1].weight : null;
  const previousWeight = entries.length > 1 ? entries[entries.length - 2].weight : null;
  const weightChange = currentWeight && previousWeight ? currentWeight - previousWeight : null;

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
        <div className="grid gap-4">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{currentWeight ? `${currentWeight} kg` : '--'}</div>
              <div className="text-sm text-muted-foreground">Current Weight</div>
            </div>
            
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{profile.goal_weight ? `${profile.goal_weight} kg` : '--'}</div>
              <div className="text-sm text-muted-foreground">Goal Weight</div>
            </div>
            
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-center gap-2">
                {weightChange !== null && (
                  <>
                    {weightChange > 0 ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : weightChange < 0 ? (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    ) : null}
                    <span className="text-2xl font-bold">
                      {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} kg
                    </span>
                  </>
                )}
                {weightChange === null && <span className="text-2xl font-bold">--</span>}
              </div>
              <div className="text-sm text-muted-foreground">Change</div>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="weight" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                    name="Weight"
                  />
                  {profile.goal_weight && (
                    <Line 
                      type="monotone" 
                      dataKey="goal" 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Goal"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {entries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No weight entries yet. Add your first entry to get started!
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}