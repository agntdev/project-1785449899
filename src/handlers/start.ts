import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, mainMenuKeyboard } from "../toolkit/index.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

export const TOPIC_PROMPT = "ما موضوع المنشور؟";

const topicKeyboard = () => {
  const menu = mainMenuKeyboard();
  return inlineKeyboard([
    ...menu.inline_keyboard.filter((row) =>
      row.some((button) => "callback_data" in button && button.callback_data === "history:show"),
    ),
    [inlineButton("مساعدة", "menu:help")],
  ]);
};

composer.command("start", async (ctx) => {
  ctx.session.step = "awaiting_topic";
  await ctx.reply(TOPIC_PROMPT, {
    reply_markup: topicKeyboard(),
  });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_topic";
  await ctx.editMessageText(TOPIC_PROMPT, { reply_markup: topicKeyboard() });
});

export default composer;
