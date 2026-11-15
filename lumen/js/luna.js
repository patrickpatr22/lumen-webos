/*
 * Lumen – kleine Hülle um den webOS-Luna-Bus.
 *   Luna.call(uri, params)  → Promise mit der Antwort
 *   Luna.exec(befehl)       → Promise mit stdout (über den Homebrew Channel, als root)
 * Außerhalb von webOS (z. B. im Browser) gibt es keinen Bus → Demo-Modus.
 */
(function (global) {
  'use strict';

  var alive = []; // Bridges festhalten, bis die Antwort da ist

  function available() {
    return typeof global.PalmServiceBridge === 'function';
  }

  function call(uri, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!available()) {
        reject(new Error('kein Luna-Bus'));
        return;
      }
      var bridge = new global.PalmServiceBridge();
      var done = false;
      alive.push(bridge);

      function finish() {
        done = true;
        var i = alive.indexOf(bridge);
        if (i >= 0) alive.splice(i, 1);
      }

      var timer = setTimeout(function () {
        if (done) return;
        finish();
        reject(new Error('Zeitüberschreitung: ' + uri));
      }, timeoutMs || 8000);

      bridge.onservicecallback = function (msg) {
        if (done) return;
        clearTimeout(timer);
        finish();
        var res;
        try {
          res = JSON.parse(msg);
        } catch (e) {
          reject(e);
          return;
        }
        if (res.returnValue === false) {
          var err = new Error(res.errorText || 'Luna-Fehler');
          err.response = res;
          reject(err);
        } else {
          resolve(res);
        }
      };

      try {
        bridge.call(uri, JSON.stringify(params || {}));
      } catch (e) {
        clearTimeout(timer);
        finish();
        reject(e);
      }
    });
  }

  function exec(command, timeoutMs) {
    return call('luna://org.webosbrew.hbchannel.service/exec', { command: command }, timeoutMs || 20000)
      .then(function (r) {
        if (r.error) throw new Error(r.error);
        return r.stdoutString || '';
      });
  }

  // Shell-Quoting für einzelne Argumente
  function shq(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  global.Luna = { available: available, call: call, exec: exec, shq: shq };
})(window);
