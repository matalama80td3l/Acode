import FileBrowser from '../pages/fileBrowser/fileBrowser';
import dialogs from '../components/dialogs';
import helpers from '../lib/utils/helpers';
import constants from './constants';
import recents from '../lib/recents';
import fsOperation from '../lib/fileSystem/fsOperation';
import Url from './utils/Url';
import openFolder from './openFolder';

/**
 *
 * @param {File} file
 * @param {boolean} [isSaveAs]
 */
async function saveFile(file, isSaveAs = false) {
  beautifyFile();
  let isNewFile = false;
  if (file.type === 'regular' && !file.uri) {
    isNewFile = true;
  } else if (file.uri) {
    isSaveAs = file.readOnly;
  }

  if (!isSaveAs && !isNewFile) {
    if (file.type === 'git') {
      const values = await dialogs.multiPrompt('Commit', [
        {
          id: 'message',
          placeholder: strings['commit message'],
          value: file.record.commitMessage,
          type: 'text',
          required: true,
        },
        {
          id: 'branch',
          placeholder: strings.branch,
          value: file.record.branch,
          type: 'text',
          required: true,
          hints: (cb) => {
            file.record.repository.listBranches().then((res) => {
              const data = res.data;
              const branches = [];
              data.map((branch) => branches.push(branch.name));
              cb(branches);
            });
          },
        },
      ]);

      if (!values.branch || !values.message) return;
      file.record.branch = values.branch;
      file.record.commitMessage = values.message;
      await file.record.setData(file.session.getValue());
      file.isUnsaved = false;
      editorManager.onupdate('save-file');
      return;
    }

    if (file.type === 'gist') {
      await file.record.setData(file.name, file.session.getValue());
      file.isUnsaved = false;
      editorManager.onupdate('save-file');
      return;
    }

    await save();
    return;
  }

  const option = await recents.select(
    [['select-folder', strings['select folder'], 'folder']],
    'dir',
    strings['select folder']
  );

  if (option === 'select-folder') {
    selectFolder();
    return;
  }
  const { url } = option.val;
  const filename = await check(url, file.filename);
  await save(url, filename);

  /**
   *
   * @param {String} [url]
   * @param {String & Override} [filename]
   */
  async function save(url, filename) {
    const data = file.session.getValue();
    let createFile = false || isSaveAs;
    let fs;

    if (url) {
      createFile = true;
    }
    if (filename && filename !== file.filename) {
      file.filename = filename;
      beautifyFile();
    }

    const $text = file.assocTile.querySelector('span.text');
    $text.textContent = strings.saving + '...';
    file.isSaving = true;

    try {
      if (createFile) {
        const fileUri = Url.join(url, file.filename);
        fs = fsOperation(fileUri);

        if (!(await fs.exists())) {
          const fs = fsOperation(url);
          await fs.createFile(file.filename);
        }

        const openedFile = editorManager.getFile(fileUri, 'uri');
        if (openedFile) openedFile.uri = null;
        file.type = 'regular';
        file.uri = fileUri;
        file.readOnly = false;
        editorManager.setSubText(file);
        recents.addFile(fileUri);
        updateFolders(url);
      }

      if (!fs) fs = fsOperation(file.uri);
      await fs.writeFile(data);
      updateFile();
    } catch (err) {
      error(err);
    }
    resetText();

    function updateFolders(dir) {
      const folder = openFolder.find(dir);
      if (folder) folder.reload();
    }

    function error(err) {
      helpers.error(err);
      console.error(err);
    }

    function resetText() {
      setTimeout(() => {
        $text.textContent = file.filename;
      }, editorManager.TIMEOUT_VALUE);
    }

    function updateFile() {
      if (file.location) {
        recents.addFolder(file.location);
      }

      if (window.saveTimeout) clearTimeout(window.saveTimeout);
      window.saveTimeout = setTimeout(() => {
        file.isSaving = false;
        file.isUnsaved = false;
        file.onsave();
        if (url) recents.addFile(file.uri);
        editorManager.onupdate('save-file');
        resetText();
      }, editorManager.TIMEOUT_VALUE + 100);
    }
  }

  async function selectFolder() {
    const dir = await FileBrowser(
      'folder',
      strings[`save file${isSaveAs ? ' as' : ''}`],
      strings['save here']
    );
    let { url } = dir;
    let filename;

    editorManager.editor.blur();
    url = file.location === url ? undefined : url;
    if (isSaveAs) {
      filename = await getfilename(url, file.filename);
    } else {
      filename = await check(url, file.filename);
    }

    if (filename) {
      save(url, filename);
    }
  }

  async function getfilename(url, name) {
    const filename = await dialogs.prompt(
      strings['enter file name'],
      name || '',
      strings['new file'],
      {
        match: constants.FILE_NAME_REGEX,
        required: true,
      }
    );

    if (filename) {
      return await check(url, filename);
    }
  }

  async function check(url, filename) {
    const pathname = Url.join(url, filename);

    const fs = fsOperation(pathname);
    if (await fs.exists()) {
      const action = await dialogs.select(strings['file already exists'], [
        ['overwrite', strings.overwrite],
        ['newname', strings['enter file name']],
      ]);

      if (action === 'newname') {
        filename = await getfilename(url, filename);
      }
    }

    return filename;
  }

  function beautifyFile(name) {
    const ext = helpers.extname(name || file.filename);
    const beautify = appSettings.value.beautify;
    if (beautify[0] !== '*' && beautify.indexOf(ext) < 0) {
      Acode.exec('format');
    }
  }
}

export default saveFile;
