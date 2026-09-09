const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { ToolNames, sseFrame, sseError, startProxy, plainCacheControl, webSearchTools, portableSchemas, stopSequences, UnsupportedRequest, errorSummary, parseJson, mediaType } = require('./adapter.cjs');
const long = 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__get_console_message';

test('long names round-trip without changing inputs or schemas', () => {
  const names = new ToolNames();
  const body = names.request({ tools: [{ name: long, input_schema: { name: long } }], tool_choice: { name: long }, messages: [{ content: [{ type: 'tool_use', name: long, input: { name: long } }, { type: 'tool_result', content: [{ type: 'tool_reference', tool_name: long }] }] }] });
  const alias = body.tools[0].name;
  assert.ok(alias.length <= 64);
  assert.equal(body.tool_choice.name, alias);
  assert.equal(body.tools[0].input_schema.name, long);
  assert.equal(body.messages[0].content[0].input.name, long);
  assert.equal(body.messages[0].content[1].content[0].tool_name, alias);
  assert.equal(names.response({ content: [{ type: 'tool_use', name: alias }] }).content[0].name, long);
  assert.equal(new ToolNames().shorten(long), alias);
  assert.notEqual(names.shorten(long + '2'), alias);
  assert.equal(names.shorten('a'.repeat(64)), 'a'.repeat(64));
});

test('a tool named exactly like an alias cannot take it over', () => {
  // The alias is deterministic, so a tool can be declared with that name — by a
  // server that wants the other tool's calls, or by coincidence. Either way the
  // two cannot share one name upstream.
  const alias = new ToolNames().shorten(long);
  assert.ok(alias.length <= 64, 'an alias is short enough to be a legal tool name');
  for (const tools of [[{ name: alias }, { name: long }], [{ name: long }, { name: alias }]]) {
    assert.throws(() => new ToolNames().request({ tools }), /collision/i);
  }
  // A short name that collides with nothing is still passed through untouched,
  // and declaring the same tool twice is not a collision.
  const names = new ToolNames();
  assert.deepEqual(
    names.request({ tools: [{ name: 'read' }, { name: 'read' }] }).tools.map(t => t.name),
    ['read', 'read']
  );
  assert.equal(names.restore('read'), 'read');
});

test('SSE event names restore, tool arguments remain untouched', () => {
  const names = new ToolNames();
  const alias = names.shorten(long);
  const frame = 'event: content_block_start\r\ndata: ' + JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', name: alias, input: {} } });
  assert.ok(sseFrame(frame, names).includes(long));
  const delta = 'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { partial_json: alias } });
  assert.equal(sseFrame(delta, names), delta);
  assert.equal(sseFrame('data: [DONE]', names), 'data: [DONE]');
});

