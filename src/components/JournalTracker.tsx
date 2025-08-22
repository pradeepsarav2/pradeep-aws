import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, addDays, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, MoreVertical, RotateCw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
    <div className="flex flex-wrap gap-1 border-b px-2 py-1">
      <Button size="sm" variant={isActive("bold") ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
      <Button size="sm" variant={isActive("italic") ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></Button>
      <Button size="sm" variant={isActive("strike") ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleStrike().run()}>S</Button>
      <div className="w-px h-6 bg-border mx-1" />
      <Button size="sm" variant={isActive("heading", { level: 1 }) ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Button>
      <Button size="sm" variant={isActive("heading", { level: 2 }) ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button>
      <Button size="sm" variant={isActive("heading", { level: 3 }) ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Button>
      <div className="w-px h-6 bg-border mx-1" />
      <Button size="sm" variant={isActive("bulletList") ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Button>
      <Button size="sm" variant={isActive("orderedList") ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Button>
      <Button size="sm" variant={isActive("blockquote") ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Button>
      <Button size="sm" variant={isActive("codeBlock") ? "default" : "secondary"} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code</Button>
      <div className="w-px h-6 bg-border mx-1" />
      <Button size="sm" variant="secondary" onClick={() => editor.chain().focus().undo().run()}>Undo</Button>
      <Button size="sm" variant="secondary" onClick={() => editor.chain().focus().redo().run()}>Redo</Button>
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
    onUpdate: () => scheduleSave(),
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
    if (isEmptyDoc()) return entry ? "Saved" : "Start typing to save";
    return "Saved";
  }, [loading, saving, entry, editor]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Journal</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => goDay(-1)} aria-label="Previous day">
              <ChevronLeft size={16} />
            </Button>
            <div className="flex items-center gap-2">
              <Input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} className="w-[160px]" />
              <Button variant="secondary" onClick={() => setDateISO(format(new Date(), "yyyy-MM-dd"))}>Today</Button>
            </div>
            <Button variant="secondary" onClick={() => goDay(1)} aria-label="Next day">
              <ChevronRight size={16} />
            </Button>
            <div className="w-px h-6 bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="More">
                  <MoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem className="text-xs" onClick={() => editor?.commands.clearContent()}>
                  New page
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => void persist()}>
                  <RotateCw className="mr-2 h-3.5 w-3.5" /> Save now
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {editor && <Toolbar editor={editor} />}
          <div className="px-4 pb-4">
            <div className="rounded-lg border bg-background p-4">
              {editor ? (
                <EditorContent editor={editor} />
              ) : (
                <div className="text-sm text-muted-foreground">Loading editor...</div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {statusText === "Saved" ? <Check size={14} /> : <RotateCw size={14} className={saving ? "animate-spin" : ""} />}
              <span>{statusText}</span>
              {entry?.updatedAt && <span>• Updated {format(new Date(entry.updatedAt), "PPp")}</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default JournalTracker;
