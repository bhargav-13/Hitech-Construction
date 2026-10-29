"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, MicOff, Paperclip, Plus, RotateCcw, Send, Square, Trash2, Volume2, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { Select } from "@/components/Select";
import { formatDateTimeIST } from "@/lib/datetime";
import { previewFile } from "@/lib/filePreview";
import { useAuthStore } from "@/lib/authStore";
import {
  QUERY_CATEGORIES,
  getAllQueries,
  getHrPeople,
  getMyQueries,
  getQuery,
  getQueryMedia,
  raiseQuery,
  replyQuery,
  setQueryStatus,
  type HrPersonApi,
  type MessageBody,
  type QueryApi,
  type QueryLanguage,
} from "@/lib/hrDeskApi";

/**
 * Self Service → Query / Problem (KAN-57), and HR's side of it.
 *
 * An employee writes to HR — the whole team or one person — in English, Gujarati or Hindi, by
 * typing, by dictating (the browser turns speech into text in the chosen language), or by recording
 * a voice note for someone who'd rather just talk. Files (a payslip, a photo of a bill) attach to
 * any message. HR answers in the same thread; each reply rings the other side's bell.
 */

const LANGS: { value: QueryLanguage; label: string; speech: string; placeholder: string }[] = [
  { value: "en", label: "English", speech: "en-IN", placeholder: "Write your message…" },
  { value: "gu", label: "ગુજરાતી", speech: "gu-IN", placeholder: "તમારો સંદેશ લખો…" },
  { value: "hi", label: "हिन्दी", speech: "hi-IN", placeholder: "अपना संदेश लिखें…" },
];
const MAX_FILE = 5 * 1024 * 1024;
const MAX_VOICE_SEC = 180;

const STATUS_PILL: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 ring-amber-600/20",
  ANSWERED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CLOSED: "bg-gray-100 text-gray-500 ring-gray-400/20",
};

