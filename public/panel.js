const $ = id => document.getElementById(id);
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
let state = { csrf: '', pending: [], canon: [], rejectedCount: 0 };
let voiceRevision = '', savedVoice = '', voiceLoaded = false, voiceSaving = false;
let refreshing = false, refreshAgain = false, initialized = false, syncError = false;
const reviewing = new Set();
function message(id, text, error = false) { $(id).textContent = text; $(id).className = 'message' + (error ? ' error' : ''); }
async function api(path, options = {}) {
  const response = await fetch(path, { signal: AbortSignal.timeout(8000), ...options, headers: { 'Content-Type': 'application/json', 'X-Canon-CSRF': state.csrf, ...options.headers } });
  let data; try { data = await response.json(); } catch { throw Error('Could not read the server response.'); }
  if (!response.ok) throw Error(data.error || data.message || 'Request failed. Try refreshing the panel.');
  return data;
}
function stamp(entry) { return 'Proposed by ' + entry.author + ' · ' + new Date(entry.createdAt).toLocaleDateString(); }
function empty(title, detail) { const node = element('div', 'empty'); node.append(element('strong', '', title), document.createTextNode(detail)); return node; }
function renderPending() {
  $('pendingCount').textContent = state.pending.length;
  $('queueCount').textContent = state.pending.length + ' pending';
  const nodes = state.pending.map(entry => {
    const card = element('article', 'proposal'); card.append(element('h3', '', entry.term), element('p', 'definition', entry.definition));
    const footer = element('div', 'card-footer'); footer.append(element('span', 'meta', stamp(entry)));
    const actions = element('div', 'actions');
    for (const [action, label, style] of [['approve', 'Approve & reveal', ''], ['reject', 'Reject', 'reject']]) {
      const button = element('button', style, label); button.disabled = reviewing.has(entry.id);
      button.setAttribute('aria-label', label + ' ' + entry.term); button.onclick = () => review(entry, action); actions.append(button);
    }
    footer.append(actions); card.append(footer); return card;
  });
  $('pendingList').replaceChildren(...(nodes.length ? nodes : [empty('The next chapter is unwritten.', 'New !canon add proposals appear here automatically.')]));
}
function renderCounts(value) { const counts = CanonLive.counts(value); if (counts) $('canonTotals').textContent = counts.total + ' total canon · ' + counts.session + ' canonized this session'; }
function renderCanon() {
  $('canonCount').textContent = state.canon.length; $('rejectedCount').textContent = state.rejectedCount;
  const query = $('search').value.trim().toLocaleLowerCase();
  const entries = state.canon.filter(entry => [entry.term, entry.definition, entry.author].some(text => text.toLocaleLowerCase().includes(query)));
  $('librarySummary').textContent = query ? entries.length + ' of ' + state.canon.length + ' entries match.' : 'Every chapter, saved across streams.';
  const nodes = entries.map(entry => { const card = element('article', 'lore-card'); card.append(element('h3', '', entry.term), element('p', 'definition', entry.definition), element('div', 'meta', 'By ' + entry.author + ' · ' + new Date(entry.createdAt).toLocaleDateString())); return card; });
  $('canonList').replaceChildren(...(nodes.length ? nodes : [empty(query ? 'No matching lore.' : 'No canon yet.', query ? 'Try a different term or author.' : 'Approve a proposal or use Seed starter lore to begin.')]));
}
async function refreshPanel() {
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try { const previous = state; const incoming = await api('/api/panel'); if (!incoming || !Array.isArray(incoming.pending) || !Array.isArray(incoming.canon)) throw Error('Invalid panel snapshot. Retrying.'); state = incoming; renderCounts(state.counts); if (syncError) { message('panelMessage', 'Connection restored.'); syncError = false; } $('storageMessage').textContent = state.storage?.warning || ''; if (!initialized || JSON.stringify(previous.pending) !== JSON.stringify(state.pending)) renderPending(); if (!initialized || JSON.stringify(previous.canon) !== JSON.stringify(state.canon)) renderCanon(); $('rejectedCount').textContent = state.rejectedCount; initialized = true; $('syncStatus').textContent = 'Memory synced · ' + new Date().toLocaleTimeString(); }
  catch (error) { syncError = true; message('panelMessage', error.message, true); }
  finally { refreshing = false; if (refreshAgain) { refreshAgain = false; void refreshPanel(); } }
}
async function review(entry, action) {
  if (reviewing.has(entry.id)) return;
  reviewing.add(entry.id); renderPending();
  try { await api('/api/panel/proposals/' + entry.id + '/review', { method: 'POST', body: JSON.stringify({ action }) }); message('panelMessage', action === 'approve' ? 'CANONIZED: ' + entry.term + '. Your overlay is revealing it now.' : 'Rejected “' + entry.term + '”. It remains outside the canon.'); }
  catch (error) { message('panelMessage', error.message, true); }
  finally { reviewing.delete(entry.id); await refreshPanel(); }
}
function voiceDirty() { return voiceLoaded && $('voiceText').value !== savedVoice; }
function updateVoice() { const text = $('voiceText').value; $('voiceCount').textContent = text.length + ' / 8000'; $('voiceState').textContent = !voiceLoaded ? 'Not loaded' : voiceDirty() ? 'Unsaved changes' : 'Saved'; $('saveVoice').disabled = voiceSaving || !voiceDirty() || !text.trim() || text.length > 8000; }
async function loadVoice() {
  $('reloadVoice').disabled = true;
  try { const voice = await api('/api/panel/voice'); savedVoice = voice.text; voiceRevision = voice.revision; voiceLoaded = true; $('voiceText').value = voice.text; $('voiceText').disabled = false; message('voiceMessage', 'Saved version loaded.'); updateVoice(); }
  catch (error) { message('voiceMessage', error.message, true); }
  finally { $('reloadVoice').disabled = false; }
}
let chatMessages = [], chatRefreshing = false, chatRefreshAgain = false, captureSources = null, captureSaving = false;
const selectedChat = new Set();
function renderChat() {
  $('chatSelected').textContent = selectedChat.size + ' selected · up to 5';
  $('draftChat').disabled = !selectedChat.size || !!captureSources;
  $('clearChatSelection').disabled = !!captureSources;
  const nodes = [...chatMessages].reverse().map(item => {
    const label = element('label', 'chat-row');
    const check = element('input'); check.type = 'checkbox'; check.checked = selectedChat.has(item.id); check.disabled = !!captureSources;
    check.setAttribute('aria-label', 'Select message from ' + item.author + ': ' + item.text);
    check.onchange = () => {
      if (check.checked && selectedChat.size >= 5) { check.checked = false; message('chatCaptureMessage', 'Choose up to five messages for one moment.', true); return; }
      if (check.checked) selectedChat.add(item.id); else selectedChat.delete(item.id);
      $('chatSelected').textContent = selectedChat.size + ' selected · up to 5'; $('draftChat').disabled = !selectedChat.size;
    };
    const body = element('span'); body.append(element('strong', '', item.author + (item.local ? ' · LOCAL REHEARSAL' : '')), element('span', 'chat-text', item.text));
    label.append(check, body); return label;
  });
  $('chatList').replaceChildren(...(nodes.length ? nodes : [empty('Waiting for the next moment.', 'Viewer messages appear here while Twitch is connected. Try Offline chat rehearsal below.')]));
}
async function refreshChat() {
  if (chatRefreshing) { chatRefreshAgain = true; return; }
  chatRefreshing = true;
  try {
    const data = await api('/api/panel/chat');
    if (!data || !Array.isArray(data.messages) || data.messages.length > 50) throw Error('Could not read recent chat.');
    const valid = data.messages.filter(item => item && typeof item.id === 'string' && item.id.length <= 200 && typeof item.author === 'string' && item.author.length <= 80 && typeof item.text === 'string' && item.text.length <= 500);
    const available = new Set(valid.map(item => item.id));
    if (!captureSources) for (const id of selectedChat) if (!available.has(id)) selectedChat.delete(id);
    if (JSON.stringify(chatMessages) !== JSON.stringify(valid)) { chatMessages = valid; renderChat(); }
    $('chatConnection').textContent = 'Recent chat synced · newest first · ' + valid.length + ' available';
  } catch { $('chatConnection').textContent = 'Recent chat unavailable. Your draft is kept; reconnecting automatically.'; }
  finally { chatRefreshing = false; if (chatRefreshAgain) { chatRefreshAgain = false; void refreshChat(); } }
}
function discardCapture() {
  captureSources = null; selectedChat.clear(); $('captureForm').hidden = true; $('captureHint').hidden = false;
  $('captureTerm').value = ''; $('captureDefinition').value = ''; $('captureSources').replaceChildren(); renderChat();
}
$('draftChat').onclick = () => {
  captureSources = chatMessages.filter(item => selectedChat.has(item.id));
  if (!captureSources.length) { captureSources = null; return; }
  $('captureSources').replaceChildren(...captureSources.map(item => element('li', '', item.author + (item.local ? ' (local rehearsal)' : '') + ': ' + item.text)));
  if (!$('captureDefinition').value) $('captureDefinition').value = captureSources.map(item => item.text).join(' / ').slice(0, 1000);
  $('captureForm').hidden = false; $('captureHint').hidden = true; renderChat(); $('captureTerm').focus();
  message('chatCaptureMessage', 'Edit the quotes into lore, then save your proposal.');
};
$('clearChatSelection').onclick = () => { selectedChat.clear(); renderChat(); };
$('reselectChatCapture').onclick = () => { captureSources = null; selectedChat.clear(); $('captureForm').hidden = true; $('captureHint').hidden = false; renderChat(); message('chatCaptureMessage', 'Draft text kept. Select recent sources and click Draft lore to resume.'); };
$('discardChatCapture').onclick = () => { discardCapture(); message('chatCaptureMessage', 'Draft discarded. Nothing was saved.'); };
$('captureForm').onsubmit = async event => {
  event.preventDefault(); if (captureSaving || !captureSources) return;
  captureSaving = true; $('saveChatCapture').disabled = true; $('discardChatCapture').disabled = true; $('reselectChatCapture').disabled = true;
  try {
    const data = await api('/api/panel/chat/capture', { method: 'POST', body: JSON.stringify({ messageIds: captureSources.map(item => item.id), term: $('captureTerm').value.trim(), definition: $('captureDefinition').value.trim() }) });
    discardCapture(); message('chatCaptureMessage', 'Saved “' + data.entry.term + '” as a pending proposal. Approve it in the queue below.'); await refreshPanel();
  } catch (error) { message('chatCaptureMessage', error.message, true); }
  finally { captureSaving = false; $('saveChatCapture').disabled = false; $('discardChatCapture').disabled = false; $('reselectChatCapture').disabled = false; }
};
$('addChatDemo').onclick = async () => {
  $('addChatDemo').disabled = true;
  try { await api('/api/panel/chat/rehearse', { method: 'POST', body: JSON.stringify({ author: $('chatDemoAuthor').value, text: $('chatDemoText').value }) }); await refreshChat(); message('chatCaptureMessage', 'Local rehearsal message added. Nothing was sent to Twitch.'); }
  catch (error) { message('chatCaptureMessage', error.message, true); }
  finally { $('addChatDemo').disabled = false; }
};
$('voiceText').oninput = () => { updateVoice(); message('voiceMessage', ''); };
$('reloadVoice').onclick = loadVoice;
$('saveVoice').onclick = async () => {
  const text = $('voiceText').value;
  voiceSaving = true; $('reloadVoice').disabled = true; updateVoice();
  try { const voice = await api('/api/panel/voice', { method: 'PUT', body: JSON.stringify({ text, revision: voiceRevision }) }); savedVoice = voice.text; voiceRevision = voice.revision; message('voiceMessage', 'Voice persona saved.'); }
  catch (error) { message('voiceMessage', error.message, true); }
  finally { voiceSaving = false; $('reloadVoice').disabled = false; updateVoice(); }
};
window.addEventListener('beforeunload', event => { if (voiceDirty()) { event.preventDefault(); event.returnValue = ''; } });
$('seedStarter').onclick = async () => {
  $('seedStarter').disabled = true;
  try {
    const result = await api('/api/panel/seed-starter', { method: 'POST', body: '{}' });
    message('panelMessage', 'Starter lore: ' + result.added + ' added · ' + result.alreadyPresent + ' already present.');
  } catch (error) { message('panelMessage', error.message, true); }
  finally { await refreshPanel(); $('seedStarter').disabled = false; }
};
$('search').oninput = renderCanon;
$('runDemo').onclick = async () => { $('runDemo').disabled = true; try { const result = await api('/api/panel/rehearse', { method: 'POST', body: JSON.stringify({ command: $('demoCommand').value }) }); message('demoReply', result.reply); await refreshPanel(); } catch (error) { message('demoReply', error.message, true); } finally { $('runDemo').disabled = false; } };
$('overlayUrl').textContent = location.origin + '/overlay';
$('fire').onclick = async () => { $('fire').disabled = true; try { const data = await api('/api/test-canonized', { method: 'POST', body: '{}' }); message('testMessage', 'TEST reveal sent: ' + data.entry.term); } catch (error) { message('testMessage', error.message, true); } finally { setTimeout(() => $('fire').disabled = false, 1500); } };
function pill(id, active, text) { $(id).textContent = text; $(id).className = 'pill' + (active ? ' live' : ''); }
async function updateTwitch() {
  try {
    const data = await api('/api/twitch/status'); const events = data.eventsub;
    pill('chatPill', data.connected, data.connected ? 'Chat connected' : 'Chat offline'); pill('eventsPill', events.ready, events.ready ? 'Events ready' : 'Events pending');
    $('twitchStatus').textContent = data.message;
    $('twitchConfig').textContent = 'Channel: ' + (data.channel || 'not configured') + ' · Bot: ' + (data.botExpected || 'not configured') + ' · Callback: ' + data.redirectUri;
    $('eventsubStatus').textContent = events.message; $('eventsubReward').textContent = events.rewardTitle + ' · ' + events.reward; $('eventsubLast').textContent = events.lastEvent;
    $('eventsubSubscriptions').replaceChildren(...Object.entries(events.subscriptions).map(([type, status]) => element('li', '', type + ' — ' + status)));
    for (const [id, text, authorized] of [['authorizeBot', 'bot account', data.connected], ['authorizeBroadcaster', 'broadcaster', events.authorized]]) { $(id).hidden = !(data.enabled && data.configured); $(id).textContent = (authorized ? 'Reauthorize ' : 'Authorize ') + text + ' ↗'; }
  } catch { pill('chatPill', false, 'Server unavailable'); pill('eventsPill', false, 'Events offline'); }
}
let retry = 1000;
function connect() {
  const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  let lastMessage = Date.now();
  const watchdog = setInterval(() => { if (Date.now() - lastMessage > 35_000) socket.close(); }, 5000);
  socket.onopen = () => { retry = 1000; lastMessage = Date.now(); $('overlayStatus').textContent = 'Live connection'; void refreshPanel(); void refreshChat(); };
  socket.onmessage = ({ data }) => { const event = CanonLive.parse(data); if (!event) return; lastMessage = Date.now(); if (event.type === 'chat-changed') void refreshChat(); if (event.type === 'snapshot') renderCounts(event.counts); if (event.type === 'pending-changed' || event.type === 'snapshot') void refreshPanel(); };
  socket.onclose = () => { clearInterval(watchdog); $('overlayStatus').textContent = 'Reconnecting'; setTimeout(connect, retry); retry = Math.min(retry * 2, 15000); };
  socket.onerror = () => socket.close();
}
void refreshChat(); setInterval(refreshChat, 15000);
void refreshPanel().then(loadVoice); void updateTwitch(); connect();
setInterval(updateTwitch, 5000); setInterval(refreshPanel, 15000);
