import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { generateForTopic } from "./generation.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("regenerate", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.lastTopic) {
    ctx.session.step = "awaiting_topic";
    await ctx.reply("ما عندي موضوع سابق — أرسل موضوعك أولًا.");
    return;
  }
  await generateForTopic(ctx, ctx.session.lastTopic);
});

export default composer;
