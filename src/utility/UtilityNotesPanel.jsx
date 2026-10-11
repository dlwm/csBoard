import { useState } from 'react';
import { preferences } from '../platform/preferences.js';
import { localeForLanguage } from '../i18n.js';
import { compareUtilityLandingPlaces } from './landingPlace.js';
import { WorkspacePanel, WorkspaceTarget } from '../components/workspace/WorkspaceSlots.jsx';
import { UtilityArchiveTree } from '../components/ArchiveCollections.jsx';

// Utility Notes uses one left sidebar. Its actions share the folder toolbar,
// while model/view and playback controls remain in the workspace bottom bar.
// 道具速记只占左栏；常用操作放在新建文件夹左侧，视图和回放设置留在底栏。
export default function UtilityNotesPanel({ notes, folders, language, onCreateFolder, onDeleteFolder, onMove,
  onFocus, onClearFocus, onOpen, onAdd, t }) {
  const [sort,setSort] = useState(()=>preferences.getItem('csboard-utility-sort') === 'manual' ? 'manual' : 'landing');
  const compareItems = sort === 'landing' ? (a,b)=>compareUtilityLandingPlaces(a,b,localeForLanguage(language)) : null;
  const changeSort = event => { setSort(event.target.value); preferences.setItem('csboard-utility-sort',event.target.value); };
  return <WorkspacePanel className="utility-location-panel">
    <header><strong>{t('utilityNotes')}</strong><select className="utility-sort-select" aria-label={t('utilitySort')} title={t('utilitySort')} value={sort} onChange={changeSort}><option value="landing">{t('sortLandingPlace')}</option><option value="manual">{t('sortManual')}</option></select><span>{t('utilityCount', { count: notes.length })}</span></header>
    <UtilityArchiveTree notes={notes} folders={folders} language={language} onCreateFolder={onCreateFolder}
      onDeleteFolder={onDeleteFolder} onMove={onMove} compareItems={compareItems} onFocus={onFocus} onClearFocus={onClearFocus} onOpen={onOpen} t={t}
      toolbarActions={<><button type="button" onClick={onAdd}>{t('addUtilityNote')}</button><WorkspaceTarget slot="utility-actions" /></>} />
  </WorkspacePanel>;
}
