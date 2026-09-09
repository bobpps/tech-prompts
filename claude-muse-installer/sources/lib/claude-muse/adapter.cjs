const http = require('node:http');
const { createHash, randomBytes } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');

// Diagnostics, off unless MUSE_DEBUG_LOG names a file.
//
// Meta rejects request fields this adapter has not learned about yet, one at a
// time, and Claude Code reports every one of them the same way: "the model is
// temporarily unavailable" - a sentence that names neither the request nor the
// field. Without a record there is nothing to tell that apart from a network
// failure, an idle timeout, or a fault in this file. This log is how the next
// unsupported field gets identified instead of guessed at.
//
// It records the shape of a request and what a failing reply declared about
// itself. Never a header, never the credential, never the content of a message
// - `parseJson` and `errorSummary` below are what hold that line where a body
// this file did not write passes through. The path is read on each call, so
// setting it after this file is loaded still works.
let reportedFault = null;

function debugLog(entry) {
  const target = process.env.MUSE_DEBUG_LOG;
  if (!target) return;
  try {
    // The launcher opens its own target `0600`, but `MUSE_DEBUG_LOG` set in the
    // environment never passes through it. Applied only when this call creates
    // the file.
    fs.appendFileSync(target, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
  } catch (error) {
    // Never thrown: a diagnostic that breaks the turn it was meant to explain
    // is worse than no diagnostic at all. Never silent either - a user told the
    // log is being written, who then finds nothing in it, has been sent to look
    // in the wrong place for the rest of the session.
    //
    // Said once per destination, not once per request: this runs three times a
    // turn, and a full disk would otherwise bury the failure it is reporting.
    // Writing is still attempted afterwards, because the entry worth having is
    // usually the one that has not happened yet, and the condition may lift.
    if (reportedFault !== target) {
      reportedFault = target;
      console.error(
        'claude-muse: cannot write the request log to ' + target + ': ' +
        ((error && error.code) || (error && error.message)) +
        ' (further failures on this path are not reported)'
      );
    }
  }
}

// `JSON.parse` quotes a window of its input in the error it throws, and every
// body parsed here is the content of a turn: a request on its way out, a reply
// on its way back. Left alone, one malformed body puts a fragment of a message
// into the log through `adapter_error` - the single thing the log promises
// never to hold. Every parse goes through here instead, so a bad body is
// reported by name and never by excerpt.
function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(what + ' is not valid JSON');
  }
}

// A provider's refusal is the whole reason this log exists - it is where
// `stop_sequences` was named - but the body carrying that sentence is written
// upstream, and nothing constrains what it repeats back. A 4xx that quotes the
// request it objected to, or echoes the authorization it just rejected, would
// put exactly what this log promises never to write straight into it.
//
// So the body is never copied. Only the fields an error declares about itself
// are lifted out, capped, and scrubbed of every credential this process holds;
// a body shaped like anything else is recorded by size alone. That is enough to
// name an unsupported field, which is what the log is for, and it holds whatever
// the provider decides to say.
const ERROR_MESSAGE_LIMIT = 300;

function errorSummary(payload, secrets = []) {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload == null ? '' : payload);
  const summary = { bytes: Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(text, 'utf8') };
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  // Both shapes are in the wild: `{"error":{...}}` from an Anthropic-compatible
  // endpoint, and a bare `{"type":...,"message":...}` from a gateway standing in
  // front of one.
  const declared = parsed && typeof parsed === 'object' && parsed.error && typeof parsed.error === 'object'
    ? parsed.error
    : parsed;
  const field = name => (declared && typeof declared === 'object' && typeof declared[name] === 'string' ? declared[name] : undefined);
  const type = field('type') || field('code');
  const message = field('message');
  // Redacted first, capped second, and never the other way round. A credential
  // lying across the cap loses its tail to the cut, so the exact-match search
  // that removes it finds nothing and its head survives into the log - the cap
  // would be what defeated the redaction. Both fields are capped: each is a
  // string the provider chooses, and neither belongs in a log without a bound.
  if (type !== undefined) summary.type = redact(type, secrets).slice(0, ERROR_MESSAGE_LIMIT);
  if (message !== undefined) {
    const scrubbed = redact(message, secrets);
    summary.message = scrubbed.slice(0, ERROR_MESSAGE_LIMIT);
    // Measured on what is written, not on what arrived: redaction shortens the
    // text, and `truncated` is a statement about the sentence being read.
    if (scrubbed.length > ERROR_MESSAGE_LIMIT) summary.truncated = true;
  }
  // Not silence. "The provider refused and said something this file could not
  // read" is a different diagnosis from "nothing came back", and the size is
  // what separates an empty body from a gateway's HTML page.
  if (type === undefined && message === undefined) summary.unrecognized = true;
  return summary;
}