test('HTTP authentication, request mapping, fragmented UTF-8 SSE, and error status', async () => {
  let received;
  const upstream = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer upstream-test-key');
    if (req.url.endsWith('/error')) { res.writeHead(429, { 'content-type': 'application/json' }); res.end('{"error":{"message":"rate limited"}}'); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const data = Buffer.from('event: content_block_start\r\ndata: ' + JSON.stringify({ content_block: { type: 'tool_use', name: received.tools[0].name, input: {} }, note: 'Привет' }) + '\r\n\r\n');
    for (const byte of data) res.write(Buffer.from([byte]));
    res.end();
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    assert.equal((await fetch(proxy.url + '/v1/messages')).status, 401);
    const headers = { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' };
    const response = await fetch(proxy.url + '/v1/messages', { method: 'POST', headers, body: JSON.stringify({ tools: [{ name: long }] }) });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(received.tools[0].name.length <= 64);
    assert.ok(text.includes(long));
    assert.ok(text.includes('Привет'));
    const error = await fetch(proxy.url + '/v1/error', { headers });
    assert.equal(error.status, 429);
    assert.equal((await error.json()).error.message, 'rate limited');
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('stop_sequences never reaches the provider', async () => {
  let received;
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"type":"message"}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    const response = await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', stop_sequences: ['</verdict>'], messages: [{ content: 'hi' }] }),
    });
    assert.equal(response.status, 200);
    // Asserted on the body the provider received, not on the helper alone: a
    // helper that works but is never called is the failure this guards against.
    assert.equal('stop_sequences' in received, false);
    assert.deepEqual(received.messages, [{ content: 'hi' }]);
    assert.equal(received.model, 'm');
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('the debug log names an upstream failure and never the credential', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    // Not JSON, and not from the provider at all: a gateway standing in front of
    // it, quoting the whole request back. This is the second of the two branches
    // that log a failure, and it is reached by content type, so it needs a reply
    // of its own to be exercised.
    if (req.url === '/v1/gateway') {
      res.writeHead(502, { 'content-type': 'text/html' });
      res.end('<html>refused Bearer upstream-test-key carrying the-content-of-a-turn</html>');
      return;
    }
    // The parameters are the provider's to write, and this one puts the
    // credential it rejected in them. The header never reaches the log, so the
    // assertion below that the key is absent covers this branch too.
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8; note=upstream-test-key' });
    // Written the way a provider that quotes what it refused writes one: the
    // sentence worth keeping, and beside it the request and the authorization
    // it just rejected. Nothing stops an upstream from replying like this, so
    // the log has to survive it.
    res.end(JSON.stringify({
      error: { message: '`stop_sequences` is not supported' },
      request: { messages: [{ content: 'the-content-of-a-turn' }] },
      authorization: 'Bearer upstream-test-key',
    }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const file = path.join(os.tmpdir(), 'muse-debug-' + process.pid + '.log');
  fs.rmSync(file, { force: true });
  process.env.MUSE_DEBUG_LOG = file;
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    // Deliberately not ASCII. The decoded string is shorter than the body that
    // travelled, so a count taken from it is wrong in exactly the direction
    // that matters.
    const sent = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'Привет, 世界' }] });
    assert.ok(Buffer.byteLength(sent, 'utf8') > sent.length);
    await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: sent,
    });
    await fetch(proxy.url + '/v1/gateway', {
      headers: { authorization: 'Bearer ' + proxy.token },
    });
    const log = fs.readFileSync(file, 'utf8');
    assert.match(log, /"event":"request"/);
    assert.match(log, /"event":"upstream_error"/);
    // The field that was refused is still there to read, which is what the log
    // is for.
    assert.match(log, /stop_sequences/);
    // Both failures were recorded, and neither carried the body that named
    // them. Asserted on the file as a whole: a leak through either branch is
    // the same leak.
    assert.equal(log.match(/"event":"upstream_error"/g).length, 2);
    assert.match(log, /"status":502[^\n]*"unrecognized":true/);
    assert.match(log, new RegExp('"bytes":' + Buffer.byteLength(sent, 'utf8') + '[,}]'));
    assert.equal(log.includes('upstream-test-key'), false);
    assert.equal(log.includes('the-content-of-a-turn'), false);
    // The body was counted, never copied.
    assert.equal(log.includes('Привет'), false);
  } finally {
    delete process.env.MUSE_DEBUG_LOG;
    fs.rmSync(file, { force: true });
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('an upstream error reaches the log by what it declares, never by its body', () => {
  const summary = errorSummary(JSON.stringify({
    error: { type: 'invalid_request_error', message: '`stop_sequences` is not supported' },
    request: { messages: [{ content: 'the content of a turn' }] },
  }));
  assert.equal(summary.type, 'invalid_request_error');
  assert.equal(summary.message, '`stop_sequences` is not supported');
  // The sentence that names the field is kept; everything standing next to it
  // in the same body is not. Asserted over the whole entry, because a field
  // added later would carry the leak back in without failing a narrower check.
  assert.equal(JSON.stringify(summary).includes('the content of a turn'), false);

  // A gateway in front of the provider states the same two fields at the top
  // level of the body rather than under `error`.
  const gateway = '{"type":"rate_limit_error","message":"slow down"}';
  assert.deepEqual(
    errorSummary(gateway),
    { bytes: Buffer.byteLength(gateway, 'utf8'), type: 'rate_limit_error', message: 'slow down' }
  );

  // A credential echoed back is struck out by value, which works wherever in
  // the sentence the provider chose to put it.
  const echoed = errorSummary('{"message":"Bearer upstream-key-value was rejected"}', ['upstream-key-value']);
  assert.equal(echoed.message, 'Bearer [redacted] was rejected');

  // A credential is a credential at any length: nothing validates how long a
  // configured token is, so a guarantee that held only above some length would
  // hold for some keys and not others.
  assert.equal(errorSummary('{"message":"key abc rejected"}', ['abc']).message, 'key [redacted] rejected');
  // The empty string is the one value that cannot be searched for - splitting on
  // it would return the text one character at a time. It leaves the text alone.
  assert.equal(errorSummary('{"message":"hello"}', ['']).message, 'hello');
});

test('a long message is redacted before it is capped, and an unfamiliar body is measured', () => {
  const long = errorSummary(JSON.stringify({ error: { message: 'x'.repeat(400) + 'the tail of a turn' } }));
  assert.equal(long.message.length, 300);
  assert.equal(long.truncated, true);
  assert.equal(long.message.includes('the tail of a turn'), false);

  // The credential lies across the 300-character cap. Cut first, its tail goes
  // with the cut, the exact-match search finds nothing, and the head of the
  // token stays in the log - the cap defeating the redaction.
  const secret = 'sk-' + 'a'.repeat(40);
  const straddling = errorSummary(
    JSON.stringify({ error: { message: 'x'.repeat(290) + secret + ' was rejected' } }),
    [secret]
  );
  assert.equal(straddling.message.includes('sk-'), false);
  assert.equal(straddling.message, 'x'.repeat(290) + '[redacted]');
  assert.equal(straddling.truncated, true);

  // Redaction shortens the text, so a message over the cap before scrubbing can
  // fit under it after - and then nothing was cut. `truncated` describes the
  // sentence in the log, not the one that arrived.
  const shortened = errorSummary(
    JSON.stringify({ error: { message: 'x'.repeat(267) + secret } }),
    [secret]
  );
  assert.equal(shortened.message, 'x'.repeat(267) + '[redacted]');
  assert.equal('truncated' in shortened, false);

  // A type is a string the provider chooses too, so it is bounded as well.
  const shouting = errorSummary(JSON.stringify({ error: { type: 'e'.repeat(400) } }));
  assert.equal(shouting.type.length, 300);

  // A gateway's HTML page declares nothing this can read. It is still worth an
  // entry - "refused, and said something unreadable" is not "nothing came
  // back" - but it is recorded by size, not by content.
  const page = '<html><body>token=abc, prompt was: the content of a turn</body></html>';
  const unfamiliar = errorSummary(page);
  assert.deepEqual(unfamiliar, { bytes: Buffer.byteLength(page, 'utf8'), unrecognized: true });
});

test('a malformed body is reported by name, never by an excerpt of itself', () => {
  assert.deepEqual(parseJson('{"a":1}', 'The request body'), { a: 1 });
  // `JSON.parse` puts a window of its input into the SyntaxError it throws, and
  // for these bodies that window is the content of a turn. The message this
  // raises instead is fixed, so nothing of the body can travel in it.
  assert.throws(
    () => parseJson('{"messages":[{"content":"the content of a turn"}], "model": bad}', 'The request body'),
    error => error.message === 'The request body is not valid JSON'
  );
});

test('a debug log that cannot be written says so once and does not break the turn', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  // A directory that does not exist, which is what `--muse-debug=<path>` names
  // when a user mistypes it or points at a drive that is not mounted.
  process.env.MUSE_DEBUG_LOG = path.join(os.tmpdir(), 'muse-absent-' + process.pid, 'nested', 'x.log');
  const said = [];
  const spoke = console.error;
  console.error = message => said.push(String(message));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(proxy.url + '/v1/messages', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'm', messages: [] }),
      });
      // The turn is what matters. A log that cannot be written must not cost
      // the request it was turned on to explain.
      assert.equal(response.status, 200);
    }
  } finally {
    console.error = spoke;
    delete process.env.MUSE_DEBUG_LOG;
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
  // Two requests, three log attempts each, one sentence. Silence here is the
  // bug: the launcher announced a path the user would have watched all session.
  assert.equal(said.length, 1);
  assert.match(said[0], /cannot write the request log/);
  assert.match(said[0], /ENOENT/);
});

