// Ground truth from the host under test, over SSH, for specs that need to
// check what bootc/systemd actually did rather than what the UI shows.
//
// The sudo password (COCKPIT_PASS) goes to `sudo -S` on stdin, never on a
// command line: an `echo '<pass>' | sudo -S` inside the ssh command string is
// visible in `ps` on both ends. Hosts with NOPASSWD sudo simply never read it.
const { execFileSync } = require('child_process');
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });

// Specs that change host state (stage/discard updates and rollbacks, switch
// images, pin/unpin, toggle the auto-update timer, create a /usr overlay) only
// run with BOOTC_DESTRUCTIVE=1. A plain `npm test` must leave the host alone.
const DESTRUCTIVE = process.env.BOOTC_DESTRUCTIVE === '1';
const DESTRUCTIVE_SKIP_REASON = 'changes host state; run with BOOTC_DESTRUCTIVE=1 to include it';

function sshHost() {
    return new URL(process.env.COCKPIT_URL).hostname;
}

function ssh(remoteCommand, { input } = {}) {
    const user = process.env.COCKPIT_USER;
    return execFileSync('ssh', [
        '-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes',
        `${user}@${sshHost()}`, remoteCommand,
    ], { input, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
}

// Run `remoteCommand` as root. Returns stdout even when the command exits
// non-zero (systemctl is-active/is-enabled do that for perfectly normal
// states), so callers compare output instead of catching.
function hostSudo(remoteCommand) {
    try {
        return ssh(`sudo -S -p '' ${remoteCommand}`, { input: (process.env.COCKPIT_PASS || '') + '\n' });
    } catch (ex) {
        if (ex.stdout) return ex.stdout.toString();
        throw ex;
    }
}

function bootcStatus() {
    return JSON.parse(hostSudo('bootc status --json')).status;
}

// { unitFileState, activeState } of the auto-update timer; needs no root.
function timerState() {
    const out = ssh('systemctl show --property=UnitFileState,ActiveState bootc-fetch-apply-updates.timer');
    const props = Object.fromEntries(out.trim().split('\n').map(l => l.split('=')));
    return { unitFileState: props.UnitFileState, activeState: props.ActiveState };
}

// The units that pull the timer in at boot (the image's /usr
// default.target.wants link shows up here); empty when nothing does.
function timerWantedBy() {
    return ssh('systemctl show --property=WantedBy --value bootc-fetch-apply-updates.timer').trim();
}

// Specs that stage a deployment (download, switch) must not run while the
// auto-update timer is active: its service is `bootc upgrade --apply`, and a
// run that finds anything staged applies it and reboots the host (happened
// 2026-11-04: a staged :1.0 was applied ~10 s after staging). Stop the timer
// for the run (`systemctl stop`, not mask) and start it again afterwards.
const TIMER_ACTIVE_SKIP_REASON = 'stages a deployment; stop bootc-fetch-apply-updates.timer first or its next run applies it and reboots';
function timerActive() {
    return timerState().activeState === 'active';
}

module.exports = {
    DESTRUCTIVE, DESTRUCTIVE_SKIP_REASON, TIMER_ACTIVE_SKIP_REASON,
    sshHost, hostSudo, bootcStatus, timerState, timerWantedBy, timerActive,
};