// Struck out rather than trusted not to appear. A credential is the one string
// here whose exact value is known, so it is the one leak that can be closed by
// matching instead of by hoping.
// The one thing this log has ever needed from a header is which of the two
// response branches a reply took, and that is the media type by itself. The
// value it comes from is written upstream: the parameters after a semicolon,
// and anything a gateway decides to put there instead, are text this file has
// no claim over - and the log says it holds no header at all. So the value is
// reduced to its media type, and kept only if that is what it turns out to be.
function mediaType(value) {
  if (typeof value !== 'string') return null;
  const type = value.split(';')[0].trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/.test(type) ? type : null;
}

function redact(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    // Empty only. Splitting on '' explodes the text into single characters,
    // which is the one input this cannot take - and it is not a length below
    // which a credential stops being one. Nothing here validates how long a
    // configured token is, so a guarantee that depended on that would hold for
    // some keys and not others. A short token redacted noisily costs
    // legibility in a diagnostic; the other way costs a key.
    if (typeof secret === 'string' && secret !== '') out = out.split(secret).join('[redacted]');
  }
  return out;
}

class ToolNames {
  constructor() { this.originals = new Map(); }

  // Every name that travels upstream is claimed, whether this rewrote it or
  // not. Two tools arriving under one name is not a case to resolve quietly:
  // upstream would see a duplicate definition, and a response naming it would
  // be restored as whichever tool claimed it, which is how a call meant for one
  // tool gets delivered to another.
  claim(upstream, original) {
    const previous = this.originals.get(upstream);
    if (previous && previous !== original) throw new Error('Tool alias collision');
    this.originals.set(upstream, original);
    return upstream;
  }

  shorten(name) {
    if (typeof name !== 'string') return name;
    // A name short enough to pass through still has to be claimed: an alias
    // generated for some longer tool can land on exactly this string, and
    // whichever of the two is processed second would otherwise take it over
    // in silence.
    if (name.length <= 64) return this.claim(name, name);
    const label = name.split('__').at(-1).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 42);
    const alias = 'muse_' + label + '_' + createHash('sha256').update(name).digest('hex').slice(0, 16);
    return this.claim(alias, name);
  }

  restore(name) { return this.originals.get(name) || name; }

  blocks(blocks, outgoing) {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (['tool_use', 'server_tool_use'].includes(block.type)) {
        block.name = outgoing ? this.shorten(block.name) : this.restore(block.name);
      }
      if (block.type === 'tool_reference') {
        block.tool_name = outgoing ? this.shorten(block.tool_name) : this.restore(block.tool_name);
      }
      // Never rewrite tool inputs, schemas, or ordinary text containing a name.
      if (block.type === 'tool_result') this.blocks(block.content, outgoing);
    }
  }

  request(body) {
    for (const tool of body.tools || []) {
      tool.name = this.shorten(tool.name);
      if (Array.isArray(tool.allowed_callers)) tool.allowed_callers = tool.allowed_callers.map(n => this.shorten(n));
    }
    if (body.tool_choice?.name) body.tool_choice.name = this.shorten(body.tool_choice.name);
    for (const message of body.messages || []) this.blocks(message.content, true);
    return body;
  }

  response(body) {
    this.blocks(body.content, false);
    if (body.content_block) this.blocks([body.content_block], false);
    if (body.message) this.blocks(body.message.content, false);
    return body;
  }
}

