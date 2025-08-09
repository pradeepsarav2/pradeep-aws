import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = "https://fyieceytlwhkujccfjpk.supabase.co";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    console.error("Missing secrets: SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY");
    return new Response(
      JSON.stringify({ error: "Missing secrets: SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const resend = new Resend(RESEND_API_KEY);

  try {
    // Use current IST time (Asia/Kolkata, UTC+05:30) to match habits scheduled for this minute
    const now = new Date();
    // Compute IST by adding 5 hours 30 minutes to UTC
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    const hh = String(ist.getUTCHours()).padStart(2, "0");
    const mm = String(ist.getUTCMinutes()).padStart(2, "0");
    const currentMinute = `${hh}:${mm}:00`;

    const { data: habits, error: habitsError } = await supabase
      .from("habits")
      .select("id, name, user_id, notify_time, active")
      .eq("active", true)
      .eq("notify_time", currentMinute);

    if (habitsError) throw habitsError;

    if (!habits || habits.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, at: currentMinute }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userIds = Array.from(new Set(habits.map((h: any) => h.user_id)));

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds);

    if (profilesError) throw profilesError;

    const emailByUser = new Map<string, string>();
    (profiles || []).forEach((p: any) => {
      if (p.email) emailByUser.set(p.id, p.email);
    });

    let sent = 0;

    for (const h of habits as any[]) {
      let email = emailByUser.get(h.user_id);

      if (!email) {
        // Fallback: use Admin API to fetch user email
        const { data: userData, error: adminErr } = await supabase.auth.admin.getUserById(h.user_id);
        if (adminErr) {
          console.error("admin.getUserById failed", adminErr);
        } else {
          email = userData?.user?.email ?? undefined;
        }
      }

      if (!email) {
        console.log(`No email found for user ${h.user_id}, skipping habit ${h.id}`);
        continue;
      }

      try {
        await resend.emails.send({
          from: "Habit Tracker <onboarding@resend.dev>",
          to: [email],
          subject: `Reminder: ${h.name}`,
          html: `<p>This is your scheduled reminder for habit: <strong>${h.name}</strong> at ${hh}:${mm} IST.</p>`,
        });
        sent++;
      } catch (e) {
        console.error("Resend send error", e);
      }
    }

    return new Response(
      JSON.stringify({ sent, habitsChecked: habits.length, at: currentMinute }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("send-reminders error", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});