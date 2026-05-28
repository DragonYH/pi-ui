import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function buildBorderLine(
  width: number,
  left: string,
  right: string,
  borderColor: (text: string) => string,
): string {
  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return borderColor(left);
  }

  return borderColor(`${left}${'─'.repeat(Math.max(0, width - 2))}${right}`);
}

function buildBoxedContentLine(
  width: number,
  content: string,
  borderColor: (text: string) => string,
): string {
  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return borderColor('│');
  }

  const innerWidth = Math.max(0, width - 2);
  const truncated = truncateToWidth(content, innerWidth);
  const padding = ' '.repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
  return `${borderColor('│')}${truncated}${padding}${borderColor('│')}`;
}

export class BoxedEditor extends CustomEditor {
  render(width: number): string[] {
    const innerWidth = Math.max(0, width - 2);
    const lines = super.render(innerWidth);
    if (lines.length < 2) {
      return lines;
    }

    const borderColor = (text: string) => this.borderColor(text);
    lines[0] = buildBorderLine(width, '╭', '╮', borderColor);
    lines[lines.length - 1] = buildBorderLine(width, '╰', '╯', borderColor);

    for (let index = 1; index < lines.length - 1; index += 1) {
      lines[index] = buildBoxedContentLine(width, lines[index], borderColor);
    }

    return lines;
  }
}
