# Claude for BTC stack — isolation from SoulMatch

## Rule
BTC stack Claude calls must NEVER share SoulMatch billing, usage meters, or prompt routes.

## How
1. Run only inside `tv-stack-listener` (separate Vercel project / repo).
2. Use a dedicated env key name, e.g. `BTC_STACK_ANTHROPIC_API_KEY` (not SoulMatch `ANTHROPIC_API_KEY` in the SoulMatch app).
3. Optional: separate Anthropic workspace / billing project for BTC.
4. Log usage to listener only (`btc_claude_usage`), never to SoulMatch cost tables.
5. Do not import SoulMatch `lib/` Claude helpers into the listener.

## Product split
- SoulMatch site = relationship product Claude (existing).
- BTC Stack = facts_v2 + local rules + optional Hebrew analog brief (this prompt).

## Prompt file
`prompt-daytrader-he-v2.md`