// Meta accepts only the plain `{"type":"ephemeral"}` form of cache_control.
// Claude Code adds `ttl` and `scope` extensions when it believes it may use the
// extended cache. Reducing the object to its type downgrades to the provider's
// default cache instead of failing the whole request with HTTP 400.
// Only the four places the API allows the field is it ours to touch: a tool
// definition, a system block, a message content block, and the content blocks
// inside a tool_result. Everything else — a tool's `input_schema`, the `input`
// of a past tool_use — is application data, where a field named cache_control
// belongs to that tool and means whatever the tool says it means. Walking the
// whole body would silently reduce an MCP schema property of that name to
// `{"type": ...}`, dropping its own `properties` and `description` on the way
// through, and the tool would then be described wrongly to the model.
// FORCE_PROMPT_CACHING_5M pins the provider default at the source, and with
// that variable set a direct connection never produced the 400 this guards
// against, so on a good day nothing here fires. It stays anyway. That variable
// is undocumented; a Claude Code release can rename or drop it without notice,
// and the failure mode when it does is every request refused. The reductions
// are counted into the debug log so the day the variable stops working shows
// up as a log line rather than only as a broken install.
function plainCacheControl(body) {
  if (!body || typeof body !== 'object') return body;
  let reduced = 0;
  const reduce = holder => {
    const value = holder && holder.cache_control;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const extra of Object.keys(value)) if (extra !== 'type') { delete value[extra]; reduced++; }
    }
  };
  const blocks = content => {
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      reduce(block);
      if (block.type === 'tool_result') blocks(block.content);
    }
  };
  blocks(body.system);
  if (Array.isArray(body.tools)) for (const tool of body.tools) reduce(tool);
  if (Array.isArray(body.messages)) for (const message of body.messages) blocks(message && message.content);
  if (reduced) debugLog({ event: 'cache_control_reduced', fields: reduced });
  return body;
}

// A request this adapter refuses to forward, reported to Claude Code as a 400
// with an explanation rather than an opaque upstream failure.
class UnsupportedRequest extends Error {}

// Meta's `web_search_20250305` accepts `type`, `name`, `user_location` and
// `cache_control`, and rejects every other field with HTTP 400.
//
// Claude Code always sends `max_uses`, a cap on how many searches one turn may
// run. Dropping it costs only that cap — the provider applies its own — so web
// search works instead of failing on every call.
//
// `allowed_domains` and `blocked_domains` are different: they are a restriction
// the operator configured. Forwarding a search without them would query domains
// they deliberately excluded, so those requests are refused here, with an
// explanation, instead of being quietly widened.
const WEB_SEARCH_KEEP = ['type', 'name', 'user_location', 'cache_control'];
const WEB_SEARCH_REFUSE = ['allowed_domains', 'blocked_domains'];

function webSearchTools(body) {
  for (const tool of body.tools || []) {
    if (typeof tool?.type !== 'string' || !tool.type.startsWith('web_search')) continue;
    const refused = WEB_SEARCH_REFUSE.filter(field => tool[field] !== undefined);
    if (refused.length) {
      throw new UnsupportedRequest(
        'Meta does not support ' + refused.join(' or ') + ' on web_search. Remove the ' +
        'domain filter from your Claude Code settings, or disable the WebSearch tool.'
      );
    }
    for (const field of Object.keys(tool)) if (!WEB_SEARCH_KEEP.includes(field)) delete tool[field];
  }
  return body;
}

// Meta rejects `stop_sequences` outright with HTTP 400.
//
// Claude Code sends it on the auto-mode safety classifier call - the request
// that decides whether a tool call may run without stopping to ask. That
// request carries no tools and does not stream, which is why it is the only
// place the field appears and why ordinary turns in the same session are
// unaffected. Claude Code renders the resulting 400 as "the model is
// temporarily unavailable", so the visible symptom is that every gated tool -
// Bash, Edit, Agent - fails while reading files keeps working.
//
// Dropping the field changes where generation stops, not what it contains: the
// model may run past the point the caller meant to cut. That is a real cost,
// and the alternative is a feature that never works at all.
function stopSequences(body) {
  if (body && typeof body === 'object') delete body.stop_sequences;
  return body;
}

