// Configuration entry point: default export is intentional.
// Tracked by: https://github.com/DanhezCode/awesome-config/issues/1
// Blocked by: https://github.com/oxc-project/oxc/issues/25824
// oxlint-disable import/no-default-export

import cspellSettings from "awesome-config/cspell.config";

export default {
  ...cspellSettings,
  dictionaries: [...cspellSettings.dictionaries],
  words: [...cspellSettings.words, "prefresh", "pluginutils", "ampproject"],
};
