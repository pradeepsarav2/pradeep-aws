// @ts-nocheck
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

  const SUPABASE_URL = "https://fyieceytlwhkujccfjpk.supabase.co"; // consider moving to env if needed
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
    // Current UTC time
    const now = new Date();
    // Derive IST (UTC+05:30)
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
    const istHour = ist.getUTCHours();
    const istMinute = ist.getUTCMinutes();

    // Restrict to 10:00–22:00 IST inclusive
    if (istHour < 10 || istHour > 22) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Outside allowed hour window (10-22 IST)", istHour, istMinute }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Only proceed exactly at top of hour to avoid duplicate reminders if scheduled more frequently
    if (istMinute !== 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Not top of hour", istHour, istMinute }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const yyyy = ist.getUTCFullYear();
    const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ist.getUTCDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD in IST
    const hourLabel = String(istHour).padStart(2, "0");

    // Fetch all incomplete tasks for today
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id,title,user_id,completed,date")
      .eq("date", dateStr)
      .eq("completed", false);

    if (tasksError) throw tasksError;

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, users: 0, date: dateStr, hour: hourLabel, note: "No pending tasks" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Group tasks by user
    const tasksByUser = new Map<string, Array<{ id: string; title: string }>>();
    for (const t of tasks as any[]) {
      if (!tasksByUser.has(t.user_id)) tasksByUser.set(t.user_id, []);
      tasksByUser.get(t.user_id)!.push({ id: t.id, title: t.title });
    }

    const userIds = Array.from(tasksByUser.keys());

    // Fetch profile emails
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,email")
      .in("id", userIds);

    if (profilesError) throw profilesError;

    const emailByUser = new Map<string, string>();
    (profiles || []).forEach((p: any) => { if (p.email) emailByUser.set(p.id, p.email); });

    let sent = 0;

    for (const userId of userIds) {
      let email = emailByUser.get(userId);

      if (!email) {
        // Fallback to Admin API
        try {
          const { data: userData, error: adminErr } = await supabase.auth.admin.getUserById(userId);
          if (!adminErr) email = userData?.user?.email ?? undefined;
        } catch (e) {
          console.error("admin.getUserById failed", e);
        }
      }

      if (!email) continue;

      const userTasks = tasksByUser.get(userId)!;
      // Sort alphabetically (case-insensitive)
      userTasks.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

      const listHtml = userTasks
        .map((t) => `<li style=\"margin:4px 0;\">${t.title}</li>`)
        .join("");

      const html = `
        <div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;\">
          <p><strong>Hourly Task Reminder (${hourLabel}:00 IST)</strong></p>
          <p>You still have ${userTasks.length} pending task(s) for <strong>${dateStr}</strong>:</p>
          <ul style=\"padding-left:18px;\">${listHtml}</ul>
          <p style=\"margin-top:16px;font-size:12px;color:#666;\">This is an automated reminder. Mark tasks complete in your dashboard to stop receiving them.</p>
        </div>
      `;

      try {
        await resend.emails.send({
          from: "Personal Dashboard <onboarding@resend.dev>",
            to: [email],
            subject: `Hourly Task Reminder - ${hourLabel}:00 IST`,
            html,
        });
        sent++;
      } catch (e) {
        console.error("Resend send error", e);
      }
    }

    return new Response(
      JSON.stringify({ sent, usersConsidered: userIds.length, date: dateStr, hour: hourLabel, pendingTasks: tasks.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("tasks-hourly-reminders error", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});