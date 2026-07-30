import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { adminHistory, configuredAdmin } from "./generation.js";

registerMainMenuItem({ label: "سجل المنشورات", data: "history:show", order: 10 });

const composer = new Composer<Ctx>();

composer.callbackQuery("history:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const adminChatId = configuredAdmin(ctx);
  if (!adminChatId) {
    await ctx.reply("سجل المالك مو مُعدّ بعد.");
    return;
  }
  if (String(ctx.chat?.id) !== adminChatId) {
    await ctx.reply("هذا السجل للمالك فقط.");
    return;
  }
  try {
    const history = await adminHistory(ctx);
    if (history.length === 0) {
      await ctx.reply("ما فيه منشورات محفوظة بعد — أرسل موضوعًا لنبدأ.");
      return;
    }
    const recent = history.slice(0, 10);
    await ctx.reply(`آخر ${recent.length} مواضيع منشأة:\n${recent.map((item, index) => `${index + 1}. ${item.topic}`).join("\n")}`);
  } catch {
    await ctx.reply("ما قدرت أفتح السجل الآن — جرّب بعد قليل.");
  }
});

export default composer;
