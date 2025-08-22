import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, addDays, parseISO } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, MoreVertical, RotateCw, Check, Bold, Italic, List, ListOrdered, Quote, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
// TipTap editor
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Heading from "@tiptap/extension-heading";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
// Replace incorrect import with createLowlight instance
import { common, createLowlight } from "lowlight";
const lowlightInstance = createLowlight(common);

export type JournalEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  title?: string | null;
  content?: string; // plain text fallback
  content_json?: any; // TipTap JSON
  userId: string;
  createdAt: string;
  updatedAt?: string;
};

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null as any;
  const isActive = (name: string, attrs?: any) => editor.isActive(name as any, attrs);
  return (
    <div className="flex flex-wrap gap-1 border-b bg-muted/40 px-3 py-2 rounded-md">
      <Button size="sm" variant={isActive("heading", { level: 1 }) ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className="h-8 px-2 text-xs">T</Button>
      <Button size="sm" variant={isActive("bold") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleBold().run()} className="h-8 w-8 p-0" aria-label="Bold"><Bold size={16} /></Button>
      <Button size="sm" variant={isActive("italic") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleItalic().run()} className="h-8 w-8 p-0" aria-label="Italic"><Italic size={16} /></Button>
      <Button size="sm" variant={isActive("bulletList") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleBulletList().run()} className="h-8 w-8 p-0" aria-label="Bullet list"><List size={16} /></Button>
      <Button size="sm" variant={isActive("orderedList") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleOrderedList().run()} className="h-8 w-8 p-0" aria-label="Ordered list"><ListOrdered size={16} /></Button>
      <Button size="sm" variant={isActive("blockquote") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleBlockquote().run()} className="h-8 w-8 p-0" aria-label="Quote"><Quote size={16} /></Button>
      <Button size="sm" variant={isActive("codeBlock") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleCodeBlock().run()} className="h-8 w-8 p-0" aria-label="Code"><Code size={16} /></Button>
      <div className="w-px h-6 bg-border mx-1" />
      <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().undo().run()} className="h-8 w-8 p-0" aria-label="Undo">↺</Button>
      <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().redo().run()} className="h-8 w-8 p-0" aria-label="Redo">↻</Button>
    </div>
  );
}

export function JournalTracker({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [dateISO, setDateISO] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contentVersion, setContentVersion] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      Heading.configure({ levels: [1, 2, 3] }),
      CodeBlockLowlight.configure({ lowlight: lowlightInstance }),
      Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { class: "text-primary underline" } }),
      Placeholder.configure({ placeholder: "Write your day... Use / to add structure" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[420px]",
      },
    },
    onUpdate: () => { scheduleSave(); setContentVersion(v => v + 1); },
  });

  const goDay = (delta: number) => {
    const d = addDays(parseISO(dateISO), delta);
    setDateISO(format(d, "yyyy-MM-dd"));
  };

  const scheduleSave = () => {
    if (!editor) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), 800);
  };

  const isEmptyDoc = () => {
    if (!editor) return true;
    return editor.getText().trim().length === 0;
  };

  const extractTitle = (doc: any): string | null => {
    try {
      const first = doc?.content?.find((n: any) => n.type === "heading")
        ?? doc?.content?.find((n: any) => n.type === "paragraph");
      if (!first) return null;
      const text = (first.content ?? []).map((c: any) => c.text ?? "").join("");
      return text?.trim() ? text.trim().slice(0, 160) : null;
    } catch {
      return null;
    }
  };

  const persist = async () => {
    if (!userId || !editor) return;
    setSaving(true);
    try {
      const doc = editor.getJSON();
      const text = editor.getText();
      const title = extractTitle(doc);

      const { data, error } = await (supabase as any)
        .from("journal_entries")
        .upsert([
          {
            user_id: userId,
            date: dateISO,
            content_json: doc,
            content: text,
            title: title ?? null,
          },
        ], { onConflict: "user_id,date" })
        .select()
        .single();

      if (error) throw error;

      setEntry({
        id: data.id,
        date: typeof data.date === "string" ? data.date : String(data.date),
        title: data.title ?? null,
        content: data.content ?? undefined,
        content_json: data.content_json ?? undefined,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    } catch (e: any) {
      toast({ title: "Autosave failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("journal_entries")
        .select("*")
        .eq("user_id", userId)
        .eq("date", dateISO)
        .maybeSingle();
      if (error) throw error;
      if (editor) {
        if (data?.content_json) editor.commands.setContent(data.content_json);
        else if (data?.content) editor.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: data.content }] }] });
        else editor.commands.clearContent();
      }
      if (data) {
        setEntry({
          id: data.id,
          date: typeof data.date === "string" ? data.date : String(data.date),
          title: data.title ?? null,
          content: data.content ?? undefined,
          content_json: data.content_json ?? undefined,
          userId: data.user_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });
      } else {
        setEntry(null);
      }
    } catch (e: any) {
      toast({ title: "Failed to load journal", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (editor) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dateISO, editor]);

  const statusText = useMemo(() => {
    if (loading) return "Loading...";
    if (saving) return "Saving...";
    return "All changes saved";
  }, [loading, saving, entry, contentVersion]);

  const friendlyDate = useMemo(() => {
    try { return format(parseISO(dateISO), "dd/MM/yyyy"); } catch { return dateISO; }
  }, [dateISO]);

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex w-full items-center gap-3">
            <CardTitle className="text-base font-semibold mr-auto">Journal</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goDay(-1)} aria-label="Previous day"><ChevronLeft size={16} /></Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-3 font-normal text-xs min-w-[110px] justify-start" aria-label="Pick date">
                  {friendlyDate}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-auto" align="center">
                <Calendar
                  mode="single"
                  selected={parseISO(dateISO)}
                  onSelect={(d: Date | undefined) => d && setDateISO(format(d, "yyyy-MM-dd"))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goDay(1)} aria-label="Next day"><ChevronRight size={16} /></Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setDateISO(format(new Date(), "yyyy-MM-dd"))}>Today</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open calendar" onClick={() => { /* calendar opened by popover trigger - keep for layout */ }}>
              <CalendarIcon size={16} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More"><MoreVertical size={16} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem className="text-xs" onClick={() => editor?.commands.clearContent()}>New page</DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => void persist()}>
                  <RotateCw className="mr-2 h-3.5 w-3.5" /> Save now
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {editor && <Toolbar editor={editor} />}
          <div className="border rounded-md p-4 min-h-[400px] bg-background">
            {editor ? <EditorContent editor={editor} /> : <div className="text-sm text-muted-foreground">Loading editor...</div>}
          </div>
          <div className="flex items-center text-xs text-muted-foreground justify-between border-t pt-3 mt-2">
            <span className="flex items-center gap-1">{statusText === "All changes saved" ? <Check size={14} /> : <RotateCw size={14} className={saving ? "animate-spin" : ""} />}{statusText}</span>
            {entry?.updatedAt && <span className="flex items-center gap-1"><CalendarIcon size={14} /> Updated {format(new Date(entry.updatedAt), "PP, p")}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default JournalTracker;
