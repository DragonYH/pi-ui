"""Verify direct native `pi` startup; fixtures and captures stay in this project."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time

REPO = Path(__file__).resolve().parent.parent
SCRATCH = REPO / '.pi'
SCRATCH.mkdir(exist_ok=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


cli = Path(shutil.which('pi')).resolve()
core = cli.parent
watched = [Path.home() / '.pi/agent/settings.json', cli]
watched += list((core / 'bundle/chunks').glob('*.js'))
watched += [core / 'core/extensions/loader.js', core / 'core/extensions/runner.js']
before = {path: digest(path) for path in watched}

with tempfile.TemporaryDirectory(prefix='native-startup-', dir=SCRATCH) as temporary:
    root = Path(temporary)
    observer = root / 'observer.ts'
    observer.write_text('''import { appendFileSync } from "node:fs";
import { InteractiveMode } from "@earendil-works/pi-coding-agent";
const key = Symbol.for("pi-ui:test:resource-snapshots");
const prototype = InteractiveMode.prototype;
if (!prototype[key]) {
  prototype[key] = true;
  const original = prototype.showLoadedResources;
  prototype.showLoadedResources = function(...args) {
    const result = original.apply(this, args);
    setTimeout(() => appendFileSync(process.env.PI_UI_TEST_RESOURCES, JSON.stringify({
      nativeAttached: this.documentContainer.children.includes(this.loadedResourcesContainer),
      header: this.customHeader?.render(150).join("\\n").replace(/\\x1b\\[[0-?]*[ -/]*[@-~]/g, ""),
    }) + "\\n"), 200);
    return result;
  };
}
export default function(pi) {
  let unsubscribe;
  pi.on("session_start", () => {
    const progress = globalThis["@rokiy/pi-ui:startup"];
    if (!progress) throw new Error("native startup bridge missing");
    const record = () => appendFileSync(process.env.PI_UI_TEST_EVENTS, JSON.stringify(progress.snapshot()) + "\\n");
    record();
    unsubscribe = progress.subscribe(record);
  });
  pi.on("session_shutdown", () => unsubscribe?.());
}
''')
    slow = root / 'slow-plugin.ts'
    slow.write_text('''export default async function(pi) {
  await new Promise(resolve => setTimeout(resolve, 100));
  pi.on("session_start", async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
  pi.on("session_start", async () => { await new Promise(resolve => setTimeout(resolve, 90)); });
}
''')
    broken = root / 'broken-plugin.ts'
    broken.write_text('export default function(pi) { pi.on("session_start", () => { throw new Error("intentional initialization fixture failure"); }); }\n')
    results = []
    for mode, failing, reload_run in [('regular', False, False), ('fullscreen', False, True), ('fullscreen', True, False)]:
        label = mode + ('-failure' if failing else '')
        agent = root / label
        agent.mkdir()
        extensions = [str(observer), str(slow), str(REPO / 'src/index.ts')]
        if failing:
            extensions += [str(broken)]
        (agent / 'settings.json').write_text(json.dumps({'lastChangelogVersion': '1.4.0', 'checkForUpdates': False, 'extensions': extensions}))
        for name in ['alpha', 'beta']:
            skill = agent / 'skills' / name
            skill.mkdir(parents=True)
            (skill / 'SKILL.md').write_text(f'---\nname: {name}\ndescription: fixture {name}\n---\nFixture.\n')
        events = root / f'{label}.jsonl'
        resources_file = root / f'{label}-resources.jsonl'
        commands = [] if failing else ['/new', '/new'] + (['/reload', '/new'] if reload_run else [])
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 45, 150, 0, 0))
        env = os.environ.copy()
        env.update({'PI_CODING_AGENT_DIR': str(agent), 'PI_OFFLINE': '1', 'TERM': 'xterm-256color', 'PI_UI_TEST_EVENTS': str(events), 'PI_UI_TEST_RESOURCES': str(resources_file), 'ANTHROPIC_API_KEY': 'startup-fixture-unused', 'JITI_FS_CACHE': '0'})
        # Ordinary settings load pi-ui LAST; no launcher and no explicit -e override.
        command = ['pi', '--offline', '--no-session', '--no-mcp', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-approve', '--tui-mode', mode]
        start = time.monotonic()
        process = subprocess.Popen(command, cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        capture = bytearray()
        commands_sent = 0
        finished = None
        snapshots = []
        resource_snapshots = []
        try:
            while time.monotonic() - start < 15 and process.poll() is None:
                ready, _, _ = select.select([master], [], [], .04)
                if ready:
                    try:
                        data = os.read(master, 65536)
                    except OSError:
                        break
                    if not data:
                        break
                    capture.extend(data)
                if events.exists():
                    snapshots = [json.loads(line) for line in events.read_text().splitlines()]
                if resources_file.exists():
                    resource_snapshots = [json.loads(line) for line in resources_file.read_text().splitlines()]
                final = snapshots[-1] if snapshots else None
                if final and not final['active'] and len(resource_snapshots) >= commands_sent + 1:
                    if finished is None:
                        finished = time.monotonic()
                    if time.monotonic() - finished > .3:
                        if not failing:
                            resources = resource_snapshots[-1]
                            assert not resources['nativeAttached'], f'{label}: native comma list returned after {commands[:commands_sent]}'
                            assert '[Skills] 2' in resources['header'], resources
                            assert all(f'• {name}' in resources['header'] for name in ['alpha', 'beta']), resources
                            assert re.search(r'\[Extensions\] \d+', resources['header']), resources
                            assert all(name in resources['header'] for name in ['observer', 'slow-plugin']), resources
                        if commands_sent < len(commands):
                            os.write(master, (commands[commands_sent] + '\r').encode())
                            commands_sent += 1
                            finished = None
                        else:
                            break
                elif final and final['active']:
                    finished = None
            if events.exists():
                snapshots = [json.loads(line) for line in events.read_text().splitlines()]
            (SCRATCH / f'native-startup-{label}.ansi').write_bytes(capture)
            (SCRATCH / f'native-startup-{label}.json').write_text(json.dumps(snapshots, ensure_ascii=False, indent=2))
            (SCRATCH / f'native-startup-{label}-resources.json').write_text(json.dumps(resource_snapshots, ensure_ascii=False, indent=2))
            assert commands_sent == len(commands) and len(resource_snapshots) == len(commands) + 1, f'{label}: session transitions did not finish'
            assert snapshots and not snapshots[-1]['active'], f'{label}: startup did not complete; see .pi/native-startup-{label}.ansi'
            final = snapshots[-1]
            row = next(entry for entry in final['entries'] if entry['name'] == 'slow-plugin')
            assert row['initializeMs'] >= 610, row
            assert all('importMs' not in entry and 'registerMs' not in entry for entry in final['entries'])
            assert snapshots[0]['entries'][0]['name'] == '@rokiy/pi-ui', snapshots[0]
            assert not any(entry['name'] == 'slow-plugin' for entry in snapshots[0]['entries']), 'later extensions must appear progressively'
            assert any(any(entry['state'] == 'initializing' for entry in item['entries']) for item in snapshots)
            plain = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', capture.decode(errors='replace'))
            assert '(init ' not in plain, f'{label}: completed initialization timings leaked into the welcome screen'
            assert 'show full startup help' not in plain, f'{label}: native onboarding flashed before pi-ui'
            assert '●'.encode() in capture, f'{label}: logo animation missing'
            assert len({item['frame'] for item in snapshots if item['active']}) >= 4
            if failing:
                assert any('intentional initialization fixture failure' in entry.get('error', '') for entry in final['entries'])
                assert 'intentional initialization fixture failure' in plain
            if reload_run:
                assert len({item['startedAt'] for item in snapshots}) >= 2, 'reload did not start a new timing run'
            result = {'mode': label, 'entry': 'pi', 'pi_ui_source_order': 'last', 'pi_ui_initialization_order': 'first', 'reload': reload_run, 'commands': commands, 'resource_snapshots': len(resource_snapshots), 'entries': len(final['entries']), 'slow_initialize_ms': round(row['initializeMs'])}
            results.append(result)
            print(json.dumps(result), flush=True)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=2)
            os.close(master)
    assert all(digest(path) == value for path, value in before.items()), 'An installed Pi file or global configuration changed'
    print('Installed Pi files and global settings: unchanged', flush=True)
    (SCRATCH / 'native-startup-verification.json').write_text(json.dumps(results, indent=2))
