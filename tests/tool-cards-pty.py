"""Exercise message/tool cards, expansion and /reload through native Pi terminals."""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time
import uuid

REPO = Path(__file__).resolve().parent.parent
SCRATCH = REPO / '.pi'
SCRATCH.mkdir(exist_ok=True)


def plain(data):
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', data.decode(errors='replace'))


with tempfile.TemporaryDirectory(prefix='tool-cards-', dir=SCRATCH) as temporary:
    root = Path(temporary)
    observer = root / 'observer.ts'
    observer.write_text('''import { appendFileSync } from "node:fs";
import { ExtensionRunner, InteractiveMode } from "@earendil-works/pi-coding-agent";
const key = Symbol.for("pi-ui:test:completed-reload-chat");
const prototype = InteractiveMode.prototype;
if (!prototype[key]) {
  const state = prototype[key] = {};
  const snapshot = (phase, host) => appendFileSync(process.env.PI_UI_TEST_CHAT, JSON.stringify({
    phase, chat: host.chatContainer.render(process.stdout.columns).join("\\n"),
  }) + "\\n");
  const invalidate = ExtensionRunner.prototype.invalidate;
  ExtensionRunner.prototype.invalidate = function(...args) {
    const result = invalidate.apply(this, args);
    if (state.host?.session.extensionRunner === this) snapshot("invalidated", state.host);
    return result;
  };
  const original = prototype.handleReloadCommand;
  prototype.handleReloadCommand = async function(...args) {
    state.host = this;
    try {
      const result = await original.apply(this, args);
      snapshot("ready", this);
      return result;
    } finally {
      state.host = undefined;
    }
  };
}
export default function() {}
''')
    for mode, columns in [('regular', 100), ('fullscreen', 52)]:
        agent = root / mode
        agent.mkdir()
        (agent / 'settings.json').write_text(json.dumps({
            'lastChangelogVersion': '1.4.0', 'checkForUpdates': False,
            'extensions': [str(observer), str(REPO / 'src/index.ts')],
            'themes': [str(REPO / 'themes/catppuccin-dark.json')], 'theme': 'catppuccin-dark',
        }))
        timestamp = int(time.time() * 1000)
        clock = time.strftime('%H:%M:%S', time.localtime(timestamp / 1000))

        def message_cards_visible(text):
            return (re.search(r'╭─ You ─+╮', text)
                    and re.search(r'╭─ Assistant ─+╮', text)
                    and re.search(rf'╰─+ {clock} ─╯', text)
                    and re.search(rf'╰─ {clock} ─+╯', text))
        usage = {key: 0 for key in ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens']}
        usage['cost'] = {key: 0 for key in ['input', 'output', 'cacheRead', 'cacheWrite', 'total']}
        session = root / f'{mode}.jsonl'
        entries = [{'type': 'session', 'version': 3, 'id': str(uuid.uuid4()), 'timestamp': '2026-08-04T00:00:00.000Z', 'cwd': str(root)}]
        messages = [
            {'role': 'user', 'content': 'Tool card display fixture', 'timestamp': timestamp},
            {'role': 'assistant', 'content': [{'type': 'toolCall', 'id': 'fixture-call', 'name': 'bash', 'arguments': {'command': 'printf "tool card preview"'}}],
             'api': 'openai-completions', 'provider': 'openai', 'model': 'gpt-4o-mini', 'usage': usage, 'stopReason': 'toolUse', 'timestamp': timestamp},
            {'role': 'toolResult', 'toolCallId': 'fixture-call', 'toolName': 'bash',
             'content': [{'type': 'text', 'text': '\n'.join(f'preview-row-{i:02}' for i in range(25))}],
             'details': {}, 'isError': False, 'durationMs': 1234, 'timestamp': timestamp},
            {'role': 'assistant', 'content': [{'type': 'text', 'text': 'Message card reply 中文 🧪'}],
             'api': 'openai-completions', 'provider': 'openai', 'model': 'gpt-4o-mini', 'usage': usage, 'stopReason': 'stop', 'timestamp': timestamp},
        ]
        parent = None
        for i, message in enumerate(messages):
            entry_id = f'entry-{i}'
            entries.append({'type': 'message', 'id': entry_id, 'parentId': parent, 'timestamp': '2026-08-04T00:00:00.000Z', 'message': message})
            parent = entry_id
        session.write_text(''.join(json.dumps(entry) + '\n' for entry in entries))
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 45, columns, 0, 0))
        snapshots_file = root / f'{mode}-reloads.jsonl'
        env = os.environ.copy()
        env.update({'PI_CODING_AGENT_DIR': str(agent), 'PI_OFFLINE': '1', 'TERM': 'xterm-256color', 'ANTHROPIC_API_KEY': 'display-fixture-unused', 'JITI_FS_CACHE': '0', 'PI_UI_TEST_CHAT': str(snapshots_file)})
        process = subprocess.Popen([
            'pi', '--offline', '--session', str(session), '--no-mcp', '--no-prompt-templates',
            '--no-context-files', '--no-approve', '--tui-mode', mode,
        ], cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        capture = bytearray()
        phase = 0
        phase_start = 0
        reloads = []
        snapshots = []
        started = time.monotonic()
        try:
            while time.monotonic() - started < 18 and process.poll() is None:
                ready, _, _ = select.select([master], [], [], .04)
                if ready:
                    try:
                        capture.extend(os.read(master, 65536))
                    except OSError:
                        break
                if snapshots_file.exists():
                    snapshots = [json.loads(line) for line in snapshots_file.read_text().splitlines()]
                    reloads = [snapshot for snapshot in snapshots if snapshot['phase'] == 'ready']
                text = plain(capture[phase_start:])
                expand_hint = re.search(r'ctrl\+o +expand', text)
                collapse_hint = re.search(r'ctrl\+o +fold', text)
                if phase == 0 and expand_hint and 'done' in text and message_cards_visible(text):
                    assert '21+ lines hidden' in text
                    assert '25 lines' not in text
                    assert 'preview-row-24' in text
                    phase = 1
                    phase_start = len(capture)
                    os.write(master, b'\x0f')
                elif phase == 1 and collapse_hint:
                    assert 'preview-row-00' in text, 'expansion lost the beginning of the result'
                    phase = 2
                    phase_start = len(capture)
                    os.write(master, b'\x0f')
                elif phase == 2 and expand_hint:
                    phase = 3
                    phase_start = len(capture)
                    os.write(master, b'/reload\r')
                elif phase == 3 and reloads:
                    if len(reloads) == 1:
                        phase_start = len(capture)
                        os.write(master, b'/reload\r')
                        phase = 4
                elif phase == 4 and len(reloads) == 2:
                    phase = 5
                    break
            (SCRATCH / f'tool-cards-{mode}.ansi').write_bytes(capture)
            (SCRATCH / f'tool-cards-{mode}-reloads.json').write_text(json.dumps(snapshots, ensure_ascii=False, indent=2))
            assert phase == 5, f'{mode}: phase {phase} failed; inspect .pi/tool-cards-{mode}.ansi'
            assert [snapshot['phase'] for snapshot in snapshots] == ['invalidated', 'ready'] * 2, f'{mode}: stale-context redraws were not exercised'
            assert process.poll() is None, f'{mode}: Pi exited during reload'
            assert 'uncaughtException' not in plain(capture), f'{mode}: uncaught reload error'
            for index, snapshot in enumerate(snapshots, 1):
                chat = plain(snapshot['chat'].encode())
                assert message_cards_visible(chat), f'{mode}: history cards lost after reload {index}; inspect .pi/tool-cards-{mode}-reloads.json'
                assert chat.count('╭─ You ') == 1 and chat.count('╭─ Assistant ') == 1, f'{mode}: reload {index} nested message frames'
                assert 'Tool card display' in chat
                assert 'Message card reply' in chat
                assert 'done' in chat and re.search(r'ctrl\+o +expand', chat), f'{mode}: tool card lost after reload {index}'
            print(json.dumps({'mode': mode, 'columns': columns, 'checks': ['resumed half-width user/assistant cards', 'recorded corner timestamps', 'resumed tool call', 'recorded duration', 'Ctrl+O expand', 'Ctrl+O collapse', 'stale-context redraws and completed history snapshots after two /reload commands']}), flush=True)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=2)
            os.close(master)
