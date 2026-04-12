/**
 * VoiceChat.js
 * WebRTC proximity voice chat.
 * - Toggle with the 🎙️ button in the header.
 * - When active: connects to all other players who also have voice on.
 * - Signaling goes through Socket.io (voiceOffer / voiceAnswer / voiceIce).
 */

window.VoiceChat = (() => {
  const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  let _localStream = null;
  let _active = false;
  // peerId → RTCPeerConnection
  const _peers = {};

  function _log(...args) { console.log('[VoiceChat]', ...args); }

  // ── Mic access ─────────────────────────────────────────────
  async function _getStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      window.showToast?.('Microphone access denied — voice chat unavailable.');
      return null;
    }
  }

  // ── Create peer connection ──────────────────────────────────
  function _createPeer(peerId, polite) {
    if (_peers[peerId]) return _peers[peerId];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    _peers[peerId] = pc;

    // Add local tracks
    if (_localStream) {
      _localStream.getTracks().forEach(t => pc.addTrack(t, _localStream));
    }

    // Remote audio
    pc.ontrack = ({ streams }) => {
      _log('Remote track from', peerId);
      let audio = document.getElementById('voice-audio-' + peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'voice-audio-' + peerId;
        audio.autoplay = true;
        // Respect current deafen state
        audio.muted = window.SoundManager?.isDeafened() || false;
        document.body.appendChild(audio);
      }
      audio.srcObject = streams[0];
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        window.socket?.emit('voiceIce', { toId: peerId, candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      _log(peerId, 'state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        _removePeer(peerId);
      }
    };

    // Perfect negotiation: impolite peer makes offer
    pc.onnegotiationneeded = async () => {
      if (!polite) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          window.socket?.emit('voiceOffer', { toId: peerId, offer: pc.localDescription });
        } catch (e) { _log('offer error', e); }
      }
    };

    return pc;
  }

  function _removePeer(peerId) {
    const pc = _peers[peerId];
    if (pc) { pc.close(); delete _peers[peerId]; }
    const audio = document.getElementById('voice-audio-' + peerId);
    if (audio) audio.remove();
    _updateVoiceCount();
  }

  // ── Signal handlers (wired after socket is ready) ──────────
  function wireSocketEvents() {
    const socket = window.socket;
    if (!socket) return;

    // Another player joined voice — we initiate (we are impolite/offerer)
    socket.on('playerVoiceJoined', ({ id }) => {
      if (!_active) return;
      _log('peer joined voice:', id);
      _createPeer(id, false); // impolite → will trigger onnegotiationneeded → sends offer
      _updateVoiceCount();
    });

    // Server tells us who is already in voice when we join
    socket.on('voicePresent', (ids) => {
      ids.forEach(id => {
        if (!_active) return;
        _createPeer(id, true); // polite — wait for their offer
      });
      _updateVoiceCount();
    });

    socket.on('playerVoiceLeft', ({ id }) => _removePeer(id));
    socket.on('playerLeft',      ({ id }) => _removePeer(id));

    socket.on('voiceOffer', async ({ fromId, offer }) => {
      if (!_active) return;
      const pc = _createPeer(fromId, true);
      try {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voiceAnswer', { toId: fromId, answer: pc.localDescription });
      } catch (e) { _log('answer error', e); }
    });

    socket.on('voiceAnswer', async ({ fromId, answer }) => {
      const pc = _peers[fromId];
      if (!pc) return;
      try { await pc.setRemoteDescription(answer); } catch (e) { _log('setRemote error', e); }
    });

    socket.on('voiceIce', async ({ fromId, candidate }) => {
      const pc = _peers[fromId];
      if (!pc) return;
      try { await pc.addIceCandidate(candidate); } catch (e) { _log('ice error', e); }
    });
  }

  // ── Toggle ──────────────────────────────────────────────────
  async function toggle() {
    if (_active) {
      _deactivate();
    } else {
      await _activate();
    }
    _updateBtn();
    return _active;
  }

  async function _activate() {
    _localStream = await _getStream();
    if (!_localStream) return;
    _active = true;
    window.socket?.emit('voiceJoined');
    _log('voice activated');
  }

  function _deactivate() {
    _active = false;
    Object.keys(_peers).forEach(_removePeer);
    if (_localStream) {
      _localStream.getTracks().forEach(t => t.stop());
      _localStream = null;
    }
    window.socket?.emit('voiceLeft');
    _log('voice deactivated');
  }

  function _updateBtn() {
    const btn = document.getElementById('voice-btn');
    if (!btn) return;
    btn.textContent = _active ? '🔴' : '🎙️';
    btn.title = _active ? 'Leave voice chat' : 'Join voice chat';
    btn.classList.toggle('voice-active', _active);
  }

  function _updateVoiceCount() {
    const btn = document.getElementById('voice-btn');
    if (!btn) return;
    const n = Object.keys(_peers).length;
    btn.dataset.peers = n > 0 ? n : '';
  }

  // Mute/unmute local mic (reuse existing mic button state)
  function setMuted(muted) {
    if (_localStream) {
      _localStream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    }
  }

  return { toggle, wireSocketEvents, setMuted };
})();