// Buffers a non-streaming body chunk by chunk rather than through `.json()` or
// `.arrayBuffer()`, so the idle timer sees the transfer and a slow but healthy
// download is not mistaken for a dead connection.
async function collect(body, active) {
  const chunks = [];
  if (body) for await (const chunk of body) { active(); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

// A streaming reply commits to its status line before it knows how the turn
// ends. The provider answers 200, opens the stream, and can still emit
// `event: error` a second later - upstream overloaded, context too long, the
// turn refused. Nothing about that reaches the status the log already recorded,
// so a failed turn read as a successful one, which is the reading that sends a
// user looking at their own machine.
//
// Returns the data of an error event, for `errorSummary` to reduce to the two
// fields it declares, and null for everything else. Never throws: a frame this
// cannot parse is `sseFrame`'s to report, and a diagnostic must not be what
// ends a stream.
function sseError(frame) {
  const data = sseData(frame);
  if (!data || data === '[DONE]') return null;
  let parsed;
  try { parsed = JSON.parse(data); } catch { return null; }
  return parsed && parsed.type === 'error' ? data : null;
}

function sseData(frame) {
  return frame.split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, ''))
    .join('\n');
}

function sseFrame(frame, names) {
  const lines = frame.split(/\r?\n/);
  const data = sseData(frame);
  if (!data || data === '[DONE]') return frame;
  const body = names.response(parseJson(data, 'An upstream event'));
  return [...lines.filter(l => !l.startsWith('data:')), 'data: ' + JSON.stringify(body)].join('\n');
}