test('an error inside a streaming reply is logged, not read as a success', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    // 200, then a failure. The status line was already committed when the
    // provider found out how the turn ends.
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
    res.end('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"upstream is overloaded"}}\n\n');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const file = path.join(os.tmpdir(), 'muse-stream-' + process.pid + '.log');
  fs.rmSync(file, { force: true });
  process.env.MUSE_DEBUG_LOG = file;
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  try {
    const response = await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', stream: true, messages: [] }),
    });
    // Forwarded untouched: the client is the one that has to act on it.
    assert.ok((await response.text()).includes('overloaded_error'));
    const log = fs.readFileSync(file, 'utf8');
    // The 200 is still recorded, and the failure sits beside it contradicting
    // it. Without the second line the turn reads as having worked.
    assert.match(log, /"event":"response","status":200/);
    assert.match(log, /"event":"upstream_error","status":200,"stream":true/);
    assert.match(log, /"type":"overloaded_error"/);
    assert.match(log, /upstream is overloaded/);
  } finally {
    delete process.env.MUSE_DEBUG_LOG;
    fs.rmSync(file, { force: true });
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('the logged content type is a media type and nothing else', () => {
  assert.equal(mediaType('application/json'), 'application/json');
  assert.equal(mediaType('text/event-stream; charset=utf-8'), 'text/event-stream');
  assert.equal(mediaType('APPLICATION/JSON'), 'application/json');
  assert.equal(mediaType('application/vnd.api+json'), 'application/vnd.api+json');
  // A header is written upstream, and the parameters are where anything can be
  // put. They are dropped rather than trusted.
  assert.equal(mediaType('application/json; key=LLM|123|secret'), 'application/json');
  // A value that is not a media type is not quoted in its place. `null` still
  // separates "the reply declared something unreadable" from "no reply".
  assert.equal(mediaType('Bearer LLM|123|secret'), null);
  assert.equal(mediaType('application/json LLM|123|secret'), null);
  assert.equal(mediaType(null), null);
});

test('an adapter error never carries a credential out of the configured URL', async () => {
  const file = path.join(os.tmpdir(), 'muse-adapter-' + process.pid + '.log');
  fs.rmSync(file, { force: true });
  process.env.MUSE_DEBUG_LOG = file;
  // A gateway written with userinfo. `fetch` refuses the URL and says so by
  // quoting the whole of it, so this is not a rare path - it is every request
  // this configuration ever makes.
  // The long path is deliberate: the message quotes the URL, so it is what
  // makes this error long enough to prove the cap holds here too.
  const proxy = await startProxy('https://muse-user:muse-password@127.0.0.1:1/v1/' + 'p'.repeat(400), 'upstream-test-key');
  try {
    const response = await fetch(proxy.url + '/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', messages: [] }),
    });
    assert.equal(response.status, 502);
    const log = fs.readFileSync(file, 'utf8');
    // The fault is still named - that is what the entry is for.
    assert.match(log, /"event":"adapter_error"/);
    assert.match(log, /\[redacted\]/);
    assert.equal(log.includes('muse-password'), false);
    assert.equal(log.includes('muse-user'), false);
    // Bounded like every other provider-written string that reaches the log.
    const entry = JSON.parse(log.split('\n').find(line => line.includes('"adapter_error"')));
    assert.equal(entry.message.length, 300);
  } finally {
    delete process.env.MUSE_DEBUG_LOG;
    fs.rmSync(file, { force: true });
    proxy.server.closeAllConnections(); proxy.server.close();
  }
});

