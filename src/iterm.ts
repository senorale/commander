import { execa } from 'execa';

/**
 * Return a map of tty → iTerm session name (what Claude sets as the tab title,
 * e.g. "⠂ Improve Commander CLI theming"). Empty on failure.
 * Single osascript call — cheap enough for the 2s refresh loop.
 */
export async function getITermSessionNames(): Promise<Record<string, string>> {
  const script = `
    tell application "iTerm2"
        set out to ""
        repeat with w in windows
            repeat with t in tabs of w
                repeat with sess in sessions of t
                    set out to out & (tty of sess) & (ASCII character 9) & (name of sess) & linefeed
                end repeat
            end repeat
        end repeat
        return out
    end tell
  `;
  try {
    const { stdout } = await execa('osascript', ['-e', script], {
      timeout: 3000,
      reject: false,
    });
    const out: Record<string, string> = {};
    for (const line of (stdout || '').split('\n')) {
      const idx = line.indexOf('\t');
      if (idx < 0) continue;
      const tty = line.slice(0, idx);
      const name = line.slice(idx + 1);
      if (tty) out[tty] = name;
    }
    return out;
  } catch {
    return {};
  }
}

/** Return contents of the iTerm2 session on `tty` (last `maxLines`). Empty on failure. */
export async function contentForTty(tty: string, maxLines = 400): Promise<string> {
  const script = `
    tell application "iTerm2"
        repeat with w in windows
            repeat with t in tabs of w
                repeat with sess in sessions of t
                    if tty of sess is "${tty}" then
                        return contents of sess
                    end if
                end repeat
            end repeat
        end repeat
    end tell
    return ""
  `;
  try {
    const { stdout } = await execa('osascript', ['-e', script], {
      timeout: 3000,
      reject: false,
    });
    const lines = (stdout || '').split('\n');
    return lines.length > maxLines ? lines.slice(-maxLines).join('\n') : lines.join('\n');
  } catch {
    return '';
  }
}

export interface SendResult {
  ok: boolean;
  detail: string;
}

/**
 * Type `text` (plus newline) into the iTerm session on `tty`.
 *
 * Two modes:
 *  - Short sends (≤2 chars): permission-prompt answers like "1"/"y". Sent
 *    literal + CR; NO Esc+i prefix (that would dismiss the prompt).
 *  - Longer sends: chat messages. Sent as Esc → 150ms → i<text> → 100ms → CR.
 *    Guarantees the vim-mode input area lands in INSERT before typing.
 */
export async function sendForTty(tty: string, text: string): Promise<SendResult> {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const body =
    text.length <= 2
      ? `
                        tell sess to write text ("${escaped}") newline NO
                        delay 0.05
                        tell sess to write text (ASCII character 13) newline NO
        `
      : `
                        tell sess to write text (ASCII character 27) newline NO
                        delay 0.15
                        tell sess to write text ("i" & "${escaped}") newline NO
                        delay 0.1
                        tell sess to write text (ASCII character 13) newline NO
        `;
  const script = `
    tell application "iTerm2"
        repeat with w in windows
            repeat with t in tabs of w
                repeat with sess in sessions of t
                    if tty of sess is "${tty}" then
                        ${body}
                        return "OK"
                    end if
                end repeat
            end repeat
        end repeat
    end tell
    return "MISS"
  `;
  try {
    const { stdout, stderr } = await execa('osascript', ['-e', script], {
      timeout: 3000,
      reject: false,
    });
    const out = (stdout || '').trim();
    const err = (stderr || '').trim();
    if (out === 'OK') return { ok: true, detail: 'sent' };
    return { ok: false, detail: err || out || `applescript returned ${out}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/** Focus the iTerm2 tab whose session has `tty`. Best-effort. */
export async function focusTty(tty: string): Promise<void> {
  const script = `
    tell application "iTerm2"
        activate
        repeat with w in windows
            repeat with t in tabs of w
                repeat with sess in sessions of t
                    if tty of sess is "${tty}" then
                        select sess
                        select t
                        select w
                        return
                    end if
                end repeat
            end repeat
        end repeat
    end tell
  `;
  await execa('osascript', ['-e', script], { reject: false });
}

/** Fallback focus by iTerm session unique id (recorded in lock file). */
export async function focusUniqueId(uniqueId: string): Promise<void> {
  const script = `
    tell application "iTerm2"
        repeat with w in windows
            repeat with t in tabs of w
                repeat with sess in sessions of t
                    if unique id of sess is "${uniqueId}" then
                        select sess
                        select t
                        select w
                        activate
                        return
                    end if
                end repeat
            end repeat
        end tell
    end tell
  `;
  await execa('osascript', ['-e', script], { reject: false });
}
