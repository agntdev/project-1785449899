# Arabic Post Generator — Bot specification

**Archetype:** content

**Voice:** casual and conversational — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot that generates Arabic social media posts (3-5 sentences) with a scoring table based on user topics. Outputs casual, comment-prompting content with evaluation criteria in Arabic.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- general public
- Arabic speakers

## Success criteria

- Generates Arabic post+evaluation table on /start
- Stores last 100 topics/posts
- Offers regeneration option after output

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Prompt for Arabic topic input
- **Generate Again** (button, actor: user, callback: regenerate) — Request new post for same topic

## Flows

### Post Generation
_Trigger:_ /start

1. Ask 'ما موضوع المنشور؟'
2. Receive topic input
3. Generate Arabic post (3-5 sentences)
4. Generate 8-row evaluation table
5. Send final output
6. Offer regeneration option

_Data touched:_ user_topic, final_post, evaluation_table

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`env.<KEY>` on Workers). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **OPENAI_API_KEY** — so the bot can craft the Arabic post and evaluation table
  - may be UNSET at runtime: the bot must still start, and the feature needing OPENAI_API_KEY must say so plainly instead of failing.
- **ADMIN_CHAT_ID** — where alerts about new generations are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` — never ask a user, never treat whoever writes first as the admin.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **user_topic** _(retention: persistent)_ — User-provided topic phrase (Arabic or any language)
  - fields: text, language
- **final_post** _(retention: persistent)_ — Generated Arabic social media content
  - fields: content, tone
- **evaluation_table** _(retention: session)_ — 8-criteria scoring table with 1-10 ratings and reasons
  - fields: criteria, scores, reasons
- **generation_history** _(retention: persistent)_ — Last 100 topic-post pairs
  - fields: topic, post, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging
- **OpenAI** (required) — Content generation
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View generation history
- Configure admin chat alerts (optional)

## Notifications

- Admin alerts when new post generated (if ADMIN_CHAT_ID configured)

## Permissions & privacy

- Stores last 100 topic-post pairs for duplicate prevention and review
- Only admin chat receives alerts if configured

## Edge cases

- User input in non-Arabic languages (converted to Arabic output)
- Topic input with special characters or emojis
- Requests for regeneration without prior topic

## Required tests

- End-to-end flow from /start to regeneration
- Arabic output validation for 3-5 sentences and CTA
- History storage of 100 items

## Assumptions

- OpenAI API handles Arabic generation quality
- ADMIN_CHAT_ID is optional configuration