test('an ordinary streaming frame is not mistaken for a failure', () => {
  assert.equal(sseError('event: message_start\ndata: {"type":"message_start"}'), null);
  assert.equal(sseError('data: [DONE]'), null);
  // A frame this cannot read belongs to `sseFrame` to report; a diagnostic must
  // not be what ends a stream.
  assert.equal(sseError('data: {not json'), null);
  assert.equal(
    sseError('event: error\ndata: {"type":"error","error":{"message":"gone"}}'),
    '{"type":"error","error":{"message":"gone"}}'
  );
});

test('cache_control keeps only its type, everywhere it can appear', () => {
  const body = plainCacheControl({
    system: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral', ttl: '1h' } }],
    tools: [{ name: 'x', cache_control: { type: 'ephemeral', ttl: '1h', scope: 'global' } }],
    messages: [{ content: [
      { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } },
      { type: 'tool_result', content: [{ type: 'text', text: 'c', cache_control: { type: 'ephemeral', ttl: '5m' } }] },
    ] }],
    ttl: 'not a cache_control field',
  });
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.tools[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.messages[0].content[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(body.messages[0].content[1].content[0].cache_control, { type: 'ephemeral' });
  assert.equal(body.ttl, 'not a cache_control field');
  assert.equal(body.system[0].text, 'a');
  assert.deepEqual(plainCacheControl({ cache_control: null }), { cache_control: null });
});

test('a tool that has a cache_control of its own keeps it', () => {
  // An MCP tool is free to take an argument called cache_control. Its schema and
  // the inputs of past calls are the tool's data, not protocol metadata: rewrite
  // them and the model is handed a tool description that no longer matches the
  // tool.
  const schema = {
    type: 'object',
    properties: {
      cache_control: { type: 'object', description: 'passed through to the API', properties: { ttl: { type: 'string' } } },
    },
    required: ['cache_control'],
  };
  // Compared against a copy taken now: the function mutates in place, so
  // asserting against `schema` itself would pass however badly it was mangled.
  const untouched = JSON.parse(JSON.stringify(schema));
  const body = plainCacheControl({
    tools: [{ name: 'anthropic_request', input_schema: schema, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ content: [
      { type: 'tool_use', name: 'anthropic_request', input: { cache_control: { type: 'ephemeral', ttl: '1h', note: 'kept' } } },
      { type: 'tool_result', content: [{ type: 'text', text: 'ok' }] },
    ] }],
  });
  // The tool definition's own cache_control is protocol metadata and is reduced.
  assert.deepEqual(body.tools[0].cache_control, { type: 'ephemeral' });
  // Everything below it is not.
  assert.deepEqual(body.tools[0].input_schema, untouched);
  assert.deepEqual(body.messages[0].content[0].input.cache_control, { type: 'ephemeral', ttl: '1h', note: 'kept' });
});

test('web_search keeps only the fields Meta accepts; domain filters are refused', () => {
  const body = webSearchTools({
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 9, user_location: { type: 'approximate' }, cache_control: { type: 'ephemeral' } },
      { name: 'Read', input_schema: { type: 'object' }, max_uses: 3 },
    ],
  });
  assert.deepEqual(Object.keys(body.tools[0]).sort(), ['cache_control', 'name', 'type', 'user_location']);
  // An ordinary client tool is never touched, whatever fields it carries.
  assert.equal(body.tools[1].max_uses, 3);
  for (const field of ['allowed_domains', 'blocked_domains']) {
    assert.throws(
      () => webSearchTools({ tools: [{ type: 'web_search_20250305', name: 'web_search', [field]: ['example.com'] }] }),
      error => error instanceof UnsupportedRequest && error.message.includes(field)
    );
  }
});