async function startProxy(upstream, token, idleSeconds) {
  const origin = new URL(upstream);
  const localToken = randomBytes(32).toString('hex');
  // Every string whose exact value is known and must never reach the log,
  // gathered once so no path out of this file can be given a shorter list than
  // another. The configured URL carries credentials of its own when a gateway
  // is written as `https://user:password@host`, and `fetch` refuses such a URL
  // by throwing an error that quotes the whole of it - on every request, not on
  // some rare path.
  const secrets = [token, localToken, origin.password, origin.username].filter(Boolean);
  // Idle, not wall-clock. A high-effort turn over a large context can stream for
  // far longer than any fixed cutoff, and aborting a healthy stream mid-flight
  // would truncate the turn: the headers have already gone out, so there is no
  // way left to report an error. Every byte in either direction restarts this,
  // which leaves it measuring only genuine silence.
  const idleMs = Number(idleSeconds) > 0 ? Number(idleSeconds) * 1000 : 300000;
  const server = http.createServer(async (req, res) => {
    // Logged before the checks below, not after. A request this proxy turns
    // away leaves no other trace, and "no entry at all" is exactly what
    // distinguishes a client calling somewhere this adapter does not serve
    // from one whose request reached the provider and was refused there.
    debugLog({ event: 'incoming', method: req.method, path: req.url.split('?')[0] });
    if (req.headers.authorization !== 'Bearer ' + localToken) {
      debugLog({ event: 'rejected', reason: 'auth', method: req.method, path: req.url.split('?')[0] });
      res.writeHead(401).end();
      return;
    }
    if (!req.url.startsWith('/v1/') || !['POST', 'GET'].includes(req.method)) {
      debugLog({ event: 'rejected', reason: 'path', method: req.method, path: req.url.split('?')[0] });
      res.writeHead(404).end();
      return;
    }
    // Per request, not per proxy. What a name maps to only has to hold for the
    // one body it travels in, and aliases are a pure function of the tool name,
    // so nothing needs carrying between turns. Keeping one table for the life of
    // the proxy would let a name claimed by a tool set that is no longer loaded
    // — a subagent's, say — reject a later request that collides with nothing.
    const names = new ToolNames();
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });
    // The signal reaches `fetch`, but a client that stalls halfway through its
    // upload never gets that far: the read loop below would park on a socket
    // that stays open and simply never speaks again, and nothing would observe
    // the abort. Destroying the request makes that read throw instead, so
    // silence is abandoned wherever in the turn it happens. A request that was
    // read to the end is already complete, so this leaves it alone.
    abort.signal.addEventListener('abort', () => req.destroy(), { once: true });
    let timer;
    const active = () => {
      clearTimeout(timer);
      timer = setTimeout(() => abort.abort(), idleMs);
    };
    active();
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        active();
        size += chunk.length;
        if (size > 64 * 1024 * 1024) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (!['host', 'content-length', 'connection', 'authorization', 'x-api-key', 'accept-encoding', 'transfer-encoding'].includes(key)) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      }
      headers.set('authorization', 'Bearer ' + token);
      const target = new URL(origin);
      target.pathname = origin.pathname.replace(/\/$/, '') + req.url.split('?')[0];
      target.search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      let payload;
      if (raw) {
        const parsed = parseJson(raw, 'The request body');
        debugLog({
          event: 'request', method: req.method, path: req.url.split('?')[0],
          // What arrived on the socket, already counted by the read loop above.
          // `raw.length` would be UTF-16 code units of the decoded string: a CJK
          // character counts one instead of three, so a prompt or a tool schema
          // in any non-Latin script reports a body far smaller than the one that
          // was sent - and size is the first thing read when a request is
          // suspected of being too large.
          model: parsed.model, stream: parsed.stream === true, bytes: size,
          tools: Array.isArray(parsed.tools) ? parsed.tools.length : 0,
          messages: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
          longest_tool: Math.max(0, ...(parsed.tools || []).map(t => (t && typeof t.name === 'string' ? t.name.length : 0))),
        });
        payload = JSON.stringify(stopSequences(plainCacheControl(webSearchTools(names.request(parsed)))));
      }
      const response = await fetch(target, {
        method: req.method, headers, redirect: 'error', signal: abort.signal,
        body: payload,
      });
      active();
      debugLog({ event: 'response', status: response.status, type: mediaType(response.headers.get('content-type')) });
      res.statusCode = response.status;
      for (const [key, value] of response.headers) {
        if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(key)) res.setHeader(key, value);
      }
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const decoder = new TextDecoder();
        let buffer = '';
        // Read from the frames on their way through, so the entry sits beside
        // the `response` line that recorded the 200 and contradicts it.
        const reportStreamError = frame => {
          const failure = sseError(frame);
          if (failure) {
            debugLog({
              event: 'upstream_error', status: response.status, stream: true,
              ...errorSummary(failure, secrets),
            });
          }
        };
        for await (const chunk of response.body) {
          active();
          buffer += decoder.decode(chunk, { stream: true });
          let match;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            reportStreamError(frame);
            if (!res.write(sseFrame(frame, names) + '\n\n')) await once(res, 'drain', { signal: abort.signal });
          }
        }
        buffer += decoder.decode();
        if (buffer) {
          reportStreamError(buffer);
          res.write(sseFrame(buffer, names) + '\n\n');
        }
        res.end();
      } else if (response.headers.get('content-type')?.includes('json')) {
        const text = (await collect(response.body, active)).toString('utf8');
        if (response.status >= 400) debugLog({ event: 'upstream_error', status: response.status, ...errorSummary(text, secrets) });
        res.end(JSON.stringify(names.response(parseJson(text, 'The upstream reply'))));
      } else {
        const buffered = await collect(response.body, active);
        if (response.status >= 400) debugLog({ event: 'upstream_error', status: response.status, ...errorSummary(buffered, secrets) });
        res.end(buffered);
      }
    } catch (error) {
      // The last string from outside this file that reached the log unscrubbed.
      // A fault here is the adapter's own to report, but the sentence reporting
      // it is written by Node, and it quotes what it was given.
      debugLog({
        event: 'adapter_error', name: error && error.name,
        message: redact(String((error && error.message) || ''), secrets).slice(0, ERROR_MESSAGE_LIMIT),
      });
      const refused = error instanceof UnsupportedRequest;
      if (!res.headersSent) {
        res.writeHead(refused ? 400 : 502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: refused
            ? { type: 'invalid_request_error', message: error.message }
            : { type: 'api_error', message: 'Local Muse adapter could not complete the upstream request.' },
        }));
      } else res.destroy();
    } finally { clearTimeout(timer); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, url: 'http://127.0.0.1:' + server.address().port, token: localToken };
}

module.exports = { ToolNames, sseFrame, sseError, startProxy, plainCacheControl, webSearchTools, stopSequences, UnsupportedRequest, errorSummary, parseJson, mediaType };
