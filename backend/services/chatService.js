const OpenAI = require('openai');
const { getRelevantProjectInfo, getCompanyInfo } = require('./knowledgeBase');
const { saveMessage, getRecentMessages, getSessionMessages, clearSessionDb } = require('./db');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getBaseSystemPrompt(languageMode = 'telugu', companyInfo = {}, agentName = 'Voice Agent') {
  const languageInstruction = languageMode === 'english'
    ? 'ALWAYS respond in English only.'
    : languageMode === 'hindi'
    ? 'ALWAYS respond in Hindi only.'
    : languageMode === 'auto'
    ? 'Respond in the lead\'s language. If unclear, prefer Telugu with short, simple phrasing.'
    : 'ALWAYS respond in Telugu script only (తెలుగులో మాట్లాడండి)';

  return `You are ${agentName}, a top-performing, Telugu-speaking real estate sales executive. Your goal is to qualify leads, build trust, handle objections naturally, and drive the customer toward a site visit.

COMPANY INFO:
- Company: ${companyInfo.name || 'Voice Agent'}
- Head Office: ${companyInfo.headOffice || '69-31-15/1 Narayanapuram, Rajahmundry 533106, Andhra Pradesh'}
- Phone: ${companyInfo.phone || '+91 9985555330'}

SB VENTURES PROJECTS:
Rajahmundry – Apartments: Serene Krishna (Smart luxury), Casa Levanta (Luxury views), La Flora (Next-gen smart, biometric).
Rajahmundry – Plots: Lorven City (Namavaram Main Rd), Rome City (Roman theme, Airport Rd), Grand Egypt Plots (Egyptian township), Airport City (Premium).
Rajahmundry – Villas: Grand Egypt Villas (Duplex), Grand Egypt 2BHK Villas (Affordable), Purple Leaf (Premium), SB Pristine Villas (Premium w/ pool).
Kakinada – Apartments: Exotica (Premium), Primus (Homely).
Kakinada – Plots: Spring Leaf (Green), SB City Plots (Pithapuram Hwy), D'Milano (European), Habitat (Eco-friendly).
Kakinada – Villas: SB City Villas.

YOUR CONVERSATIONAL FRAMEWORK ("Acknowledge-Answer-Ask"):
Every time you speak, follow this exact structure:
1. ACKNOWLEDGE: Briefly validate what the user just said (e.g., "I understand", "That's a great choice", "No problem").
2. ANSWER: Provide a concise, highly relevant response or pitch based ONLY on the context provided.
3. ASK: End with exactly ONE simple follow-up question to keep the conversation moving forward.

YOUR SALES FUNNEL (Identify where you are in the funnel and move to the next step):
- Step 1. Intro: Confirm if it's a good time to talk.
- Step 2. Discovery: Ask about their preferred location (Rajahmundry/Kakinada), property type (plot/villa/apartment), and budget.
- Step 3. Pitching: Recommend exactly ONE best-fit project based on Discovery. Do NOT list multiple projects unless explicitly asked.
- Step 4. Closing: Confidently ask if they are available for a site visit this weekend. Share the company phone number (+91 9985555330).

OBJECTION HANDLING PLAYBOOK:
- If "I am busy / No time": "Sorry to interrupt! I'll be quick. [1-sentence pitch]. Can I call you back this evening?"
- If "Too expensive / Out of budget": "I completely understand. Budget is important. We have affordable options like [Project] as well. What is your comfortable range?"
- If "Just looking / No immediate plan": "That's perfectly fine, it's always smart to plan ahead. Are you looking strictly for investment or to build a home eventually?"
- If "Not interested at all": "No problem at all! Thank you for your time. Have a great day!" (And gracefully end the conversation).

CRITICAL RULES:
- ${languageInstruction}
- SOUND HUMAN: Use conversational fillers, be warm, and do not sound like a robot reading a script.
- ANTI-REPETITION: Read the chat history carefully! NEVER ask a question if the user has already answered it (e.g., do not ask for budget if they already told you).
- ULTRA SHORT: Keep responses to 1-2 short sentences maximum.
- SPEED PRIORITY: Use plain, direct phrasing and avoid extra descriptive details unless explicitly asked.
- ASK ONLY ONE: Always end with exactly one short question.
- COMPLETENESS: Every response MUST end with proper punctuation (., ?, !, or ।). Never end with a partial word or unfinished phrase.
- FORMATTING: Do not use quotation marks in responses.
- ENDING SIGNAL: When the conversation is naturally complete (goodbye/closing), append exactly [END_CALL] at the very end of your response.
- ANTI-HALLUCINATION: Never make up prices, amenities, or projects that are not in the prompt.`;
}