test('a Unicode-property pattern is dropped from a tool schema, and nothing else is', () => {
  // The pattern Claude Code 2.1.266 puts on Artifact's `field` argument, taken
  // off the wire. In the CLI it is a regex literal carrying the `u` flag that
  // gives \p{Cc} its meaning; a JSON Schema `pattern` is a bare string with no
  // flags, so what reaches the provider is a regex it refuses to compile.
  const artifact = '^(?!__.*__$)[^\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}"\\\\./[\\]]{1,200}$';
  const plain = '^[a-z0-9_-]+$';
  const body = portableSchemas({
    tools: [
      { name: 'Artifact', input_schema: { type: 'object', $defs: { id: { type: 'string', pattern: '^\\p{Nd}{4}$' } }, properties: {
        field: { type: 'string', description: 'kept', pattern: artifact },
        collection: { type: 'string', pattern: plain },
        doc: { anyOf: [{ type: 'string', pattern: '\\p{L}+' }, { type: 'string', pattern: plain }] },
        rows: { items: { type: 'string', pattern: '\\P{N}' } },
      } } },
      { name: 'Read' },
      { type: 'web_search_20250305', name: 'web_search' },
    ],
    messages: [{ content: [{ type: 'tool_use', name: 'Artifact', input: { pattern: '\\p{L}' } }] }],
  });
  const schema = body.tools[0].input_schema;
  assert.ok(!('pattern' in schema.properties.field));
  assert.equal(schema.properties.doc.anyOf[0].pattern, undefined);
  assert.equal(schema.properties.rows.items.pattern, undefined);
  assert.equal(schema.$defs.id.pattern, undefined);
  // A pattern the provider can compile is a useful constraint and stays.
  assert.equal(schema.properties.collection.pattern, plain);
  assert.equal(schema.properties.doc.anyOf[1].pattern, plain);
  // Only the constraint goes. The property it constrained, and everything the
  // model reads to decide how to call the tool, are left exactly as they were.
  assert.equal(schema.properties.field.type, 'string');
  assert.equal(schema.properties.field.description, 'kept');
  // Tool definitions only. A past call's arguments are the conversation, and a
  // tool is free to take an argument of its own called `pattern`.
  assert.equal(body.messages[0].content[0].input.pattern, '\\p{L}');
});

