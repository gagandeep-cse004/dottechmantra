// Chat widget logic: text and speech support, sends messages to /api/chat
(function(){
  // Create minimal UI if not present
  const openBtn = document.getElementById('openChatBtn');
  const panel = document.getElementById('chatPanel');
  // If chatPanel doesn't exist, create a simple one.
  if (!panel) {
    console.warn('Chat panel not found; chat-widget requires elements with ids: openChatBtn, chatPanel');
    return;
  }

  const messagesDiv = panel.querySelector('#messages') || (function(){
    const d = document.createElement('div'); d.id='messages'; d.style.padding='12px'; d.style.height='270px'; d.style.overflow='auto'; return d;
  })();
  if (!panel.querySelector('#messages')) panel.insertBefore(messagesDiv, panel.firstChild);

  let input = panel.querySelector('#chatInput');
  if (!input) {
    input = document.createElement('input'); input.id='chatInput'; input.placeholder='Ask me about Dot TechMantra...'; input.style.width='calc(100% - 100px)'; input.style.margin='8px';
    const send = document.createElement('button'); send.id='sendChat'; send.textContent='Send'; send.style.margin='8px';
    const controls = document.createElement('div'); controls.style.display='flex'; controls.appendChild(input); controls.appendChild(send); panel.appendChild(controls);
  }

  const sendBtn = panel.querySelector('#sendChat');
  const speakBtn = panel.querySelector('#speakBtn');

  // Conversation state for UI; we can optionally persist to localStorage
  const conversation = [];

  function appendMessage(who, text) {
    const el = document.createElement('div');
    el.style.margin='8px 0';
    el.innerHTML = `<strong>${who}:</strong> <span>${escapeHtml(text)}</span>`;
    messagesDiv.appendChild(el);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escapeHtml(s) { if (s===null||s===undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function sendMessage(text) {
    appendMessage('You', text);
    // Send to backend
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ message: text })
      });
      const data = await resp.json();
      if (!resp.ok) {
        appendMessage('Bot', 'Error: ' + (data && data.error ? JSON.stringify(data) : 'Unknown'));
        return;
      }
      const reply = data.reply || '';
      appendMessage('Bot', reply);
      speakText(reply);
    } catch (e) {
      appendMessage('Bot', 'Network error: ' + (e && e.message ? e.message : e));
    }
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    } catch (e) { console.warn('TTS failed', e); }
  }

  // Hook up send button and Enter key
  if (sendBtn) sendBtn.addEventListener('click', ()=>{ const v = input.value || ''; if (v.trim()) { sendMessage(v.trim()); input.value=''; } });
  input.addEventListener('keydown', (e)=>{ if (e.key==='Enter') { e.preventDefault(); sendBtn.click(); } });

  // Speech recognition (optional)
  let recog;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recog = new SpeechRecognition(); recog.lang='en-US'; recog.interimResults=false; recog.maxAlternatives=1;
    if (!speakBtn) {
      const sb = document.createElement('button'); sb.id='speakBtn'; sb.textContent='🎤'; sb.title='Speak'; sb.style.margin='8px'; panel.appendChild(sb);
    }
    const speakButton = panel.querySelector('#speakBtn');
    speakButton.addEventListener('click', ()=>{ try { recog.start(); } catch(e){} });
    recog.onresult = (ev)=>{ const t = ev.results[0][0].transcript; input.value = t; sendMessage(t); };
    recog.onerror = (ev)=>{ console.warn('Speech recognition error', ev); };
  }

  // Open/close panel toggle
  if (openBtn) openBtn.addEventListener('click', ()=>{ panel.style.display = panel.style.display==='none'?'block':'none'; });

  // Small helper: pre-fill with a friendly greeting from bot
  setTimeout(()=>{ appendMessage('Bot', 'Hello! I am Dot TechMantra assistant. Ask about the founder, team, services or say "next" to continue guided steps.'); }, 300);

})();
