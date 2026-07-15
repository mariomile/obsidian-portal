import {
  FuzzySuggestModal,
  Modal,
  Notice,
  Setting,
  TFile,
  TFolder,
  type App,
  type TAbstractFile,
} from 'obsidian';
import { executeCommand } from '../obsidian-internals';

class PinItemModal extends FuzzySuggestModal<TAbstractFile> {
  constructor(app: App, private readonly onChoose: (path: string) => void) {
    super(app);
    this.setPlaceholder('Pin a note or folder…');
  }

  getItems(): TAbstractFile[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((file) => file instanceof TFile || (file instanceof TFolder && file.path !== ''));
  }

  getItemText(file: TAbstractFile): string {
    return file.path;
  }

  onChooseItem(file: TAbstractFile): void {
    this.onChoose(file.path);
  }
}

class CreateTagModal extends Modal {
  private value = '';

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl('h3', { text: 'Create tag' });
    this.contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'The tag will be added to the active note.',
    });

    new Setting(this.contentEl).setName('Tag').addText((text) => {
      text.setPlaceholder('e.g. project/portal').onChange((value) => {
        this.value = value;
      });
      text.inputEl.focus();
      text.inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') void this.create();
      });
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText('Create').setCta().onClick(() => void this.create()),
      )
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async create(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== 'md') {
      new Notice('Open a Markdown note before creating a tag.');
      return;
    }
    const tag = this.value.trim().replace(/^#+/, '').replace(/\s+/g, '-');
    if (!tag) {
      new Notice('Enter a tag name.');
      return;
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      const current = frontmatter.tags;
      const tags = Array.isArray(current)
        ? current.filter((item): item is string => typeof item === 'string')
        : typeof current === 'string' && current.trim()
          ? [current]
          : [];
      if (!tags.some((item) => item.replace(/^#/, '') === tag)) tags.push(tag);
      frontmatter.tags = tags;
    });
    new Notice(`Created tag #${tag}`);
    this.close();
  }
}

export function openPinItemModal(app: App, onChoose: (path: string) => void): void {
  new PinItemModal(app, onChoose).open();
}

export function openCreateTagModal(app: App): void {
  new CreateTagModal(app).open();
}

export function bookmarkCurrentView(app: App): void {
  if (!executeCommand(app, 'bookmarks:bookmark-current-view')) {
    new Notice('Enable the core Bookmarks plugin to add a bookmark.');
  }
}

export function createCollection(app: App): void {
  if (!executeCommand(app, 'superbasetags:create-supertag')) {
    new Notice('Install and enable SuperBaseTags to create a collection.');
  }
}
