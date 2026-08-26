// Party Blitz — websocket client with auto-reconnect + session restore.
(function () {
  const WS_PATH = '/ws/party-minigames';

  function wsUrl(extra) {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    let url = proto + location.host + WS_PATH;
    if (extra) url += '?' + extra;
    return url;
  }

  const Net = {
    sock: null,
    status: 'idle', // idle | connecting | open | closed
    onMsg: null, onOpen: null, onClose: null,
    _backoff: 400, _timer: null, _wantClose: false, _auto: true,

    connect(query) {
      this._wantClose = false;
      this._doConnect(query);
    },

    _doConnect(query) {
      this.closeSock();
      clearTimeout(this._timer);
      this.status = 'connecting';
      let sock;
      try { sock = new WebSocket(wsUrl(query)); }
      catch (e) { this._scheduleRetry(query); return; }
      this.sock = sock;
      sock.onopen = () => {
        this.status = 'open';
        this._backoff = 400;
        if (this.onOpen) this.onOpen();
      };
      sock.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (this.onMsg) this.onMsg(m);
      };
      sock.onclose = () => {
        if (this.sock !== sock) return;
        this.sock = null;
        this.status = 'closed';
        if (this._wantClose) {
          if (this.onClose) this.onClose(false);
          return;
        }
        if (this._auto && this.onClose) this.onClose(true);
        this._scheduleRetry(this._lastQuery);
      };
      sock.onerror = () => { /* onclose follows */ };
      this._lastQuery = query;
    },

    _scheduleRetry(query) {
      if (this._wantClose || !this._auto) return;
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._doConnect(query), this._backoff);
      this._backoff = Math.min(5000, this._backoff * 1.6 + 200);
    },

    send(obj) {
      if (this.sock && this.sock.readyState === 1) {
        this.sock.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
        return true;
      }
      return false;
    },

    closeSock() {
      const s = this.sock;
      this.sock = null;
      if (s) { s.onclose = null; s.onmessage = null; s.onopen = null; s.onerror = null; try { s.close(); } catch (e) {} }
    },

    disconnect() {
      this._wantClose = true;
      this._auto = true;
      clearTimeout(this._timer);
      this.closeSock();
      this.status = 'idle';
    },
  };

  window.PBNet = Net;
})();