test('a pattern that is a value rather than a constraint is left alone', () => {
  // `const`, `default`, `enum` and `examples` hold arbitrary JSON, not
  // subschemas. An object inside one of them may have a member named `pattern`,
  // and deleting it would change a value the tool receives instead of a
  // constraint the provider enforces.
  const body = portableSchemas({ tools: [{ name: 'Grep', input_schema: {
    type: 'object',
    properties: {
      rule: { type: 'object', default: { pattern: '\\p{L}+' }, const: { pattern: '\\p{M}' } },
      mode: { enum: [{ pattern: '\\p{N}' }], examples: [{ pattern: '\\p{L}' }] },
    },
  } }] });
  const props = body.tools[0].input_schema.properties;
  assert.equal(props.rule.default.pattern, '\\p{L}+');
  assert.equal(props.rule.const.pattern, '\\p{M}');
  assert.equal(props.mode.enum[0].pattern, '\\p{N}');
  assert.equal(props.mode.examples[0].pattern, '\\p{L}');
});

test('a tool argument named like a schema keyword is still a schema', () => {
  // `properties` and `$defs` map a name the tool chose to a subschema, and that
  // name is not a JSON Schema keyword. Reading an argument called `default` or
  // `enum` as the keyword of the same spelling would skip its schema and leave
  // the pattern in place, which is the 400 this transform exists to prevent.
  const body = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    $defs: { enum: { type: 'string', pattern: '\\p{Lu}' } },
    // draft-07 `dependencies` keys by property name too, and its values are a
    // subschema or a list of required property names.
    dependencies: { default: { properties: { x: { type: 'string', pattern: '\\p{S}' } } }, ok: ['y'] },
    properties: {
      default: { type: 'string', pattern: '\\p{L}+' },
      enum: { type: 'string', pattern: '\\p{N}+' },
      examples: { items: { type: 'string', pattern: '\\p{M}' } },
      // A property whose own name is a schema-map keyword is no different.
      properties: { type: 'string', pattern: '\\p{P}' },
    },
    // The same spellings one level up really are keywords, and hold values.
    default: { pattern: '\\p{L}' },
    enum: [{ pattern: '\\p{N}' }],
  } }] });
  const schema = body.tools[0].input_schema;
  assert.equal(schema.properties.default.pattern, undefined);
  assert.equal(schema.properties.enum.pattern, undefined);
  assert.equal(schema.properties.examples.items.pattern, undefined);
  assert.equal(schema.properties.properties.pattern, undefined);
  assert.equal(schema.$defs.enum.pattern, undefined);
  assert.equal(schema.dependencies.default.properties.x.pattern, undefined);
  assert.deepEqual(schema.dependencies.ok, ['y']);
  assert.equal(schema.default.pattern, '\\p{L}');
  assert.equal(schema.enum[0].pattern, '\\p{N}');
});

test('an unknown keyword is read as a schema; a named annotation is not', () => {
  // A keyword this walker has never heard of is walked as a schema. Guessing
  // wrong that way drops a constraint the provider was going to enforce and
  // widens what the request may carry; guessing wrong the other way leaves a
  // pattern the provider refuses, which ends every turn in the session. Only
  // the second is worth avoiding, so the unknown case is not left to a list of
  // schema-bearing keywords that would have to be complete to be safe.
  const body = portableSchemas({ tools: [{ name: 'X', input_schema: {
    type: 'object',
    // Values, by name and by the `x-` extension space. Left alone.
    example: { pattern: '\\p{L}+' },
    'x-vendor': { metadata: { pattern: '\\p{N}+' } },
    properties: {
      // `contentSchema` really is a subschema keyword, and this walker does
      // not list it. The catch-all is what keeps that from mattering.
      doc: { type: 'string', contentSchema: { type: 'string', pattern: '\\p{M}' } },
    },
  } }] });
  const schema = body.tools[0].input_schema;
  assert.equal(schema.example.pattern, '\\p{L}+');
  assert.equal(schema['x-vendor'].metadata.pattern, '\\p{N}+');
  assert.equal(schema.properties.doc.contentSchema.pattern, undefined);
});

