import { useState, useEffect, useCallback, useRef } from 'react';
import { useFileSystem } from '@/kernel/fileSystem';
import { useWindowManager } from '@/kernel/windowManager';
import type { AppComponentProps } from '@/shared/types';
import './Notes.css';

const NOTES_DIR = '/home/Documents/Notes';

interface NoteFile {
  name: string;
  path: string;
  modifiedAt: number;
}

export default function Notes({ windowId }: AppComponentProps) {
  const fs = useFileSystem((s) => s.provider);
  const win = useWindowManager((s) => s.windows.find((w) => w.id === windowId));
  const openFilePath = (win?.metadata?.filePath as string) || null;

  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [activeNote, setActiveNote] = useState<string | null>(openFilePath);
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ensure notes directory exists and load notes
  const loadNotes = useCallback(async () => {
    try {
      const exists = await fs.exists(NOTES_DIR);
      if (!exists) {
        await fs.mkdir(NOTES_DIR);
      }
      const entries = await fs.list(NOTES_DIR);
      const noteFiles: NoteFile[] = entries
        .filter((e) => !e.isDirectory && e.name.endsWith('.txt'))
        .map((e) => ({ name: e.name.replace('.txt', ''), path: e.path, modifiedAt: e.modifiedAt }))
        .sort((a, b) => b.modifiedAt - a.modifiedAt);
      setNotes(noteFiles);
    } catch {
      // Directory may not exist; will be created on first note
    }
  }, [fs]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Load note content when selected
  useEffect(() => {
    if (!activeNote) return;
    (async () => {
      try {
        const data = await fs.read(activeNote);
        setContent(typeof data === 'string' ? data : '');
      } catch {
        setContent('');
      }
    })();
  }, [activeNote, fs]);

  // Auto-save with debounce
  const handleContentChange = useCallback(
    (text: string) => {
      setContent(text);
      setStatus('Editing...');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (!activeNote) return;
        try {
          await fs.write(activeNote, text);
          setStatus('Saved');
          loadNotes();
        } catch {
          setStatus('Save failed');
        }
      }, 800);
    },
    [activeNote, fs, loadNotes],
  );

  const handleNewNote = useCallback(async () => {
    const timestamp = Date.now();
    const name = `Note ${new Date(timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })}`;
    const path = `${NOTES_DIR}/${name}.txt`;
    try {
      const exists = await fs.exists(NOTES_DIR);
      if (!exists) await fs.mkdir(NOTES_DIR);
      await fs.write(path, '');
      setActiveNote(path);
      setContent('');
      loadNotes();
    } catch {
      // handle error
    }
  }, [fs, loadNotes]);

  const handleDeleteNote = useCallback(async () => {
    if (!activeNote) return;
    try {
      await fs.delete(activeNote);
      setActiveNote(null);
      setContent('');
      loadNotes();
    } catch {
      // handle error
    }
  }, [activeNote, fs, loadNotes]);

  const filteredNotes = search
    ? notes.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    : notes;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="notes-app">
      <div className="notes-sidebar">
        <div className="notes-sidebar__header">
          <span className="notes-sidebar__title">Notes</span>
          <button className="notes-sidebar__new-btn" onClick={handleNewNote} title="New Note">
            +
          </button>
        </div>
        <div className="notes-sidebar__search">
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="notes-sidebar__list">
          {filteredNotes.length === 0 ? (
            <div className="notes-sidebar__empty">
              {notes.length === 0 ? 'No notes yet' : 'No matches'}
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.path}
                className={`notes-sidebar__item ${activeNote === note.path ? 'notes-sidebar__item--active' : ''}`}
                onClick={() => setActiveNote(note.path)}
              >
                <span className="notes-sidebar__item-title">{note.name}</span>
                <span className="notes-sidebar__item-date">{formatDate(note.modifiedAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="notes-editor">
        {activeNote ? (
          <>
            <div className="notes-editor__toolbar">
              <span className="notes-editor__status">{status}</span>
              <button className="notes-editor__delete-btn" onClick={handleDeleteNote}>
                Delete
              </button>
            </div>
            <textarea
              className="notes-editor__textarea"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Start writing..."
              autoFocus
            />
          </>
        ) : (
          <div className="notes-editor__empty">
            Select a note or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
