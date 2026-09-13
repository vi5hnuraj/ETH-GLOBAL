# GlobalPay — 4-Minute Demo Script

## 🎬 PRE-RECORDING CHECKLIST

- [ ] All pages clean (no test/debug names)
- [ ] Dashboard green health indicators
- [ ] At least 1 agent with World ID verification showing green
- [ ] At least 1 completed Arc transaction with visible tx hash
- [ ] Trust Engine showing real provider rankings
- [ ] Browser: Chrome full-screen (F11), 1080p, zoom 100%, hidden bookmarks
- [ ] Microphone: wired earphones, quiet room, 3 practice runs
- [ ] Recording: OBS 1920x1080 @ 30fps, no music

---

## 📋 SLIDE 1 — THE PROBLEM (0:00–0:15)

**Visual:** Simple slide with this text:

> AI agents can make decisions. But can they safely transact with unknown services?

**Voiceover:**

> "AI agents are becoming capable of performing tasks, but they still struggle with one important problem: how can an agent safely buy services from another agent it does not know?"

Keep this under 15 seconds.

---

## 📋 SLIDE 2 — WHAT IS GLOBALPAY (0:15–0:35)

**Visual:** Show GlobalPay logo + one clean architecture diagram:

```
Human-backed identity
        +
On-chain trust evidence
        +
USDC payments
        +
Autonomous agents
```

**Voiceover:**

> "We built GlobalPay, a trusted commerce infrastructure for autonomous AI agents.
> 
> GlobalPay allows an agent to discover services, evaluate providers using real settlement evidence from The Graph, pay with USDC on Arc, and verify the result after payment.
> 
> The goal is simple: make autonomous agent commerce trustworthy, programmable, and verifiable."

---

## 💻 LIVE DEMO — THE CORE STORY (0:35–2:35)

**This is the most important part. Spend 2 minutes showing the product.**

### Step 1: Show the Agent (0:35–0:45)
**Screen:** `/developer/agents`
- Click on an agent to show it has a wallet, API key, and World ID verification
- Point out: "This agent has a real wallet and is backed by a verified human"

**Voiceover:**
> "Here is our consumer agent. It has its own wallet on Arc and is backed by a verified human through World ID."

### Step 2: Show Trust Engine (0:45–1:15)
**Screen:** `/developer/graph-intelligence`
- Show the Graph sync status (Live, indexed block, payments)
- Ask a question: "Which provider is safest?"
- Show the ranked results with trust scores

**Voiceover:**
> "Before paying, the agent checks real on-chain evidence through The Graph. This shows which providers have successful payment history, how much USDC they've earned, and their trust score. World ID proves identity. The Graph measures economic reliability."

### Step 3: Show Marketplace (1:15–1:35)
**Screen:** `/developer/marketplace`
- Browse services, show OCR service card
- Point out: provider trust score, price, human-backed badge

**Voiceover:**
> "The agent discovers services in our marketplace. Each service shows its provider's trust evidence, pricing, and whether the publisher is human-verified."

### Step 4: Show Autonomous Commerce (1:35–2:15)
**Screen:** `/developer/commerce/autonomous`
- Enter goal: "Find the safest OCR provider and purchase one credit"
- Show the 4 stages: Observe → Decide → Pay → Verify
- Run the goal (may need pre-seeded data)
- Show the result: provider chosen, trust score, Arc transaction hash, Graph verification

**Voiceover:**
> "Now watch the autonomous flow. The agent receives a natural language goal. It evaluates providers using Graph evidence, checks procurement policy, pays with USDC on Arc, and verifies the settlement on-chain. Every step is transparent and verifiable."

### Step 5: Show AI Assistant (2:15–2:35)
**Screen:** `/developer/assistant`
- Ask: "Which OCR provider should this agent trust and why?"
- Show the response with provider comparison

**Voiceover:**
> "The AI assistant can answer questions about provider trust, compare providers, and execute purchases — all with policy controls."

---

## 📋 SLIDE 3 — ARCHITECTURE (2:35–3:05)

**Visual:** Four-layer architecture diagram:

```
┌─────────────────────────────────────────┐
│  The Graph                              │
│  Trust + settlement evidence            │
├─────────────────────────────────────────┤
│  Arc + USDC                             │
│  On-chain payment settlement            │
├─────────────────────────────────────────┤
│  World ID / AgentBook                   │
│  Human-backed agent identity            │
├─────────────────────────────────────────┤
│  AI Operator                            │
│  Policy-controlled autonomous execution │
└─────────────────────────────────────────┘
```

**Voiceover:**
> "GlobalPay combines four layers:
> 1. The Graph provides trust and settlement evidence from real on-chain payments
> 2. Arc + USDC handles payment settlement with native stablecoin
> 3. World ID and AgentBook provide human-backed identity
> 4. The AI Operator enables policy-controlled autonomous execution
> 
> Together, they create a complete trust loop: discover → trust → pay → verify → build reputation."

---

## 📋 SLIDE 4 — CLOSING (3:05–3:55)

**Visual:** Show the final flow in large text:

```
Discover → Trust → Pay → Verify → Reputation
```

**Voiceover:**

> "GlobalPay is not just a wallet, a marketplace, or a chatbot.
> 
> It is a trust and payment layer for autonomous AI commerce.
> 
> An agent can discover a service, determine who to trust using on-chain evidence, pay with USDC, verify the settlement, and build a reputation from real economic activity.
> 
> Our vision is a world where AI agents can safely discover, purchase, and provide services without requiring a human to manually approve every small transaction.
> 
> This is GlobalPay."

End with logo and one-line pitch:

> **GlobalPay — Trusted commerce infrastructure for autonomous AI agents.**

---

## 🎯 KEY TIPS

1. **Don't rush** — speak clearly, pause between sections
2. **One story** — agent needs OCR → Graph proves trust → agent pays → settlement verified
3. **Show evidence** — point to tx hashes, trust scores, verification badges
4. **No features list** — show the story, not every page
5. **Policy controls** — mention "autonomy without losing control" when showing the AI Operator

---

## 🚫 WHAT NOT TO SHOW

- Dashboard analytics
- API keys management
- Webhook configuration
- Billing plans
- Organization settings
- Long code
- Terminal logs
- Every marketplace filter
- All 17 playground tests

---

## 📝 ONE-LINE PITCH (Memorize This)

> "GlobalPay gives autonomous AI agents a trusted way to discover services, evaluate providers using on-chain evidence, pay with USDC on Arc, and verify settlement automatically."

---

## 🎬 CLOSING LINE (Memorize This)

> "AI agents should not only be able to act. They should know who to trust, be able to pay, and leave verifiable evidence behind. GlobalPay makes that possible."