async function buildSystemPrompt(transcript, leadContext, languageMode, agentName) {
  const [projectInfo, companyInfo] = await Promise.all([
    getRelevantProjectInfo(transcript),
    getCompanyInfo(),
  ]);
  let prompt = getBaseSystemPrompt(languageMode, companyInfo, agentName);

  if (leadContext) {
    const leadLines = [
      `Name: ${leadContext.name || 'Unknown'}`,
      `Preferred Location: ${leadContext.location || 'Unknown'}`,
      `Budget: ${leadContext.budget || 'Unknown'}`,
      `Notes: ${leadContext.notes || 'None'}`,
    ].join(' | ');

    prompt += `\n\nCURRENT LEAD CONTEXT:
[ ${leadLines} ]
If a property in the context is 'Unknown', you must ask for it during the Discovery phase. If it is already known, DO NOT ask for it again. Use the lead's name occasionally to build rapport.`;
  }

  if (projectInfo) {
    prompt += `\n\nRELEVANT PROJECT DATA (Use ONLY this data for detailed pitches):\n${projectInfo}`;
  }

  return prompt;
}

async function createResponseStream(inputText, sessionId, leadContext, languageMode, agentName) {
  await saveMessage(sessionId, 'user', inputText);
  const recentMessages = await getRecentMessages(sessionId, 8);
  const systemPrompt = await buildSystemPrompt(inputText, leadContext, languageMode, agentName);

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map(m => ({ role: m.role, content: m.content })),
    ],
    max_tokens: 64,
    temperature: 0.2,
    stream: true,
  });

  return stream;
}

/**
 * Generates a streaming Telugu sales response for the given transcript.
 * Maintains conversation history per sessionId in SQLite.
 */
async function generateResponseStream(transcript, sessionId, leadContext, languageMode, agentName) {
  return createResponseStream(transcript, sessionId, leadContext, languageMode, agentName);
}

/**
 * Generates an initial assistant-led intro for a new lead.
 */
async function generateLeadIntroStream(sessionId, leadContext, introTemplate, languageMode, agentName) {
  const leadName = leadContext?.name ? `${leadContext.name}` : 'కస్టమర్';
  const cleanTemplate = (introTemplate || '').trim();
  const safeAgentName = agentName || 'Voice Agent';
  const companyInfo = await getCompanyInfo();
  const safeCompanyName = companyInfo?.name || safeAgentName;
  const renderedIntro = cleanTemplate
    ? cleanTemplate
      .replaceAll('{leadName}', leadName)
      .replaceAll('{agentName}', safeAgentName)
      .replaceAll('{companyName}', safeCompanyName)
    : `హలో ${leadName} గారు, నేను ${safeAgentName} నుండి మాట్లాడుతున్నాను. మీకు ఇది మాట్లాడటానికి సరైన సమయమా?`;

  const introSeed = `This is a new outbound sales call. The lead's name is ${leadName}. Start the conversation by saying exactly this opening line: "${renderedIntro}". Do not add anything else to this first message. Wait for the user to confirm their availability before moving to Step 2 (Discovery).`;
  return createResponseStream(introSeed, sessionId, leadContext, languageMode, agentName);
}

async function generateCallSummary(sessionId, leadContext) {
  const messages = await getSessionMessages(sessionId);
  const transcript = messages
    .map((m) => `${m.role === 'assistant' ? 'Agent' : 'Lead'}: ${m.content}`)
    .join('\n');

  if (!transcript.trim()) {
    return {
      outcome: 'follow_up',
      interestLevel: 'unknown',
      timeline: 'unknown',
      budgetConfirmed: leadContext?.budget || '',
      locationConfirmed: leadContext?.location || '',
      nextAction: 'Retry call later',
      summaryNote: 'No usable conversation captured.',
    };
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `You summarize outbound sales calls for the configured agent/company.
Return ONLY valid JSON with keys:
outcome, interestLevel, timeline, budgetConfirmed, locationConfirmed, nextAction, summaryNote.

Rules:
- outcome must be one of: interested, follow_up, not_interested, closed
- interestLevel should be: high, medium, low, unknown
- timeline should be short text
- summaryNote max 2 sentences
- Be conservative if confidence is low.`,
      },
      {
        role: 'user',
        content: `Lead:\n${JSON.stringify(leadContext || {}, null, 2)}\n\nConversation:\n${transcript}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  return {
    outcome: parsed.outcome || 'follow_up',
    interestLevel: parsed.interestLevel || 'unknown',
    timeline: parsed.timeline || 'unknown',
    budgetConfirmed: parsed.budgetConfirmed || '',
    locationConfirmed: parsed.locationConfirmed || '',
    nextAction: parsed.nextAction || 'Follow up with lead',
    summaryNote: parsed.summaryNote || 'Call summary generated.',
  };
}

/**
 * Clears the conversation history for a session
 */
async function clearSession(sessionId) {
  await clearSessionDb(sessionId);
}

module.exports = { generateResponseStream, generateLeadIntroStream, generateCallSummary, clearSession };
