/**
 * CallManager.js
 * Per-player voice/video calls with group call support via mesh WebRTC.
 *
 *  - Click 📞 on a player in the member list to start a 1-on-1 call.
 *  - While in a call, clicking 📞 on another player invites them in (group call).
 *  - Accept / Decline incoming call notifications.
 *  - Toggle mic mute and camera from the active call panel.
 */

window.CallManager = (() => {
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  let _localStream    = null;   // audio (+ optional video) tracks
  let _callId         = null;
  let _inCall         = false;
  let _videoEnabled   = false;
  let _muted          = false;
  let _incomingTimer  = null;

  // peerId → RTCPeerConnection
  const _peers = {};

  function _log(...a) { console.log('[CallManager]', ...a); }

  // ── Media ─────────────────────────────────────────────────
  async function _getMedia(video) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
    } catch (e) {
      window.showToast?.('🎤 Microphone access denied — call unavailable.');
      return null;
    }
  }

  // ── RTCPeerConnection helpers ─────────────────────────────
  function _createPeer(peerId, polite) {
    if (_peers[peerId]) return _peers[peerId];
    const pc = new RTCPeerConnection(ICE);
    _peers[peerId] = pc;

    // Add local tracks to the peer
    if (_localStream) {
      _localStream.getTracks().forEach(t => pc.addTrack(t, _localStream));
    }

    // Remote tracks → tile in the call panel
    pc.ontrack = ({ streams }) => {
      _log('Remote track from', peerId);
      _upsertRemoteTile(peerId, streams[0]);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) window.socket?.emit('callIce', { toId: peerId, candidate });
    };

    pc.onconnectionstatechange = () => {
      _log(peerId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        _removePeer(peerId);
      }
    };

    // Perfect negotiation: impolite peer makes the offer
    pc.onnegotiationneeded = async () => {
      if (!polite) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          window.socket?.emit('callOffer', { toId: peerId, offer: pc.localDescription });
        } catch (e) { _log('offer error', e); }
      }
    };

    return pc;
  }

  function _removePeer(peerId) {
    const pc = _peers[peerId];
    if (pc) { pc.close(); delete _peers[peerId]; }
    document.getElementById('call-tile-' + peerId)?.remove();
    _refreshPanelState();
  }

  // ── Video/audio tiles ─────────────────────────────────────
  function _upsertRemoteTile(peerId, stream) {
    const grid = document.getElementById('call-video-grid');
    if (!grid) return;
    let tile = document.getElementById('call-tile-' + peerId);
    if (!tile) {
      tile = document.createElement('div');
      tile.id    = 'call-tile-' + peerId;
      tile.className = 'call-tile';
      const vid = document.createElement('video');
      vid.autoplay    = true;
      vid.playsInline = true;
      vid.muted       = window.SoundManager?.isDeafened() || false;
      tile.appendChild(vid);
      const lbl = document.createElement('div');
      lbl.className   = 'call-tile-label';
      lbl.textContent = window._allPlayers?.[peerId]?.name || peerId.slice(0, 6);
      tile.appendChild(lbl);
      grid.appendChild(tile);
    }
    tile.querySelector('video').srcObject = stream;
    _refreshPanelState();
  }

  function _upsertLocalTile(stream) {
    const grid = document.getElementById('call-video-grid');
    if (!grid) return;
    let tile = document.getElementById('call-tile-local');
    if (!tile) {
      tile = document.createElement('div');
      tile.id        = 'call-tile-local';
      tile.className = 'call-tile call-tile-local';
      const vid = document.createElement('video');
      vid.autoplay    = true;
      vid.playsInline = true;
      vid.muted       = true;   // always muted locally (prevent feedback)
      tile.appendChild(vid);
      const lbl = document.createElement('div');
      lbl.className   = 'call-tile-label';
      lbl.textContent = sessionStorage.getItem('studyspace_name') || 'You';
      tile.appendChild(lbl);
      grid.prepend(tile);
    }
    tile.querySelector('video').srcObject = stream;
  }

  function _removeLocalTile() {
    document.getElementById('call-tile-local')?.remove();
  }

  // ── Call panel ─────────────────────────────────────────────
  function _showCallPanel() {
    document.getElementById('active-call-panel')?.classList.remove('hidden');
  }
  function _hideCallPanel() {
    document.getElementById('active-call-panel')?.classList.add('hidden');
    const grid = document.getElementById('call-video-grid');
    if (grid) grid.innerHTML = '';
    _refreshPanelState();
  }
  function _refreshPanelState() {
    const n   = Object.keys(_peers).length;
    const el  = document.getElementById('call-participant-count');
    if (el) el.textContent = n === 0 ? 'waiting…' : n + (n === 1 ? ' person' : ' people');

    // Keep the grid visible even with 0 remote peers (show "waiting" tile)
    const grid = document.getElementById('call-video-grid');
    if (grid) {
      let waiting = document.getElementById('call-waiting-msg');
      if (n === 0 && _inCall) {
        if (!waiting) {
          waiting = document.createElement('div');
          waiting.id        = 'call-waiting-msg';
          waiting.className = 'call-waiting-msg';
          waiting.textContent = 'Waiting for others…';
          grid.appendChild(waiting);
        }
      } else {
        waiting?.remove();
      }
    }
  }

  // ── Incoming call notification ─────────────────────────────
  function _showIncoming(callId, fromId, fromName) {
    const el = document.getElementById('incoming-call');
    if (!el) return;
    el.dataset.callId = callId;
    el.dataset.fromId = fromId;
    const nameEl = document.getElementById('incoming-call-name');
    if (nameEl) nameEl.textContent = fromName;
    el.classList.remove('hidden');
    clearTimeout(_incomingTimer);
    _incomingTimer = setTimeout(() => declineCall(callId), 30000);
  }
  function _hideIncoming() {
    document.getElementById('incoming-call')?.classList.add('hidden');
    clearTimeout(_incomingTimer);
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Start a call with a player, or invite them into the current call.
   * @param {string} peerId     socket ID
   * @param {string} peerName   display name
   */
  async function startCall(peerId, peerName) {
    if (_inCall && _callId) {
      // Already in a call — invite this player
      window.socket?.emit('callInvite', { callId: _callId, toId: peerId });
      window.showToast?.('📞 Invited ' + peerName + ' to your call');
      return;
    }
    _localStream = await _getMedia(_videoEnabled);
    if (!_localStream) return;
    window.socket?.emit('callRequest', { toId: peerId });
    // callCreated will arrive back → sets _callId + _inCall
    _upsertLocalTile(_localStream);
    _showCallPanel();
    _refreshPanelState();
    window.showToast?.('📞 Calling ' + peerName + '…');
  }

  /** Accept an incoming call. */
  async function acceptCall(callId) {
    _hideIncoming();
    if (_inCall) await leaveCall();   // leave previous call if any
    _localStream = await _getMedia(_videoEnabled);
    if (!_localStream) {
      window.socket?.emit('callDecline', { callId });
      return;
    }
    _callId  = callId;
    _inCall  = true;
    window.socket?.emit('callAccept', { callId });
    _upsertLocalTile(_localStream);
    _showCallPanel();
    _refreshPanelState();
  }

  /** Decline an incoming call. */
  function declineCall(callId) {
    _hideIncoming();
    window.socket?.emit('callDecline', { callId });
  }

  /** Leave the current active call. */
  async function leaveCall() {
    if (!_callId) return;
    const cid = _callId;
    _callId  = null;
    _inCall  = false;
    _muted   = false;
    Object.keys(_peers).forEach(_removePeer);
    if (_localStream) {
      _localStream.getTracks().forEach(t => t.stop());
      _localStream = null;
    }
    _removeLocalTile();
    _hideCallPanel();
    window.socket?.emit('callLeave', { callId: cid });
    // Reset button labels
    const muteBtn  = document.getElementById('call-mute-btn');
    const vidBtn   = document.getElementById('call-video-btn');
    if (muteBtn) { muteBtn.textContent = '🎤'; muteBtn.classList.remove('muted'); }
    if (vidBtn)  { vidBtn.textContent  = '📷 (off)'; }
  }

  /** Toggle microphone mute. Returns true if now muted. */
  function toggleMute() {
    if (!_localStream) return _muted;
    const track = _localStream.getAudioTracks()[0];
    if (!track) return _muted;
    _muted         = !_muted;
    track.enabled  = !_muted;
    const btn = document.getElementById('call-mute-btn');
    if (btn) {
      btn.textContent = _muted ? '🔇' : '🎤';
      btn.classList.toggle('muted', _muted);
      btn.title = _muted ? 'Unmute' : 'Mute mic';
    }
    return _muted;
  }

  /** Toggle camera on/off. */
  async function toggleVideo() {
    _videoEnabled = !_videoEnabled;
    const btn = document.getElementById('call-video-btn');
    if (!_localStream) {
      if (btn) btn.textContent = _videoEnabled ? '📷' : '📷 (off)';
      return;
    }
    if (_videoEnabled) {
      try {
        const vs    = await navigator.mediaDevices.getUserMedia({ video: true });
        const vt    = vs.getVideoTracks()[0];
        _localStream.addTrack(vt);
        // Push new track to all active peer connections
        Object.values(_peers).forEach(pc => pc.addTrack(vt, _localStream));
        if (btn) btn.textContent = '📷';
        // Refresh local tile so the video shows up
        const lv = document.querySelector('#call-tile-local video');
        if (lv) lv.srcObject = _localStream;
      } catch (e) {
        _videoEnabled = false;
        window.showToast?.('📷 Camera access denied.');
        if (btn) btn.textContent = '📷 (off)';
      }
    } else {
      // Stop and remove video tracks
      _localStream.getVideoTracks().forEach(t => { t.stop(); _localStream.removeTrack(t); });
      if (btn) btn.textContent = '📷 (off)';
    }
  }

  /** Mute/unmute all remote audio elements (called by deafen toggle). */
  function setDeafened(val) {
    document.querySelectorAll('#call-video-grid .call-tile:not(.call-tile-local) video')
      .forEach(v => { v.muted = val; });
  }

  // ── Socket event wiring ────────────────────────────────────
  function wireSocketEvents() {
    const socket = window.socket;
    if (!socket) return;

    // Server echoes callId back to caller
    socket.on('callCreated', ({ callId }) => {
      _callId = callId;
      _inCall = true;
      _refreshPanelState();
    });

    // Incoming call from another player
    socket.on('incomingCall', ({ callId, fromId, fromName }) => {
      _log('Incoming call from', fromName);
      _showIncoming(callId, fromId, fromName);
      window.SoundManager?.play('coin');
    });

    // Server sends list of participants already in the call (on accept)
    // We are the new joiner → we are impolite and send offers to everyone
    socket.on('callJoined', ({ callId, participants }) => {
      _log('Joined call', callId, 'participants:', participants);
      participants.forEach(pid => _createPeer(pid, false));
    });

    // Someone new joined our existing call → they will offer (we are polite)
    socket.on('callParticipantJoined', ({ callId, peerId, peerName }) => {
      if (_callId !== callId) return;
      _log('Participant joined:', peerName);
      _createPeer(peerId, true);
      window.showToast?.('📞 ' + peerName + ' joined the call');
    });

    socket.on('callParticipantLeft', ({ callId, peerId }) => {
      if (_callId !== callId) return;
      _removePeer(peerId);
    });

    socket.on('callDeclined', ({ callId, byName }) => {
      window.showToast?.('📵 ' + byName + ' declined the call');
      // If we're the sole caller and they declined, end the call
      if (_callId === callId && Object.keys(_peers).length === 0) {
        leaveCall();
      }
    });

    socket.on('callEnded', ({ callId }) => {
      if (_callId !== callId) return;
      window.showToast?.('📵 Call ended');
      leaveCall();
    });

    // WebRTC relay
    socket.on('callOffer', async ({ fromId, offer }) => {
      if (!_inCall) return;
      const pc = _createPeer(fromId, true);
      try {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('callAnswer', { toId: fromId, answer: pc.localDescription });
      } catch (e) { _log('answer error', e); }
    });

    socket.on('callAnswer', async ({ fromId, answer }) => {
      const pc = _peers[fromId];
      if (!pc) return;
      try { await pc.setRemoteDescription(answer); } catch (e) { _log('setRemote', e); }
    });

    socket.on('callIce', async ({ fromId, candidate }) => {
      const pc = _peers[fromId];
      if (!pc) return;
      try { await pc.addIceCandidate(candidate); } catch (_) {}
    });
  }

  function isInCall() { return _inCall; }

  function getPeerIds() { return Object.keys(_peers); }

  return { startCall, acceptCall, declineCall, leaveCall, toggleMute, toggleVideo, setDeafened, wireSocketEvents, isInCall, getPeerIds };
})();
