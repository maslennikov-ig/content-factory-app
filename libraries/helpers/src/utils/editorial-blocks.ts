/** The block syntax shared by the adaptation preview and the post renderer. */
export type EditorialBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

function parseEditorial(text: string): { blocks: EditorialBlock[]; visible: string } {
  const lines = (text || '').replace(/\r\n?/gu, '\n').split('\n');
  const blocks: EditorialBlock[] = [];
  const visible: string[] = [];
  let paragraph: string[] = [];
  let adjacentList = false;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  for (const line of lines) {
    if (!line.trim()) { visible.push(line); flush(); adjacentList = false; continue; }
    const heading = /^(#{1,6})[ \t]+(.+?)\s*$/u.exec(line);
    const list = /^(?:[-*][ \t]+|(\d+)\.[ \t]+)(\S.*)$/u.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      visible.push(heading[2]);
      adjacentList = false;
    } else if (list && (!list[1] || Number(list[1]) === 1 ||
      (adjacentList && blocks[blocks.length - 1]?.kind === 'list' &&
        (blocks[blocks.length - 1] as Extract<EditorialBlock, {kind: 'list'}>).ordered &&
        Number(list[1]) === (blocks[blocks.length - 1] as Extract<EditorialBlock, {kind: 'list'}>).items.length + 1))) {
      flush();
      const ordered = !!list[1];
      visible.push(list[2]);
      const last = blocks[blocks.length - 1];
      if (adjacentList && last?.kind === 'list' && last.ordered === ordered && (ordered ? Number(list[1]) === last.items.length + 1 : true)) last.items.push(list[2]);
      else blocks.push({ kind: 'list', ordered, items: [list[2]] });
      adjacentList = true;
    } else { paragraph.push(line); visible.push(line); adjacentList = false; }
  }
  flush();
  return { blocks, visible: visible.join('\n') };
}

export const editorialBlocks = (text: string): EditorialBlock[] => parseEditorial(text).blocks;

/** Remove only block markers the renderer recognises; preserve line boundaries. */
export const stripEditorialBlockMarks = (text: string): string => parseEditorial(text).visible;
