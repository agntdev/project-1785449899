import { Composer } from "grammy";
import type { Ctx, EvaluationRow } from "../bot.js";
import { inlineButton, inlineKeyboard, PersistentStore, type PersistentBindings } from "../toolkit/index.js";
import { now } from "../time.js";

interface GeneratedContent {
  post: string;
  evaluation: EvaluationRow[];
}

export interface HistoryItem {
  topic: string;
  post: string;
  timestamp: string;
}

type RuntimeCtx = Ctx & { env?: PersistentBindings & { OPENAI_API_KEY?: string; ADMIN_CHAT_ID?: string } };

const composer = new Composer<Ctx>();

export function userKey(userId: number): string {
  return `arabic-post:user:${userId}`;
}

function runtimeEnv(ctx: Ctx): RuntimeCtx["env"] {
  return (ctx as RuntimeCtx).env;
}

function setting(ctx: Ctx, name: "OPENAI_API_KEY" | "ADMIN_CHAT_ID"): string | undefined {
  const workerValue = runtimeEnv(ctx)?.[name];
  if (workerValue) return workerValue;
  return typeof process === "undefined" ? undefined : process.env[name];
}

function store(ctx: Ctx): PersistentStore {
  return new PersistentStore(runtimeEnv(ctx));
}

function historyKey(key: string): string {
  return `${key}:history`;
}

export async function historyFor(ctx: Ctx, key: string): Promise<HistoryItem[]> {
  return (await store(ctx).read<HistoryItem[]>(historyKey(key))) ?? [];
}

export function retainRecent(items: HistoryItem[]): HistoryItem[] {
  return items.slice(0, 100);
}

async function saveGeneration(ctx: Ctx, topic: string, post: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const key = userKey(from.id);
  const db = store(ctx);
  const history = await historyFor(ctx, key);
  const record: HistoryItem = { topic, post, timestamp: now().toISOString() };
  const next = retainRecent([record, ...history]);
  await db.write(key, { topic, language: detectLanguage(topic) });
  await db.write(historyKey(key), next);
  const allHistory = (await db.read<HistoryItem[]>("arabic-post:history")) ?? [];
  await db.write("arabic-post:history", retainRecent([record, ...allHistory]));
}

export async function adminHistory(ctx: Ctx): Promise<HistoryItem[]> {
  return (await store(ctx).read<HistoryItem[]>("arabic-post:history")) ?? [];
}

export function configuredAdmin(ctx: Ctx): string | undefined {
  return setting(ctx, "ADMIN_CHAT_ID");
}

function detectLanguage(text: string): string {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "other";
}

function sentenceCount(text: string): number {
  return text.split(/[.!؟]+/u).map((part) => part.trim()).filter(Boolean).length;
}

function hasCta(text: string): boolean {
  return /(اكتب|شاركونا|شاركنا|قل لنا|أخبرنا|ما رأيك|علّق|اخبرنا)/u.test(text);
}

function validContent(content: GeneratedContent): boolean {
  return (
    typeof content.post === "string" &&
    /[\u0600-\u06FF]/u.test(content.post) &&
    sentenceCount(content.post) >= 3 &&
    sentenceCount(content.post) <= 5 &&
    hasCta(content.post) &&
    Array.isArray(content.evaluation) &&
    content.evaluation.length === 8 &&
    content.evaluation.every(
      (row) =>
        typeof row?.criterion === "string" &&
        typeof row?.reason === "string" &&
        Number.isInteger(row?.score) &&
        row.score >= 1 &&
        row.score <= 10,
    )
  );
}

async function openAi(topic: string, apiKey: string): Promise<GeneratedContent> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "أنت كاتب محتوى عربي اجتماعي. أعد JSON فقط بالشكل {post:string,evaluation:[{criterion:string,score:number,reason:string}]}. اكتب post بالعربية العامية الخفيفة من 3 إلى 5 جمل، وضمنه دعوة واضحة للتعليقات. أنشئ 8 صفوف تقييم بالضبط، وكل score عدد صحيح من 1 إلى 10 وreason عربي قصير.",
        },
        { role: "user", content: `الموضوع: ${topic}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");
  return JSON.parse(content) as GeneratedContent;
}

function formatOutput(content: GeneratedContent): string {
  const table = content.evaluation
    .map((row, index) => `${index + 1}. ${row.criterion}: ${row.score}/10 — ${row.reason}`)
    .join("\n");
  return `${content.post}\n\nالتقييم:\n${table}`;
}

async function alertAdmin(ctx: Ctx, topic: string): Promise<void> {
  const adminChatId = setting(ctx, "ADMIN_CHAT_ID");
  if (!adminChatId) return;
  try {
    await ctx.api.sendMessage(adminChatId, `تم إنشاء منشور جديد عن: ${topic}`);
  } catch {
    // Alerts are optional and must never block the user's generated post.
  }
}

export async function generateForTopic(ctx: Ctx, topic: string): Promise<void> {
  const apiKey = setting(ctx, "OPENAI_API_KEY");
  if (!apiKey) {
    await ctx.reply("ميزة إنشاء المنشور مو مُعدّة بعد — جرّب لاحقًا.");
    return;
  }
  await ctx.replyWithChatAction("typing");
  try {
    let generated = await openAi(topic, apiKey);
    if (!validContent(generated)) generated = await openAi(topic, apiKey);
    if (!validContent(generated)) {
      await ctx.reply("ما طلعت النتيجة بالشكل المطلوب — جرّب مرة أخرى.");
      return;
    }
    const output = formatOutput(generated);
    if (output.length > 4096) {
      await ctx.reply("النتيجة طويلة أكثر من اللازم — جرّب موضوعًا أقصر.");
      return;
    }
    ctx.session.step = "idle";
    ctx.session.lastTopic = topic;
    ctx.session.evaluationTable = generated.evaluation;
    try {
      await saveGeneration(ctx, topic, generated.post);
    } catch {
      await ctx.reply("أنشأت المنشور، لكن ما قدرت أحفظه في السجل الآن.");
    }
    await ctx.reply(output, {
      reply_markup: inlineKeyboard([[inlineButton("إنشاء مرة أخرى", "regenerate")]]),
    });
    await alertAdmin(ctx, topic);
  } catch {
    await ctx.reply("ما قدرت أوصل لمحرّك الكتابة الآن — جرّب بعد قليل.");
  }
}

composer.on("message:text", async (ctx, next) => {
  if (ctx.message.text.startsWith("/")) return next();
  const topic = ctx.message.text.trim();
  if (ctx.session.step !== "awaiting_topic") return next();
  if (!topic) {
    await ctx.reply("اكتب موضوعًا قصيرًا لنبدأ.");
    return;
  }
  if (topic.length > 500) {
    await ctx.reply("خلّ الموضوع أقصر من 500 حرف، ثم أرسله مرة ثانية.");
    return;
  }
  ctx.session.lastTopic = topic;
  await generateForTopic(ctx, topic);
});

export default composer;
