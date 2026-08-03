// The brief (WP8): a short, sourced account of where one relationship stands.
//
// THE DISCIPLINE: no invented facts. Every claim traces to a message, an event
// or a document that is actually in the input, and source_message_ids is stored
// with each brief so the trace survives. If the source does not say it, the
// brief does not say it. That is the same rule applied to investor materials,
// pointed at internal tooling, because a brief you cannot trust is worse than
// no brief at all — it looks like knowledge and is not.
//
// The generator reads coo_events, not raw messages alone. `last_commitment` and
// `open_asks` get far more accurate when the model can see that a document was
// actually sent on the 15th rather than inferring it from prose.
//
// POST { participationId, force?: boolean }
// GET  ?participationId=...   returns the cached brief, generating if missing

import Anthropic from '@anthropic-ai/sdk';
import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { logUsage, tokensFromAnthropic } from './_usage.js';
import { TB, listRecords, updateRecords } from './_airtable.js';
import { getParticipation } from './_participations.js';
import { getStage, LABEL_TO_ID, daysInStage } from './_stages.js';

const MODEL = 'claude-sonnet-5';
const DOCS_TBL     = () => process.env.AIRTABLE_TABLE_DOCUMENTS || TB.DOCUMENTS;
const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS  || TB.CONTACTS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  try {
    const user = await getUser(event).catch(() => null);
    const q    = event.queryStringParameters || {};
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
    const participationId = body.participationId || q.participationId;
    const force = Boolean(body.force);

    if (!participationId) return err(400, 'participationId is required');

    const supabase = getSupabase();

    // ── Cache ────────────────────────────────────────────────────────────────
    // Regenerating eagerly would fire a model call every time the tab opens.
    // Briefs are marked stale by the things that actually change the story:
    // new inbound mail, a stage move, a note, a confirmed signal.
    const { data: cached } = await supabase
      .from('coo_briefs').select('*').eq('participation_airtable_id', participationId).maybeSingle();

    if (cached && !cached.stale && !force) {
      return ok({ brief: shape(cached), cached: true });
    }
    if (event.httpMethod === 'GET' && cached && !force) {
      // A GET never spends tokens on a stale brief silently. It returns what it
      // has, flagged, and lets the UI offer a refresh.
      return ok({ brief: shape(cached), cached: true, stale: true });
    }

    const participation = await getParticipation(participationId);
    if (!participation) return err(404, 'Participation not found');

    // ── Gather the source material ───────────────────────────────────────────
    const { data: events } = await supabase
      .from('coo_events')
      .select('id, event_type, occurred_at, title, detail, actor, source, confidence, ref_message_id')
      .eq('participation_airtable_id', participationId)
      .order('occurred_at', { ascending: false })
      .limit(60);

    const messageIds = (events || []).map(e => e.ref_message_id).filter(Boolean).slice(0, 20);
    let messages = [];
    if (messageIds.length) {
      const { data } = await supabase
        .from('coo_messages')
        .select('id, direction, from_handle, sent_at, snippet, body')
        .in('id', messageIds)
        .order('sent_at', { ascending: false })
        .limit(20);
      messages = data || [];
    }

    // Documents on file, with their signed status. This is what turns "they
    // said it was signed" into a checkable statement.
    let documents = [];
    try {
      const docs = await listRecords(DOCS_TBL(), {
        fields: ['Name', 'Type', 'Tags', 'Signed Date', 'Contact', 'Opportunity'],
      });
      documents = docs.filter(d =>
        arr(d.fields?.['Contact']).includes(participation.contactId) ||
        arr(d.fields?.['Opportunity']).includes(participation.workstreamId),
      ).map(d => ({
        name:       d.fields?.['Name'] || '',
        type:       d.fields?.['Type'] || '',
        tags:       arr(d.fields?.['Tags']).join(', '),
        signedDate: d.fields?.['Signed Date'] || null,
      }));
    } catch (e) {
      console.warn('[coo-brief] document read failed:', e.message);
    }

    const stageId = LABEL_TO_ID[participation.stage] || participation.stage;
    const stage   = getStage(stageId);

    if (!events?.length && !messages.length && !documents.length) {
      // Nothing to summarize. Say so rather than asking a model to invent a
      // narrative out of an empty record, which is exactly how briefs start
      // containing things that never happened.
      const empty = {
        participation_airtable_id: participationId,
        contact_airtable_id: participation.contactId,
        workstream_airtable_id: participation.workstreamId,
        summary: 'Nothing recorded on this participation yet. Add a note or ingest mail to build a history.',
        open_asks: [],
        last_commitment: null,
        suggested_next: stage?.nextAction || null,
        source_message_ids: [],
        model: null,
        generated_at: new Date().toISOString(),
        stale: false,
      };
      await supabase.from('coo_briefs').upsert(empty, { onConflict: 'participation_airtable_id' });
      return ok({ brief: shape(empty), cached: false, empty: true });
    }

    // ── Generate ─────────────────────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const system = buildPrompt({ participation, stage, events: events || [], messages, documents, previous: cached });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      tools: [{
        name: 'emit_brief',
        description: 'Emit the structured relationship brief.',
        input_schema: {
          type: 'object',
          properties: {
            summary:         { type: 'string', description: 'Exactly two sentences on where this stands.' },
            open_asks:       {
              type: 'array',
              description: 'At most five. Only asks actually present in the source.',
              items: {
                type: 'object',
                properties: {
                  who:  { type: 'string' },
                  what: { type: 'string' },
                  when: { type: 'string' },
                },
                required: ['who', 'what'],
              },
            },
            last_commitment: { type: 'string', description: 'Who committed to what and on what date. Empty string if none is in the source.' },
            suggested_next:  { type: 'string' },
          },
          required: ['summary', 'open_asks', 'last_commitment', 'suggested_next'],
        },
      }],
      tool_choice: { type: 'tool', name: 'emit_brief' },
      messages: [{ role: 'user', content: 'Write the brief from the source material in the system prompt.' }],
    });

    await logUsage({
      event, service: 'anthropic', surface: 'coo-brief',
      operation: 'messages.create', model: MODEL,
      ...tokensFromAnthropic(response), user,
      metadata: { participationId },
    }).catch(() => {});

    const block  = response.content.find(b => b.type === 'tool_use');
    const parsed = block?.input || {};

    const record = {
      participation_airtable_id: participationId,
      contact_airtable_id:  participation.contactId,
      workstream_airtable_id: participation.workstreamId,
      summary:         String(parsed.summary || '').trim(),
      open_asks:       Array.isArray(parsed.open_asks) ? parsed.open_asks.slice(0, 5) : [],
      last_commitment: String(parsed.last_commitment || '').trim() || null,
      suggested_next:  String(parsed.suggested_next || '').trim() || stage?.nextAction || null,
      source_message_ids: messages.map(m => m.id),
      model:           MODEL,
      generated_at:    new Date().toISOString(),
      stale:           false,
    };

    const { error: saveErr } = await supabase
      .from('coo_briefs').upsert(record, { onConflict: 'participation_airtable_id' });
    if (saveErr) console.error('[coo-brief] cache write failed:', saveErr.message);

    // The CRM Contacts `Current Summary` field is already described in the base
    // as intended to be AI-refreshed from notes and transcripts. It is the brief
    // by another name, so keep it in step rather than building a second one.
    if (participation.contactId && record.summary) {
      try {
        await updateRecords(CONTACTS_TBL(), [{
          id: participation.contactId,
          fields: { 'Current Summary': record.summary },
        }]);
      } catch (e) {
        console.warn('[coo-brief] Current Summary write failed:', e.message);
      }
    }

    return ok({ brief: shape(record), cached: false });
  } catch (e) {
    console.error('[coo-brief-generate]', e?.message || String(e));
    return err(500, e?.message || 'Brief generation failed');
  }
};

