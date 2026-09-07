import { toolDefinitions, executeTool } from '../services/toolRegistry.js';
import logger from '../utils/logger.js';
export const handleAgentChat = async (req, res) => {
  try {
    const { message, timezoneOffset } = req.body;
    const user = req.user;
    const accessToken = req.header('Authorization')?.replace('Bearer ', '');

    // timezoneOffset from JS Date.getTimezoneOffset(): minutes WEST of UTC
    // e.g. IST is UTC+5:30, so JS returns -330
    // Shift 'now' by -tzOffsetMinutes to simulate user's local clock on UTC server
    const tzOffsetMinutes = typeof timezoneOffset === 'number' ? timezoneOffset : 0;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message content is required" });
    }

    const groqApiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;

    // Convert toolDefinitions to OpenAI / Groq tool format
    const tools = toolDefinitions.map(def => ({
      type: "function",
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters
      }
    }));

const systemPrompt = `
You are the AI Remittance Agent for GlobalPay.
Your task is to assist users with financial actions: sending USDC tokens, checking balance, getting transaction history, paying merchants, paying QR codes, finding users, scheduling payments, and creating invoices.

Always select and call the appropriate tool when the user's intent matches one of the available functions:
- sendBot: Send USDC or crypto tokens to a recipient (e.g., "Send 25 USDC to @alice").
- payMerchant: Pay a merchant (e.g., "Pay merchant Starbucks 15 USDC").
- payQR: Pay a QR code payload or address (e.g., "Pay this QR").
- checkBalance: Check available fiat and crypto balance (e.g., "Show my balance").
- getTransactionHistory: View recent activity log (e.g., "Show my transactions").
- findUser: Search for a user (e.g., "Find user @alice").
- schedulePayment: Schedule a payment for later (e.g., "Schedule 10 USDC to @bob tomorrow").
- createInvoice: Create an invoice (e.g., "Create invoice 50 USDC").
- getRate: Get the live USDC/USD exchange rate (e.g., "What's the USDC price?" or "Show rate").
- getWallet: Show your wallet addresses (e.g., "Show my wallet").
- switchPrimary: Switch primary receiving wallet (e.g., "Switch to external wallet").
- getHelp: List all commands (e.g., "What can you do?" or "Help").

Never output raw code. Choose the best matching tool to execute backend actions.
    `;

    let toolCallResult = null;
    let aiResponseText = "";
    let executedTool = null;

    if (groqApiKey && groqApiKey !== 'dummy_key') {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: message }
            ],
            tools: tools,
            tool_choice: "auto"
          })
        });

        const data = await response.json();
        const choice = data?.choices?.[0]?.message;

        if (choice?.tool_calls && choice.tool_calls.length > 0) {
          const toolCall = choice.tool_calls[0];
          const toolName = toolCall.function.name;
          const args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;

          executedTool = toolName;
          // Treat an LLM-generated schedule datetime as the user's local wall
          // clock, then convert to the correct absolute UTC instant using the
          // timezone offset the browser reported (IST -> fires at local time).
          if (toolName === 'schedulePayment' && typeof args?.date === 'string') {
            const d = new Date(args.date);
            if (!isNaN(d.getTime())) {
              args.date = new Date(d.getTime() + tzOffsetMinutes * 60 * 1000).toISOString();
            }
          }
          toolCallResult = await executeTool(toolName, args, user, accessToken, { timezoneOffset: tzOffsetMinutes });
          aiResponseText = toolCallResult.message || `Executed tool ${toolName}`;
        } else if (choice?.content) {
          aiResponseText = choice.content;
        }
      } catch (groqErr) {
        logger.error("Groq API error:", groqErr.message || groqErr);
      }
    }

    // Fallback Tool Execution if Groq API key is missing or didn't return a tool_call
    if (!executedTool) {
      const lower = message.toLowerCase();

      // Tag extraction regex helper (@user_gl, upiTag, email)
      const extractTag = (str) => {
        const tagMatch = str.match(/(@[\w_]+|upi[\w_]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/i);
        return tagMatch ? tagMatch[1] : null;
      };

      const extractAmount = (str) => {
        const amountMatch = str.match(/(\d+(?:\.\d+)?)/);
        return amountMatch ? parseFloat(amountMatch[1]) : 10;
      };

      const extractCurrency = (str) => /\bUSD\b|\$/i.test(str) ? 'USD' : 'USDC';

      const parseScheduleDate = (str) => {
        const lower = str.toLowerCase();
        // nowUtc is the absolute current time (UTC)
        const nowUtc = new Date();
        // localNow represents the user's wall clock (shifted by the negative timezone offset)
        const localNow = new Date(Date.now() - tzOffsetMinutes * 60 * 1000);

        const parseTime = (str) => {
          const m = str.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
          if (!m) return null;
          let hours = parseInt(m[1]);
          const minutes = parseInt(m[2] || '0');
          const meridian = m[3];
          if (meridian === 'pm' && hours < 12) hours += 12;
          if (meridian === 'am' && hours === 12) hours = 0;
          return { hours, minutes };
        };

        // "today at 5pm" / "today at 5:30pm" / "today at 3.52pm"
        const todayMatch = lower.match(/tod(?:ay|at|y|ai)\s+at\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/i);
        if (todayMatch) {
          const t = parseTime(todayMatch[1]);
          if (t) {
            const targetUtc = new Date(nowUtc);
            targetUtc.setUTCHours(t.hours, t.minutes, 0, 0);
            const adjusted = new Date(targetUtc.getTime() + tzOffsetMinutes * 60 * 1000);
            if (adjusted <= nowUtc) {
              adjusted.setUTCDate(adjusted.getUTCDate() + 1);
            }
            return adjusted.toISOString();
          }
        }

        // "tomorrow at 3pm" / "tommorow" / "tmr" etc.
        const tomorrowMatch = lower.match(/(?:tomorrow|tommorow|tommorrow|tmr)(?:\s+at\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?))?/i);
        if (tomorrowMatch) {
          const d = new Date(nowUtc);
          d.setUTCDate(d.getUTCDate() + 1);
          let targetHours = 9;
          let targetMinutes = 0;
          if (tomorrowMatch[1]) {
            const t = parseTime(tomorrowMatch[1]);
            if (t) {
              targetHours = t.hours;
              targetMinutes = t.minutes;
            }
          }
          const targetUtc = new Date(d);
          targetUtc.setUTCHours(targetHours, targetMinutes, 0, 0);
          const adjusted = new Date(targetUtc.getTime() + tzOffsetMinutes * 60 * 1000);
          return adjusted.toISOString();
        }

        // "next monday at 10am" / "friday at 3pm" / "friday at 3.52pm"
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayMatch = lower.match(/(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at\s+(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?))?/i);
        if (dayMatch) {
          const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase());
          const currentLocalDay = localNow.getUTCDay(); // Day according to user's local clock
          let daysUntil = targetDay - currentLocalDay;
          if (daysUntil <= 0) daysUntil += 7;
          
          let targetHours = 9;
          let targetMinutes = 0;
          if (dayMatch[2]) {
            const t = parseTime(dayMatch[2]);
            if (t) {
              targetHours = t.hours;
              targetMinutes = t.minutes;
            }
          }
          
          const d = new Date(nowUtc);
          d.setUTCDate(d.getUTCDate() + daysUntil);
          const targetUtc = new Date(d);
          targetUtc.setUTCHours(targetHours, targetMinutes, 0, 0);
          const adjusted = new Date(targetUtc.getTime() + tzOffsetMinutes * 60 * 1000);
          return adjusted.toISOString();
        }

        // "in 3 days" / "in 5 hours"
        const inMatch = lower.match(/in\s+(\d+)\s+(day|days|hour|hours|minute|minutes)/i);
        if (inMatch) {
          const num = parseInt(inMatch[1]);
          const unit = inMatch[2].toLowerCase();
          const d = new Date(nowUtc);
          if (unit.startsWith('day')) d.setUTCDate(d.getUTCDate() + num);
          else if (unit.startsWith('hour')) d.setUTCHours(d.getUTCHours() + num);
          else if (unit.startsWith('minute')) d.setUTCMinutes(d.getUTCMinutes() + num);
          return d.toISOString();
        }

        // ISO date like "2026-08-15" or "2026-08-15T14:00"
        const isoMatch = str.match(/(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)/);
        if (isoMatch) {
          const d = new Date(isoMatch[1]);
          if (!isNaN(d.getTime())) return d.toISOString();
        }

        // Fallback: if a time like "2.08 am" or "5pm" is found with no recognized
        // date word, assume "today". Catches typos like "todat" or missing date word.
        const timeOnlyMatch = lower.match(/(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))/i);
        if (timeOnlyMatch) {
          const t = parseTime(timeOnlyMatch[1]);
          if (t) {
            const targetUtc = new Date(nowUtc);
            targetUtc.setUTCHours(t.hours, t.minutes, 0, 0);
            const adjusted = new Date(targetUtc.getTime() + tzOffsetMinutes * 60 * 1000);
            if (adjusted <= nowUtc) {
              adjusted.setUTCDate(adjusted.getUTCDate() + 1);
            }
            return adjusted.toISOString();
          }
        }

        return null;
      };

      // Exact /command prefix matching first
      const trimmed = message.trim();
      if (trimmed === '/rate' || trimmed === '/price') {
        executedTool = 'getRate';
        toolCallResult = await executeTool('getRate', {}, user, accessToken);
        aiResponseText = toolCallResult.message;
      } else if (trimmed === '/wallet' || trimmed === '/address') {
        executedTool = 'getWallet';
        toolCallResult = await executeTool('getWallet', {}, user, accessToken);
        aiResponseText = toolCallResult.message;
      } else if (trimmed === '/primary' || trimmed === '/switch') {
        executedTool = 'switchPrimary';
        toolCallResult = await executeTool('switchPrimary', {}, user, accessToken);
        aiResponseText = toolCallResult.message;
      } else if (trimmed === '/help' || trimmed === '/commands') {
        executedTool = 'getHelp';
        toolCallResult = await executeTool('getHelp', {}, user, accessToken);
        aiResponseText = toolCallResult.message;
      } else

        // Non-payment intents must be evaluated before the generic `pay`
        // branch: "schedule a payment" previously executed as a send.
        if (lower.includes('balance') || lower.includes('how much')) {
          executedTool = 'checkBalance';
          toolCallResult = await executeTool('checkBalance', {}, user, accessToken);
          aiResponseText = toolCallResult.message;
        } else if (lower.includes('transaction') || lower.includes('history') || lower.includes('activity')) {
          executedTool = 'getTransactionHistory';
          toolCallResult = await executeTool('getTransactionHistory', {}, user, accessToken);
          aiResponseText = toolCallResult.message;
        } else if (lower.includes('cancel')) {
          executedTool = 'cancelSchedulePayment';
          toolCallResult = await executeTool('cancelSchedulePayment', {}, user, accessToken);
          aiResponseText = toolCallResult.message;
        } else if (lower.includes('schedule')) {
          const amount = extractAmount(message);
          const recipient = extractTag(message);
          const date = parseScheduleDate(message);
          if (!recipient || amount <= 0) {
            aiResponseText = '💡 Use: Schedule 1 USDC to @username tomorrow at 3pm.';
          } else if (!date && (/(?:at|by|for)\s+\d/i.test(message) || /\d\s*(?:am|pm)/i.test(message))) {
            aiResponseText = '🤔 I found a time in your message but couldn\'t understand the date. Try: "Schedule 1 USDC to @username today at 5pm" or "tomorrow at 3pm".';
          } else {
            executedTool = 'schedulePayment';
            toolCallResult = await executeTool('schedulePayment', { recipient, amount, date }, user, accessToken, { timezoneOffset: tzOffsetMinutes });
            aiResponseText = toolCallResult.message;
          }
        } else if (lower.includes('invoice')) {
          const amount = extractAmount(message);
          const recipient = extractTag(message);
          aiResponseText = (!recipient || amount <= 0)
            ? '💡 Use: Create invoice 50 USD for @username.'
            : (executedTool = 'createInvoice', toolCallResult = await executeTool('createInvoice', { amount, recipient, currency: extractCurrency(message) }, user, accessToken), toolCallResult.message);
        } else if (lower.includes('rate') || lower.includes('price') || lower.includes('how much is bot') || lower.includes('bot price')) {
          executedTool = 'getRate';
          toolCallResult = await executeTool('getRate', {}, user, accessToken);
          aiResponseText = toolCallResult.message;
        } else if (lower.includes('wallet') || lower.includes('address') || (lower.includes('my') && lower.includes('wallet'))) {
          executedTool = 'getWallet';
          toolCallResult = await executeTool('getWallet', {}, user, accessToken);
          aiResponseText = toolCallResult.message;
        } else if (lower.includes('primary') || lower.includes('switch') || lower.includes('toggle')) {
          const target = lower.includes('external') ? 'external' : lower.includes('internal') ? 'internal' : undefined;
          executedTool = 'switchPrimary';
          toolCallResult = await executeTool('switchPrimary', { target }, user, accessToken);
          aiResponseText = toolCallResult.message;
        } else if (lower.includes('help') || lower.includes('what can you') || lower.includes('commands') || lower.includes('/help')) {
          executedTool = 'getHelp';
          toolCallResult = await executeTool('getHelp', {}, user, accessToken);
          aiResponseText = toolCallResult.message;
        } else if (lower.includes('find') || lower.includes('search') || lower.startsWith('who is')) {
          const query = extractTag(message) || message.replace(/^\/?(find|search|who is)\s*/i, '').trim();
          aiResponseText = !query
            ? '🔍 Please include a PayTag, email, or name—for example: Find user @alice.'
            : (executedTool = 'findUser', toolCallResult = await executeTool('findUser', { query }, user, accessToken), toolCallResult.message);
        } else if (lower.includes('send') || lower.includes('transfer') || lower.includes('pay')) {
          const amount = extractAmount(message);
          const recipient = extractTag(message);

          if (amount <= 0) {
            aiResponseText = '💡 Please enter an amount greater than zero.';
          } else if (lower.includes('qr') && !recipient) {
            aiResponseText = '📷 Please scan a QR code in the QR payment screen, or paste a valid QR PayTag/payload.';
          } else if (!recipient && !lower.includes('merchant') && !lower.includes('starbucks') && !lower.includes('amazon')) {
            aiResponseText = '💡 Include a recipient PayTag—for example: Send 5 USDC to @username.';
          } else if (lower.includes('merchant') || lower.includes('starbucks') || lower.includes('amazon')) {
            const merchantMatch = message.match(/(?:starbucks|amazon|walmart)/i);
            executedTool = 'payMerchant';
            toolCallResult = await executeTool('payMerchant', { merchant: merchantMatch ? merchantMatch[0] : 'Merchant', amount }, user, accessToken);
            aiResponseText = toolCallResult.message;
          } else if (lower.includes('qr')) {
            executedTool = 'payQR';
            toolCallResult = await executeTool('payQR', { qrData: recipient, amount }, user, accessToken);
            aiResponseText = toolCallResult.message;
          } else {
            executedTool = 'sendBot';
            toolCallResult = await executeTool('sendBot', { recipient, amount }, user, accessToken);
            aiResponseText = toolCallResult.message;
          }
        } else if (!aiResponseText) {
          aiResponseText = "👋 Hi! I'm your GlobalPay AI Agent. I can execute commands for you! Try:\n• 'Send 25 USDC to @alice'\n• 'Show my balance'\n• 'Show my transactions'\n• 'Show my wallet'\n• 'Switch to external wallet'\n• 'Schedule 5 USDC to @bob tomorrow at 3pm'\n• 'Create invoice 50 USDC'\n• 'Help'";
        }
    }

    return res.status(200).json({
      reply: aiResponseText,
      executedTool,
      toolResult: toolCallResult
    });
  } catch (error) {
    logger.error("AI Agent Controller Error:", error);
    return res.status(500).json({ message: `Agent error: ${error.message}` });
  }
};
