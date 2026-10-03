const fs = require('fs');
const path = require('path');
const { withAndroidStyles, withDangerousMod } = require('expo/config-plugins');

module.exports = function withGoldenSystemBars(config) {
  config = withDangerousMod(config, ['android', (mod) => {
    const dest = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/assets/fonts');
    fs.mkdirSync(dest, { recursive: true });
    for (const name of ['StitchArabic.ttf', 'StitchArabicBold.ttf', 'StitchIcons.otf']) {
      const src = path.join(mod.modRequest.projectRoot, 'assets/fonts', name);
      if (!fs.existsSync(src)) throw new Error(`Required bundled Stitch font missing: ${name}`);
      fs.copyFileSync(src, path.join(dest, name));
    }
    // React Native selects _bold assets for any bold Text style.
    for (const family of ['StitchArabic', 'StitchArabicBold']) {
      fs.copyFileSync(path.join(dest, 'StitchArabicBold.ttf'), path.join(dest, family + '_bold.ttf'));
    }
    return mod;
  }]);
  return withAndroidStyles(config, (mod) => {
    const theme = mod.modResults.resources.style.find((style) => style.$.name === 'AppTheme');
    if (!theme) throw new Error('Android AppTheme is missing');
    theme.item = theme.item || [];
    const values = {
      'android:windowLightNavigationBar': 'false',
      'android:enforceNavigationBarContrast': 'false',
      'android:navigationBarColor': '#080C14',
    };
    for (const [name, value] of Object.entries(values)) {
      const item = theme.item.find((entry) => entry.$.name === name);
      if (item) item._ = value;
      else theme.item.push({ $: { name }, _: value });
    }
    return mod;
  });
};