function shape(r) {
  return {
    participationId: r.participation_airtable_id,
    summary:         r.summary,
    openAsks:        r.open_asks || [],
    lastCommitment:  r.last_commitment,
    suggestedNext:   r.suggested_next,
    sourceMessageIds: r.source_message_ids || [],
    model:           r.model,
    generatedAt:     r.generated_at,
    stale:           r.stale,
  };
}

function buildPrompt({ participation, stage, events, messages, documents, previous }) {
  const today = new Date().toISOString().slice(0, 10);
  const days  = daysInStage(participation.stageEntered);

  const eventLines = events.slice(0, 40).map(e =>
    `- ${String(e.occurred_at).slice(0, 10)} [${e.event_type}${e.confidence === 'inferred' ? ', UNCONFIRMED' : ''}] ` +
    `${e.title}${e.detail ? ` — ${String(e.detail).slice(0, 200)}` : ''}`,
  ).join('\n') || '(none)';

  const messageLines = messages.slice(0, 12).map(m =>
    `- ${String(m.sent_at).slice(0, 10)} ${m.direction === 'inbound' ? 'FROM THEM' : 'FROM US'} (${m.from_handle}): ` +
    `${String(m.snippet || m.body || '').slice(0, 400)}`,
  ).join('\n') || '(none)';

  const docLines = documents.map(d =>
    `- ${d.name}${d.type ? ` (${d.type})` : ''}: ${d.signedDate ? `SIGNED ${String(d.signedDate).slice(0, 10)}` : 'not signed'}${d.tags ? ` [${d.tags}]` : ''}`,
  ).join('\n') || '(none on file)';

  return `You write short relationship briefs for the COO of OneVibe Media Group. Today is ${today}.

SUBJECT
Participation: ${participation.name || participation.id}
Current stage: ${stage?.label || participation.stage || 'unknown'}${days != null ? ` (${days} days in stage)` : ''}
Waiting on: ${participation.waitingOn || 'Nobody'}
Recorded next action: ${participation.nextAction || '(none)'}
${participation.blockingItem ? `Blocking item: ${participation.blockingItem}` : ''}

TIMELINE EVENTS (newest first)
${eventLines}

RECENT MESSAGES (newest first)
${messageLines}

DOCUMENTS ON FILE
${docLines}

${previous?.summary ? `PREVIOUS BRIEF (for continuity, may be out of date)\n${previous.summary}\n` : ''}

RULES, non-negotiable:
1. Every statement must be supported by the material above. If the source does not
   say it, do not say it. No inferred amounts, dates, names or intentions.
2. Never state that a document was signed unless a document above shows a signed
   date. If the stage claims otherwise, say the claim is unverified.
3. Events tagged UNCONFIRMED are proposals, not facts. Describe them as such.
4. "summary" is exactly two sentences. Plain, specific, no throat-clearing.
5. "open_asks" is at most five, each with who owes it, what it is, and when it is
   due if a date appears in the source. Use an empty array when there are none.
6. "last_commitment" names the speaker and the date. Empty string if the source
   contains no commitment.
7. "suggested_next" should confirm the stage's default next action
   ("${stage?.nextAction || 'none'}") or explicitly override it with a reason.
8. Do not use em dashes.`;
}
