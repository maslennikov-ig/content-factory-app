import { MAX_HISTORY_ENTRIES } from './bounds';

const copy = <T>(value: T): T => structuredClone(value);

export class EditorHistory<T> {
  private entries: { value: T; group?: string; revision: number }[];
  private cursor = 0;
  private nextRevision = 1;

  constructor(initial: T) {
    this.entries = [{ value: copy(initial), revision: 0 }];
  }
  get length() {
    return this.entries.length;
  }
  get canUndo() {
    return this.cursor > 0;
  }
  get canRedo() {
    return this.cursor < this.entries.length - 1;
  }
  get revision() {
    return this.entries[this.cursor].revision;
  }
  current() {
    return copy(this.entries[this.cursor].value);
  }
  push(value: T, group?: string) {
    this.entries = this.entries.slice(0, this.cursor + 1);
    const previous = this.entries.at(-1);
    if (group && previous?.group === group) previous.value = copy(value);
    else
      this.entries.push({
        value: copy(value),
        group,
        revision: this.nextRevision++,
      });
    if (this.entries.length > MAX_HISTORY_ENTRIES) this.entries.shift();
    this.cursor = this.entries.length - 1;
  }
  undo() {
    if (this.canUndo) this.cursor -= 1;
    return this.current();
  }
  redo() {
    if (this.canRedo) this.cursor += 1;
    return this.current();
  }
}