test('a body with no tools, and a tool with no schema, do not throw', () => {
  assert.deepEqual(portableSchemas({}), {});
  assert.deepEqual(portableSchemas({ tools: [] }), { tools: [] });
  assert.deepEqual(portableSchemas({ tools: [{ name: 'Read' }] }), { tools: [{ name: 'Read' }] });
  assert.equal(portableSchemas({ tools: [{ name: 'R', input_schema: null }] }).tools[0].input_schema, null);
  assert.equal(portableSchemas({ tools: [{ name: 'R', input_schema: { pattern: 5 } }] }).tools[0].input_schema.pattern, 5);
});

test('a name claimed by one request does not follow the next one', async () => {
  // The upstream echoes back the tool names it was given, so the test can see
  // what actually left the adapter.
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ tools: JSON.parse(Buffer.concat(chunks)).tools.map(tool => tool.name) }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key');
  const headers = { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' };
  const send = tools => fetch(proxy.url + '/v1/messages', { method: 'POST', headers, body: JSON.stringify({ tools }) });
  try {
    const alias = new ToolNames().shorten(long);
    const first = await send([{ name: long }]);
    assert.equal(first.status, 200);
    assert.deepEqual((await first.json()).tools, [alias]);
    // A later turn with a different tool set, one of them named like the alias
    // the first turn used. Nothing in this request collides with anything in it.
    const second = await send([{ name: alias }]);
    assert.equal(second.status, 200, 'the earlier turn poisoned this one');
    assert.deepEqual((await second.json()).tools, [alias]);
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('the request timer measures silence, not elapsed time', async () => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    if (req.url.endsWith('/silent')) return;
    if (req.url.endsWith('/slowjson')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      // 200 ms of body that is not parseable JSON until the last piece lands.
      for (const piece of ['{"type":', '"message"', ',"content"', ':[]', '}']) {
        await new Promise(resolve => setTimeout(resolve, 40));
        res.write(piece);
      }
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    // Six frames 40 ms apart: 240 ms in total, well past the 150 ms idle limit,
    // with no gap longer than it.
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 40));
      res.write('data: ' + JSON.stringify({ type: 'ping', i }) + '\n\n');
    }
    res.end();
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key', 0.15);
  const headers = { authorization: 'Bearer ' + proxy.token, 'content-type': 'application/json' };
  try {
    const started = Date.now();
    const streamed = await (await fetch(proxy.url + '/v1/messages', { method: 'POST', headers, body: '{}' })).text();
    assert.equal(streamed.match(/data: /g).length, 6);
    assert.ok(Date.now() - started > 150, 'the stream outlived the idle window');
    // A non-streaming body is buffered chunk by chunk, so it counts as activity too.
    const slow = await fetch(proxy.url + '/v1/slowjson', { method: 'POST', headers, body: '{}' });
    assert.equal(slow.status, 200);
    assert.deepEqual(await slow.json(), { type: 'message', content: [] });
    // A connection that goes quiet is still abandoned.
    const silent = await fetch(proxy.url + '/v1/silent', { method: 'POST', headers, body: '{}' });
    assert.equal(silent.status, 502);
  } finally {
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});

test('an upload that stalls mid-body is abandoned too', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startProxy('http://127.0.0.1:' + upstream.address().port, 'upstream-test-key', 0.15);
  const socket = net.connect(Number(new URL(proxy.url).port), '127.0.0.1');
  try {
    await once(socket, 'connect');
    // The headers promise 4096 bytes, two arrive, and the client then holds the
    // connection open without sending the rest or closing it.
    socket.write(
      'POST /v1/messages HTTP/1.1\r\nHost: 127.0.0.1\r\n' +
      'authorization: Bearer ' + proxy.token + '\r\n' +
      'content-type: application/json\r\ncontent-length: 4096\r\n\r\n{}'
    );
    const closed = await Promise.race([
      once(socket, 'close').then(() => true),
      new Promise(resolve => setTimeout(resolve, 2000, false)),
    ]);
    assert.ok(closed, 'the stalled upload was held open past the idle window');
  } finally {
    socket.destroy();
    proxy.server.closeAllConnections(); proxy.server.close();
    upstream.closeAllConnections(); upstream.close();
  }
});