export function QueryDesk({ mode }: { mode: "me" | "hr" }) {
  const myId = useAuthStore((s) => s.user?.id);
  const [list, setList] = useState<QueryApi[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [thread, setThread] = useState<QueryApi | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<"active" | "all" | "closed">("active");
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    try {
      setList(await (mode === "hr" ? getAllQueries() : getMyQueries()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load queries.");
      setList([]);
    }
  }, [mode]);

  useEffect(() => {
    void loadList();
    const id = new URLSearchParams(window.location.search).get("open");
    if (id && Number(id)) setOpenId(Number(id));
  }, [loadList]);

  useEffect(() => {
    if (openId == null) return setThread(null);
    let live = true;
    getQuery(openId)
      .then((q) => live && setThread(q))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't open this query."));
    return () => { live = false; };
  }, [openId]);

  // Pick up replies while the thread is open.
  useEffect(() => {
    if (openId == null) return;
    const t = setInterval(() => {
      getQuery(openId).then(setThread).catch(() => {});
      void loadList();
    }, 30_000);
    return () => clearInterval(t);
  }, [openId, loadList]);

  const shown = (list ?? []).filter((q) =>
    filter === "all" ? true : filter === "closed" ? q.status === "CLOSED" : q.status !== "CLOSED",
  );
  // Waiting on me: for HR, the employee spoke last; for the employee, HR did.
  const waitingOnMe = (q: QueryApi) => q.status !== "CLOSED" && (mode === "hr" ? !q.lastFromHr : q.lastFromHr);

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-3">
        {mode === "me" && (
          <button
            onClick={() => { setComposing(true); setOpenId(null); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus size={15} /> New query to HR
          </button>
        )}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs">
          {(["active", "closed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md px-2 py-1.5 font-medium ${filter === f ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
            >
              {f === "active" ? "Open" : f === "closed" ? "Closed" : "All"}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {list == null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400"><Spinner size={14} className="text-brand-accent" /> Loading…</div>
          ) : shown.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              {mode === "me" ? "No queries yet. Ask HR anything — salary, leave, attendance, documents." : "No queries here."}
            </div>
          ) : (
            <ul className="max-h-[65vh] divide-y divide-gray-100 overflow-y-auto">
              {shown.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() => { setOpenId(q.id); setComposing(false); }}
                    className={`w-full px-4 py-3 text-left transition ${openId === q.id ? "bg-cyan-50/60" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-800">{q.subject}</span>
                      {waitingOnMe(q) && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" title="Waiting on you" />}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                      <span className={`rounded-full px-1.5 py-0.5 font-semibold ring-1 ring-inset ${STATUS_PILL[q.status]}`}>
                        {q.status === "ANSWERED" ? "Answered" : q.status === "OPEN" ? "Open" : "Closed"}
                      </span>
                      {mode === "hr" && <span className="font-medium text-gray-600">{q.memberName}</span>}
                      {q.category && <span>· {q.category}</span>}
                      <span>· {formatDateTimeIST(q.lastMessageAt ?? q.createdAt)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        {composing ? (
          <NewQuery
            onCancel={() => setComposing(false)}
            onRaised={(q) => { setComposing(false); setOpenId(q.id); setThread(q); void loadList(); }}
          />
        ) : thread ? (
          <Thread
            q={thread}
            mode={mode}
            myId={myId}
            onChanged={(q) => { setThread(q); void loadList(); }}
          />
        ) : (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 text-center text-sm text-gray-400">
            {mode === "me" ? "Pick a query on the left, or start a new one." : "Pick a query on the left to read and reply."}
          </div>
        )}
      </div>
    </div>
  );
}

function NewQuery({ onCancel, onRaised }: { onCancel: () => void; onRaised: (q: QueryApi) => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(QUERY_CATEGORIES[0]);
  const [to, setTo] = useState("");
  const [hr, setHr] = useState<HrPersonApi[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    getHrPeople().then(setHr).catch(() => setHr([]));
  }, []);

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">New query to HR</h3>
        <button onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-gray-500">Subject *</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" placeholder="e.g. October salary is short / મારો પગાર / वेतन" maxLength={200} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">About</span>
          <Select value={category} onChange={setCategory} options={QUERY_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Send to</span>
          <Select
            value={to}
            onChange={setTo}
            options={[{ value: "", label: "HR team (everyone in HR)" }, ...hr.map((p) => ({ value: String(p.id), label: `${p.fullName} · ${p.roleName}` }))]}
          />
        </label>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Composer
        sendLabel="Send to HR"
        onSend={async (m) => {
          if (!subject.trim()) {
            setError("Give your query a short subject.");
            return false;
          }
          try {
            onRaised(await raiseQuery({ subject: subject.trim(), category, assignedTo: to ? Number(to) : null, message: m }));
            return true;
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't send your query.");
            return false;
          }
        }}
      />
    </div>
  );
}

function Thread({ q, mode, myId, onChanged }: { q: QueryApi; mode: "me" | "hr"; myId?: number; onChanged: (q: QueryApi) => void }) {
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [q.messages?.length]);

  async function status(s: "OPEN" | "CLOSED") {
    try {
      onChanged(await setQueryStatus(q.id, s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update this query.");
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{q.subject}</div>
          <div className="mt-0.5 text-xs text-gray-500">
            {mode === "hr" ? `${q.memberName ?? "—"} · ` : ""}
            {q.category ?? "General"} · to {q.assignedToName ?? "HR team"} · raised {formatDateTimeIST(q.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_PILL[q.status]}`}>
            {q.status === "ANSWERED" ? "Answered" : q.status === "OPEN" ? "Open" : "Closed"}
          </span>
          {q.status === "CLOSED" ? (
            <button onClick={() => void status("OPEN")} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
              <RotateCcw size={12} /> Reopen
            </button>
          ) : (
            <button onClick={() => void status("CLOSED")} className="flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
              <CheckCircle2 size={12} /> {mode === "me" ? "Solved — close" : "Close"}
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[55vh] min-h-[200px] space-y-3 overflow-y-auto bg-gray-50/50 px-4 py-4">
        {(q.messages ?? []).map((m) => {
          const mine = m.authorId === myId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? "rounded-br-sm bg-brand-accent text-white" : "rounded-bl-sm bg-white text-gray-800 ring-1 ring-gray-200"}`}>
                <div className={`mb-0.5 text-[11px] font-medium ${mine ? "text-white/80" : "text-gray-500"}`}>
                  {m.authorName ?? "—"}{m.fromHr ? " · HR" : ""}
                </div>
                {m.body && (
                  <p lang={m.language ?? undefined} className="whitespace-pre-wrap break-words">{m.body}</p>
                )}
                {m.hasVoice && <VoiceNote messageId={m.id} seconds={m.voiceSeconds} light={mine} />}
                {m.hasAttachment && (
                  <button
                    onClick={async () => {
                      const { dataUrl } = await getQueryMedia(m.id, "attachment");
                      previewFile({ name: m.attachmentName ?? "attachment", url: dataUrl });
                    }}
                    className={`mt-1.5 flex items-center gap-1 text-xs underline-offset-2 hover:underline ${mine ? "text-white" : "text-brand-accent"}`}
                  >
                    <Paperclip size={12} /> {m.attachmentName ?? "Attachment"}
                  </button>
                )}
                <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>{formatDateTimeIST(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="px-4 pt-2 text-sm text-rose-600">{error}</p>}
      <div className="border-t border-gray-100 p-3">
        {q.status === "CLOSED" && mode === "hr" ? (
          <p className="text-center text-xs text-gray-400">Closed. Reopen it to reply.</p>
        ) : (
          <Composer
            sendLabel={mode === "hr" ? "Reply" : "Send"}
            onSend={async (m) => {
              try {
                onChanged(await replyQuery(q.id, m));
                return true;
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't send.");
                return false;
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function VoiceNote({ messageId, seconds, light }: { messageId: number; seconds: number | null; light: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (url) return <audio src={url} controls autoPlay className="mt-1 h-9 w-56 max-w-full" />;
  return (
    <button
      onClick={async () => {
        setLoading(true);
        try {
          setUrl((await getQueryMedia(messageId, "voice")).dataUrl);
        } finally {
          setLoading(false);
        }
      }}
      className={`mt-1 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${light ? "bg-white/20 text-white" : "bg-cyan-50 text-brand-accent"}`}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />} Voice note{seconds ? ` · ${fmtSec(seconds)}` : ""}
    </button>
  );
}

// ---------------------------------------------------------------- composer

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

/** Text (typed or dictated) + a file + a voice note. Resolves true when sent, so it can clear. */
function Composer({ sendLabel, onSend }: { sendLabel: string; onSend: (m: MessageBody) => Promise<boolean> }) {
  const [lang, setLang] = useState<QueryLanguage>(() => {
    try { return (localStorage.getItem("hitech.query.lang") as QueryLanguage) || "en"; } catch { return "en"; }
  });
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [voice, setVoice] = useState<{ dataUrl: string; seconds: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const speech = useRef<SpeechRec | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const langDef = LANGS.find((l) => l.value === lang)!;
  const SpeechCtor =
    typeof window === "undefined"
      ? null
      : ((window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition ??
        null);

  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    speech.current?.stop();
  }, []);

  function pickLang(v: QueryLanguage) {
    setLang(v);
    try { localStorage.setItem("hitech.query.lang", v); } catch {}
  }

  async function startRecording() {
    setNote("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNote("This browser can't record audio. Type or attach a file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        const secs = recSecRef.current;
        reader.onload = () => setVoice({ dataUrl: String(reader.result), seconds: secs });
        reader.readAsDataURL(blob);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setRecSec(0);
      recSecRef.current = 0;
      tick.current = setInterval(() => {
        recSecRef.current += 1;
        setRecSec(recSecRef.current);
        if (recSecRef.current >= MAX_VOICE_SEC) stopRecording();
      }, 1000);
    } catch {
      setNote("Microphone permission was refused — allow it in the browser to record a voice note.");
    }
  }
  const recSecRef = useRef(0);
  function stopRecording() {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    setRecording(false);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function toggleDictation() {
    setNote("");
    if (dictating) {
      speech.current?.stop();
      return;
    }
    if (!SpeechCtor) {
      setNote("Speech-to-text isn't available in this browser — record a voice note instead.");
      return;
    }
    const rec = new SpeechCtor();
    rec.lang = langDef.speech;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript;
      if (said.trim()) setText((t) => (t ? `${t.trimEnd()} ${said.trim()}` : said.trim()));
    };
    rec.onend = () => setDictating(false);
    rec.onerror = (e) => {
      setDictating(false);
      if (e.error === "not-allowed") setNote("Microphone permission was refused.");
      else if (e.error === "language-not-supported") setNote(`Speech-to-text doesn't support ${langDef.label} here — record a voice note instead.`);
    };
    speech.current = rec;
    rec.start();
    setDictating(true);
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE) {
      setNote("That file is over 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFile({ name: f.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(f);
  }

  async function send() {
    if (!text.trim() && !file && !voice) {
      setNote("Write something, attach a file or record a voice note.");
      return;
    }
    setBusy(true);
    const ok = await onSend({
      body: text.trim() || null,
      language: lang,
      attachmentName: file?.name ?? null,
      attachment: file?.dataUrl ?? null,
      voice: voice?.dataUrl ?? null,
      voiceSeconds: voice?.seconds ?? null,
    });
    setBusy(false);
    if (ok) {
      setText("");
      setFile(null);
      setVoice(null);
      setNote("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-400">Language</span>
        {LANGS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => pickLang(l.value)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${lang === l.value ? "bg-navy text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        lang={lang}
        rows={3}
        placeholder={langDef.placeholder}
        className="input resize-y text-sm"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(); }}
      />
      {(file || voice) && (
        <div className="flex flex-wrap gap-2">
          {file && (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
              <Paperclip size={12} /> {file.name}
              <button onClick={() => setFile(null)} className="text-gray-400 hover:text-rose-600"><X size={12} /></button>
            </span>
          )}
          {voice && (
            <span className="flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs text-brand-accent">
              <audio src={voice.dataUrl} controls className="h-7 w-44" />
              {fmtSec(voice.seconds)}
              <button onClick={() => setVoice(null)} title="Discard voice note" className="text-gray-400 hover:text-rose-600"><Trash2 size={12} /></button>
            </span>
          )}
        </div>
      )}
      {note && <p className="text-xs text-amber-700">{note}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={fileInput} type="file" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            <Paperclip size={13} /> Attach
          </button>
          {recording ? (
            <button type="button" onClick={stopRecording} className="flex animate-pulse items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white">
              <Square size={12} /> Stop · {fmtSec(recSec)}
            </button>
          ) : (
            <button type="button" onClick={() => void startRecording()} disabled={!!voice} title="Record a voice note (up to 3 minutes)" className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              <Mic size={13} /> Voice note
            </button>
          )}
          <button
            type="button"
            onClick={toggleDictation}
            title={`Speak and it is typed for you in ${langDef.label}`}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${dictating ? "border-brand-accent bg-cyan-50 text-brand-accent" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {dictating ? <MicOff size={13} /> : <Mic size={13} />} {dictating ? "Stop typing by voice" : `Speak to type (${langDef.label})`}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || recording}
          className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {sendLabel}
        </button>
      </div>
    </div>
  );
}

function fmtSec(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
