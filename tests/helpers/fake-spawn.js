// Replace what a spawn the page starts actually runs, without touching the
// host. Cockpit sends a channel's argv in the "open" control message over
// the WebSocket ("\n" + JSON on the control channel); rewriting that argv to
// a harmless `bash -c 'printf …'` lets a spec show the page any bootc output
// (a staged update, a queued rollback, a registry error, a progress stream)
// while the host itself stays as it is. Same technique as auto-check.spec.js.
//
// rules: [{ match: argv => bool, script: '<bash>', args: [...] }]
// The first matching rule wins; `args` become $1, $2, … of the script.
// Every host-changing spawn no rule matches is blocked (BLOCK_MUTATIONS).
// Install before navigating to the module (page.goto), after login.

// Canned scripts. $1 is printed verbatim (printf %s, no escapes).
const PRINT = 'printf "%s" "$1"';
const FAIL = 'printf "%s" "$1" >&2; exit 1';

function argvText(argv) {
    return argv.join(' ');
}

// Last rule for specs that must not change the host: anything that would
// stage, switch, roll back, pin, delete, reboot or touch the timer fails
// instead of running, in case a fake above it doesn't match.
const MUTATING = /\bbootc (upgrade|switch|rollback|usr-overlay)\b|\bostree admin (pin|undeploy)\b|\bsystemctl (start|stop|mask|unmask|enable|disable|reboot)\b|\b(reboot|shutdown)\b/;
const BLOCK_MUTATIONS = {
    match: (argv, text) => MUTATING.test(text),
    script: 'echo "blocked by fake-spawn: host-changing command" >&2; exit 99',
};

async function fakeSpawns(page, rules, { log } = {}) {
    await page.routeWebSocket(/\/cockpit\/socket$/, ws => {
        const server = ws.connectToServer();
        const watched = new Set();
        const all = [...rules, BLOCK_MUTATIONS];
        ws.onMessage(message => {
            if (typeof message === 'string' && message.startsWith('\n{') && message.includes('"spawn"')) {
                const control = JSON.parse(message.slice(1));
                const rule = Array.isArray(control.spawn) && all.find(r => r.match(control.spawn, argvText(control.spawn)));
                if (rule) {
                    if (log) {
                        log.push({ channel: control.channel, argv: control.spawn });
                        watched.add(control.channel);
                    }
                    control.spawn = ['bash', '-c', rule.script, 'fake-spawn', ...(rule.args || [])];
                    message = '\n' + JSON.stringify(control);
                }
            }
            server.send(message);
        });
        server.onMessage(message => {
            // Record the data frames of faked channels, so a spec can show
            // how the output was actually chunked.
            if (log && typeof message === 'string') {
                const nl = message.indexOf('\n');
                if (nl > 0 && watched.has(message.slice(0, nl))) {
                    log.push({ channel: message.slice(0, nl), data: message.slice(nl + 1) });
                }
            }
            ws.send(message);
        });
    });
}

module.exports = { fakeSpawns, argvText, PRINT, FAIL };
