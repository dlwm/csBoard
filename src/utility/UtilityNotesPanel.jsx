import { WorkspacePanel, WorkspaceTarget } from '../components/workspace/WorkspaceSlots.jsx';
import { UtilityArchiveTree } from '../components/ArchiveCollections.jsx';

// Utility Notes uses one left sidebar. Its actions share the folder toolbar,
// while model/view and playback controls remain in the workspace bottom bar.
// 道具速记只占左栏；常用操作放在新建文件夹左侧，视图和回放设置留在底栏。
export default function UtilityNotesPanel({ notes, folders, language, onCreateFolder, onDeleteFolder, onMove,
  onFocus, onClearFocus, onOpen, onAdd, t }) {
  return <WorkspacePanel className="utility-location-panel">
    <header><strong>{t('utilityNotes')}</strong><span>{t('utilityCount', { count: notes.length })}</span></header>
    <UtilityArchiveTree notes={notes} folders={folders} language={language} onCreateFolder={onCreateFolder}
      onDeleteFolder={onDeleteFolder} onMove={onMove} onFocus={onFocus} onClearFocus={onClearFocus} onOpen={onOpen} t={t}
      toolbarActions={<><button type="button" onClick={onAdd}>{t('addUtilityNote')}</button><WorkspaceTarget slot="utility-actions" /></>} />
  </WorkspacePanel>;
}
